use crate::cli::executor::{container_cmd, CliExecutor, EXTENDED_PATH};
use crate::cli::types::{
    EnvVarEntry, NamedVolume, Project, ProjectEnvBinding, ProjectNetwork,
    ProjectTypeDetection, ProjectWithStatus, ProjectsConfig, Service, ServiceStatus, VolumeMount,
};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

// ─── Restart Monitor ────────────────────────────────────────────────────────
// Apple Container CLI does not support --restart. We implement restart
// policies at the application level by polling container status.

fn restart_registry() -> &'static Mutex<HashMap<String, String>> {
    static INSTANCE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();
    INSTANCE.get_or_init(|| Mutex::new(HashMap::new()))
}

/// Register a container for restart monitoring and spawn a background task.
fn spawn_restart_monitor(container_name: String, policy: String) {
    {
        let mut reg = restart_registry().lock().unwrap();
        reg.insert(container_name.clone(), policy.clone());
    }

    tokio::spawn(async move {
        loop {
            tokio::time::sleep(std::time::Duration::from_secs(5)).await;

            // Check if still registered
            {
                let reg = restart_registry().lock().unwrap();
                if !reg.contains_key(&container_name) {
                    break;
                }
            }

            // Check container status
            let all = list_all_containers().await;
            let status = all
                .iter()
                .find(|(name, _)| name == &container_name)
                .map(|(_, s)| s.as_str());

            match status {
                Some("running") => continue,
                Some(_) => {
                    // Container exists but stopped/exited — restart based on policy
                    let should_restart = match policy.as_str() {
                        "always" | "unless-stopped" => true,
                        "on-failure" => true, // Apple Container doesn't expose exit codes easily
                        _ => false,
                    };
                    if should_restart {
                        let _ =
                            CliExecutor::run(container_cmd(), &["start", &container_name]).await;
                    } else {
                        break;
                    }
                }
                None => {
                    // Container removed — stop monitoring
                    restart_registry()
                        .lock()
                        .unwrap()
                        .remove(&container_name);
                    break;
                }
            }
        }
    });
}

/// Unregister containers for a project from restart monitoring.
fn stop_restart_monitors_for_project(project: &Project) {
    let mut reg = restart_registry().lock().unwrap();
    if project.services.is_empty() {
        let name = format!(
            "acd-project-{}",
            project.id.chars().take(8).collect::<String>()
        );
        reg.remove(&name);
    } else {
        for svc in &project.services {
            reg.remove(&svc.name);
        }
    }
}

fn config_path() -> Result<std::path::PathBuf, String> {
    let config_dir = dirs::config_dir().ok_or("Cannot find config directory")?;
    let app_dir = config_dir.join("apple-container-desktop");
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create config dir: {}", e))?;
    Ok(app_dir.join("projects.json"))
}

/// Migrate config from old `~/.config/colima-desktop/` to `~/.config/apple-container-desktop/`.
/// Copies files only if the new directory is empty and the old directory exists.
fn migrate_legacy_config() {
    let config_dir = match dirs::config_dir() {
        Some(d) => d,
        None => return,
    };

    let old_dir = config_dir.join("colima-desktop");
    let new_dir = config_dir.join("apple-container-desktop");

    if !old_dir.exists() {
        return;
    }

    // Only migrate if the new config dir is missing or empty (no projects.json yet)
    let new_projects = new_dir.join("projects.json");
    if new_projects.exists() {
        return;
    }

    let _ = std::fs::create_dir_all(&new_dir);

    // Copy all files from old dir to new dir
    if let Ok(entries) = std::fs::read_dir(&old_dir) {
        for entry in entries.flatten() {
            let src = entry.path();
            if src.is_file() {
                if let Some(name) = src.file_name() {
                    let dst = new_dir.join(name);
                    if !dst.exists() {
                        let _ = std::fs::copy(&src, &dst);
                    }
                }
            }
        }
    }
}

pub fn load_projects() -> Result<Vec<Project>, String> {
    migrate_legacy_config();
    let path = config_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {}", e))?;
    let config: ProjectsConfig =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse config: {}", e))?;
    Ok(config.projects)
}

pub fn save_projects(projects: &[Project]) -> Result<(), String> {
    let path = config_path()?;
    let config = ProjectsConfig {
        projects: projects.to_vec(),
    };
    let content =
        serde_json::to_string_pretty(&config).map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(&path, content).map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}

pub fn find_project(projects: &[Project], id: &str) -> Result<Project, String> {
    projects
        .iter()
        .find(|p| p.id == id)
        .cloned()
        .ok_or_else(|| "Project not found".to_string())
}

/// Resolve environment variables for a project from the global env store.
fn resolve_project_env(project: &Project) -> Result<Vec<(String, String)>, String> {
    let binding = &project.env_binding;
    let profile_id = match &binding.profile_id {
        Some(id) => id.clone(),
        None => return Ok(Vec::new()),
    };

    let all_vars = crate::commands::env_store::load_and_resolve_profile(&profile_id)?;

    let selected: Vec<(String, String)> = all_vars
        .into_iter()
        .filter(|var| {
            if binding.select_all {
                !binding.excluded_keys.contains(&var.key)
            } else {
                binding.selected_keys.contains(&var.key)
            }
        })
        .map(|var| (var.key, var.value))
        .collect();

    Ok(selected)
}

pub async fn get_project_status(project: Project) -> ProjectWithStatus {
    if project.services.is_empty() {
        let (status, container_ids) = get_dockerfile_status(&project).await;
        project.with_status(status, container_ids, vec![])
    } else {
        let (status, container_ids, svc_statuses) = get_multi_service_status(&project).await;
        project.with_status(status, container_ids, svc_statuses)
    }
}

#[tauri::command]
pub async fn detect_project_type(workspace_path: String) -> Result<ProjectTypeDetection, String> {
    let path = std::path::Path::new(&workspace_path);
    if !path.exists() {
        return Err("Path does not exist".to_string());
    }

    let mut dockerfiles = Vec::new();
    let mut dotenv_files = Vec::new();

    let dockerfile_names = [
        "Dockerfile",
        "dockerfile",
        "Dockerfile.dev",
        "Dockerfile.development",
    ];
    for name in &dockerfile_names {
        if path.join(name).exists() {
            dockerfiles.push(name.to_string());
        }
    }

    // Scan for .env files
    let env_names = [".env", ".env.local", ".env.development", ".env.dev"];
    for name in &env_names {
        if path.join(name).exists() {
            dotenv_files.push(name.to_string());
        }
    }

    Ok(ProjectTypeDetection {
        has_dockerfile: !dockerfiles.is_empty(),
        dockerfiles,
        dotenv_files,
    })
}

#[tauri::command]
pub async fn list_projects() -> Result<Vec<ProjectWithStatus>, String> {
    let projects = load_projects()?;
    let mut result = Vec::new();

    for project in projects {
        if !std::path::Path::new(&project.workspace_path).exists() {
            result.push(mask_project_with_status_secrets(
                project.with_status("path_missing".to_string(), vec![], vec![]),
            ));
            continue;
        }

        if project.services.is_empty() {
            let (status, container_ids) = get_dockerfile_status(&project).await;
            result.push(mask_project_with_status_secrets(
                project.with_status(status, container_ids, vec![]),
            ));
        } else {
            let (status, container_ids, svc_statuses) =
                get_multi_service_status(&project).await;
            result.push(mask_project_with_status_secrets(
                project.with_status(status, container_ids, svc_statuses),
            ));
        }
    }

    Ok(result)
}

/// Mask secret values in ProjectWithStatus for frontend display.
fn mask_project_with_status_secrets(mut pws: ProjectWithStatus) -> ProjectWithStatus {
    for var in &mut pws.env_vars {
        if var.secret {
            var.value = "••••••••".to_string();
        }
    }
    pws
}

/// List all containers via `container list -a --format json` and return (id, status) pairs.
async fn list_all_containers() -> Vec<(String, String)> {
    use crate::cli::types::ContainerListEntry;
    let entries: Vec<ContainerListEntry> = match CliExecutor::run_json_array(
        container_cmd(),
        &["list", "-a", "--format", "json"],
    )
    .await
    {
        Ok(v) => v,
        Err(_) => return Vec::new(),
    };
    entries
        .into_iter()
        .filter_map(|e| {
            let id = e.configuration.as_ref()?.id.clone();
            if id.is_empty() {
                return None;
            }
            Some((id, e.status))
        })
        .collect()
}

async fn get_dockerfile_status(project: &Project) -> (String, Vec<String>) {
    let container_name = format!(
        "acd-project-{}",
        project.id.chars().take(8).collect::<String>()
    );
    let all = list_all_containers().await;
    parse_container_status_from_list(&all, &container_name)
}

fn parse_container_status_from_list(
    containers: &[(String, String)],
    name_prefix: &str,
) -> (String, Vec<String>) {
    let mut ids = Vec::new();
    let mut any_running = false;
    let mut any_container = false;

    for (id, status) in containers {
        if id == name_prefix || id.starts_with(&format!("{}-", name_prefix)) {
            any_container = true;
            ids.push(id.clone());
            if status == "running" {
                any_running = true;
            }
        }
    }

    let status = if any_running {
        "running"
    } else if any_container {
        "stopped"
    } else {
        "not_created"
    };

    (status.to_string(), ids)
}

#[tauri::command]
pub async fn add_project(
    name: String,
    workspace_path: String,
    dockerfile: Option<String>,
) -> Result<ProjectWithStatus, String> {
    let path = std::path::Path::new(&workspace_path);
    if !path.exists() {
        return Err("Path does not exist".to_string());
    }

    let mut projects = load_projects()?;
    if projects.iter().any(|p| p.workspace_path == workspace_path) {
        return Err("This project path is already registered".to_string());
    }

    let project = Project {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        workspace_path,
        project_type: "dockerfile".to_string(),
        env_vars: Vec::new(),
        dotenv_path: None,
        remote_debug: false,
        debug_port: 9229,
        dockerfile,
        env_command: None,
        ports: Vec::new(),
        startup_command: None,
        active_profile: "default".to_string(),
        profiles: vec!["default".to_string()],
        infisical_config: None,
        env_binding: ProjectEnvBinding::default(),
        domain: None,
        dns_domain: None,
        dns_hostname: None,
        image: None,
        network: None,
        init_commands: Vec::new(),
        volumes: Vec::new(),
        watch_mode: true,
        cpus: None,
        memory: None,
        services: Vec::new(),
        project_networks: Vec::new(),
        named_volumes: Vec::new(),
    };

    projects.push(project.clone());
    save_projects(&projects)?;

    Ok(mask_project_with_status_secrets(
        project.with_status("not_created".to_string(), vec![], vec![]),
    ))
}

#[tauri::command]
pub async fn update_project(mut project: Project) -> Result<(), String> {
    let mut projects = load_projects()?;
    if let Some(existing) = projects.iter_mut().find(|p| p.id == project.id) {
        // Preserve env_vars from disk -- the frontend receives masked secrets
        // ("••••••••") via list_projects, so blindly overwriting would corrupt
        // the real values.  Env vars are managed by dedicated commands
        // (set_env_var, remove_env_var, bulk_import_env, etc.).
        project.env_vars = existing.env_vars.clone();
        *existing = project;
    } else {
        return Err("Project not found".to_string());
    }
    save_projects(&projects)
}

#[tauri::command]
pub async fn remove_project(id: String, stop_containers: bool) -> Result<(), String> {
    let mut projects = load_projects()?;
    let project = find_project(&projects, &id)?;

    if stop_containers {
        let _ = stop_project_containers(&project).await;
    }

    projects.retain(|p| p.id != id);
    save_projects(&projects)
}

async fn stop_project_containers(project: &Project) -> Result<(), String> {
    // Unregister restart monitors first so they don't revive stopped containers
    stop_restart_monitors_for_project(project);

    let prefix = project.id.chars().take(8).collect::<String>();
    if project.services.is_empty() {
        let container_name = format!("acd-project-{}", prefix);
        let _ = CliExecutor::run(container_cmd(), &["rm", "-f", &container_name]).await;
    } else {
        for svc in &project.services {
            let container_name = svc.name.clone();
            let _ = CliExecutor::run(container_cmd(), &["rm", "-f", &container_name]).await;
        }
    }
    Ok(())
}

async fn collect_env_args(
    project: &Project,
    app: &AppHandle,
    event_name: &str,
) -> Result<Vec<String>, String> {
    let mut env_args = Vec::new();

    // Load dotenv file if specified
    if let Some(ref dotenv_path) = project.dotenv_path {
        let full_path = if std::path::Path::new(dotenv_path).is_absolute() {
            dotenv_path.clone()
        } else {
            format!("{}/{}", project.workspace_path, dotenv_path)
        };
        if std::path::Path::new(&full_path).exists() {
            if let Ok(content) = std::fs::read_to_string(&full_path) {
                for line in content.lines() {
                    let line = line.trim();
                    if line.is_empty() || line.starts_with('#') {
                        continue;
                    }
                    if line.contains('=') {
                        env_args.push("-e".to_string());
                        env_args.push(line.to_string());
                    }
                }
            }
        }
    }

    // Run env_command if specified -- fetch fresh secrets every time
    if let Some(ref cmd) = project.env_command {
        if !cmd.trim().is_empty() {
            let _ = app.emit(event_name, format!("Fetching env vars: {}", cmd));
            let output = Command::new("sh")
                .args(["-c", cmd])
                .current_dir(&project.workspace_path)
                .env("PATH", &*EXTENDED_PATH)
                .output()
                .await
                .map_err(|e| format!("env_command failed to execute: {}", e))?;

            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr);
                let _ = app.emit(event_name, format!("env_command failed: {}", stderr.trim()));
                return Err(format!("env_command failed: {}", stderr.trim()));
            }

            let stdout = String::from_utf8_lossy(&output.stdout);
            let mut count = 0u32;
            for line in stdout.lines() {
                let line = line.trim();
                if line.is_empty() || line.starts_with('#') {
                    continue;
                }
                if let Some(eq_pos) = line.find('=') {
                    let key = line[..eq_pos].trim();
                    if !key.is_empty() {
                        env_args.push("-e".to_string());
                        env_args.push(line.to_string());
                        count += 1;
                    }
                }
            }
            let _ = app.emit(
                event_name,
                format!("Loaded {} env vars from command", count),
            );
        }
    }

    // Add manual env vars for active profile (these override dotenv and command)
    // Decrypt secret values in-memory before passing to CLI
    for var in &project.env_vars {
        if var.profile == project.active_profile && !var.secret {
            env_args.push("-e".to_string());
            env_args.push(format!("{}={}", var.key, var.value));
        } else if var.profile == project.active_profile && var.secret {
            let decrypted = if crate::crypto::is_encrypted(&var.value) {
                crate::crypto::decrypt(&var.value)?
            } else {
                var.value.clone()
            };
            env_args.push("-e".to_string());
            env_args.push(format!("{}={}", var.key, decrypted));
        }
    }

    Ok(env_args)
}

#[tauri::command]
pub async fn project_up(app: AppHandle, id: String) -> Result<(), String> {
    let projects = load_projects()?;
    let mut project = find_project(&projects, &id)?;
    let event_name = format!("docker-project-log-{}", project.id);

    // Auto-sync Infisical if configured
    if let Some(ref config) = project.infisical_config {
        if config.auto_sync {
            let _ = app.emit(&event_name, "Syncing secrets from Infisical...");
            match crate::commands::env_secrets::sync_infisical(id.clone()).await {
                Ok(entries) => {
                    let _ = app.emit(
                        &event_name,
                        format!("Synced {} secrets from Infisical", entries.len()),
                    );
                    // Reload project after sync updated it
                    let projects = load_projects()?;
                    project = find_project(&projects, &id)?;
                }
                Err(e) => {
                    let _ = app.emit(&event_name, format!("Infisical sync warning: {}", e));
                }
            }
        }
    }

    // Create compose-level networks
    for net in &project.project_networks {
        let _ = app.emit(&event_name, format!("Creating network: {}", net.name));
        let mut args = vec!["network", "create"];
        let driver_val;
        if let Some(ref d) = net.driver {
            if !d.is_empty() && d != "bridge" {
                driver_val = d.clone();
                args.push("--driver");
                args.push(&driver_val);
            }
        }
        args.push(&net.name);
        let _ = CliExecutor::run(container_cmd(), &args).await;
    }

    // Create compose-level volumes
    for vol in &project.named_volumes {
        let _ = app.emit(&event_name, format!("Creating volume: {}", vol.name));
        let mut args = vec!["volume", "create"];
        let driver_val;
        if let Some(ref d) = vol.driver {
            if !d.is_empty() && d != "local" {
                driver_val = d.clone();
                args.push("--driver");
                args.push(&driver_val);
            }
        }
        args.push(&vol.name);
        let _ = CliExecutor::run(container_cmd(), &args).await;
    }

    if project.services.is_empty() {
        dockerfile_up(&app, &project, &event_name).await?;
    } else {
        multi_service_up(&app, &project, &event_name).await?;
    }

    Ok(())
}

async fn run_init_commands(
    app: &AppHandle,
    project: &Project,
    event_name: &str,
) -> Result<(), String> {
    for (i, cmd) in project.init_commands.iter().enumerate() {
        let cmd = cmd.trim();
        if cmd.is_empty() {
            continue;
        }
        let _ = app.emit(
            event_name,
            format!("Running init command [{}/{}]: {}", i + 1, project.init_commands.len(), cmd),
        );

        let mut child = Command::new("sh")
            .args(["-c", cmd])
            .current_dir(&project.workspace_path)
            .env("PATH", &*EXTENDED_PATH)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to run init command '{}': {}", cmd, e))?;

        stream_child_output(app, &mut child, event_name).await?;

        let status = child
            .wait()
            .await
            .map_err(|e| format!("Failed to wait for init command: {}", e))?;

        if !status.success() {
            let _ = app.emit(event_name, format!("Init command failed: {}", cmd));
            let _ = app.emit(event_name, "[done]");
            return Err(format!("Init command failed: {}", cmd));
        }
    }
    Ok(())
}

fn build_volume_args(project: &Project) -> Vec<String> {
    let mut args = Vec::new();

    // Watch mode: mount workspace → /app
    if project.watch_mode {
        args.push("-v".to_string());
        args.push(format!("{}:/app", project.workspace_path));
        args.push("-w".to_string());
        args.push("/app".to_string());
    }

    // Additional volume mounts
    for vol in &project.volumes {
        if vol.source.trim().is_empty() || vol.target.trim().is_empty() {
            continue;
        }
        args.push("-v".to_string());
        let mut mount_str = format!("{}:{}", vol.source.trim(), vol.target.trim());
        if vol.readonly {
            mount_str.push_str(":ro");
        }
        args.push(mount_str);
    }

    args
}

async fn dockerfile_up(
    app: &AppHandle,
    project: &Project,
    event_name: &str,
) -> Result<(), String> {
    let container_name = format!(
        "acd-project-{}",
        project.id.chars().take(8).collect::<String>()
    );

    // 1. Run init commands on host
    if !project.init_commands.is_empty() {
        run_init_commands(app, project, event_name).await?;
    }

    // 2. Resolve image: use existing image or build from Dockerfile
    let image_tag = if let Some(ref img) = project.image {
        if !img.trim().is_empty() {
            let _ = app.emit(event_name, format!("Using image: {}", img));
            img.trim().to_string()
        } else {
            build_dockerfile_image(app, project, event_name).await?
        }
    } else {
        build_dockerfile_image(app, project, event_name).await?
    };

    // 3. Remove existing container if any
    let _ = CliExecutor::run(container_cmd(), &["rm", "-f", &container_name]).await;

    // 4. Run container
    let _ = app.emit(event_name, "Starting container...");

    let mut run_args = vec![
        "run".to_string(),
        "-d".to_string(),
        "--name".to_string(),
        container_name.clone(),
        "--label".to_string(),
        format!("com.acd.project={}", project.name),
    ];

    // Volume mounts (watch mode + additional)
    run_args.extend(build_volume_args(project));

    // Resource limits (CPU / Memory)
    if let Some(ref c) = project.cpus {
        if !c.is_empty() {
            run_args.push("--cpus".to_string());
            run_args.push(c.clone());
        }
    }
    if let Some(ref m) = project.memory {
        if !m.is_empty() {
            run_args.push("--memory".to_string());
            run_args.push(m.clone());
        }
    }

    // Network
    if let Some(ref net) = project.network {
        if !net.trim().is_empty() {
            run_args.push("--network".to_string());
            run_args.push(net.trim().to_string());
        }
    }

    // Add env vars
    run_args.extend(collect_env_args(project, app, event_name).await?);

    // Add global env store vars
    let global_pairs = resolve_project_env(project)?;
    for (key, value) in &global_pairs {
        run_args.push("-e".to_string());
        run_args.push(format!("{}={}", key, value));
    }

    // Add port mappings
    for port in &project.ports {
        if !port.trim().is_empty() {
            run_args.push("-p".to_string());
            run_args.push(port.trim().to_string());
        }
    }

    // Add debug port if enabled
    if project.remote_debug {
        run_args.push("-p".to_string());
        run_args.push(format!("{}:{}", project.debug_port, project.debug_port));
    }

    run_args.push(image_tag);

    // Add startup command if specified
    if let Some(ref cmd) = project.startup_command {
        if !cmd.trim().is_empty() {
            for part in cmd.split_whitespace() {
                run_args.push(part.to_string());
            }
        }
    }

    let str_args: Vec<&str> = run_args.iter().map(|s| s.as_str()).collect();

    let mut run_child = Command::new(container_cmd())
        .args(&str_args)
        .env("PATH", &*EXTENDED_PATH)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn container run: {}", e))?;

    stream_child_output(app, &mut run_child, event_name).await?;

    let run_status = run_child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait: {}", e))?;

    let _ = app.emit(event_name, "[done]");

    if !run_status.success() {
        return Err("Container run failed. Check logs.".to_string());
    }

    Ok(())
}

async fn build_dockerfile_image(
    app: &AppHandle,
    project: &Project,
    event_name: &str,
) -> Result<String, String> {
    let dockerfile = project.dockerfile.as_deref().unwrap_or("Dockerfile");
    let image_tag = format!(
        "acd-project-{}",
        project.name.to_lowercase().replace(' ', "-")
    );

    let _ = app.emit(event_name, "Building container image...");

    let mut build_child = Command::new(container_cmd())
        .args(["build", "-t", &image_tag, "-f", dockerfile, "."])
        .current_dir(&project.workspace_path)
        .env("PATH", &*EXTENDED_PATH)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn container build: {}", e))?;

    stream_child_output(app, &mut build_child, event_name).await?;

    let build_status = build_child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait: {}", e))?;

    if !build_status.success() {
        let _ = app.emit(event_name, "[done]");
        return Err("Container build failed. Check logs.".to_string());
    }

    Ok(image_tag)
}

#[tauri::command]
pub async fn project_stop(id: String) -> Result<(), String> {
    let projects = load_projects()?;
    let project = find_project(&projects, &id)?;

    // Unregister restart monitors before stopping
    stop_restart_monitors_for_project(&project);

    let prefix = project.id.chars().take(8).collect::<String>();

    if project.services.is_empty() {
        let container_name = format!("acd-project-{}", prefix);
        CliExecutor::run(container_cmd(), &["stop", &container_name]).await?;
    } else {
        for svc in &project.services {
            let container_name = svc.name.clone();
            let _ = CliExecutor::run(container_cmd(), &["stop", &container_name]).await;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn project_logs(app: AppHandle, id: String) -> Result<(), String> {
    let projects = load_projects()?;
    let project = find_project(&projects, &id)?;
    let event_name = format!("docker-project-log-{}", project.id);

    let (_, container_ids) = get_dockerfile_status(&project).await;

    if let Some(cid) = container_ids.first() {
        let mut child = Command::new(container_cmd())
            .args(["logs", "-f", "--tail", "200", cid])
            .env("PATH", &*EXTENDED_PATH)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| format!("Failed to spawn: {}", e))?;

        stream_child_output(&app, &mut child, &event_name).await?;
        let _ = child.wait().await;
    } else {
        return Err("No running container found".to_string());
    }

    let _ = app.emit(&event_name, "[done]");
    Ok(())
}

#[tauri::command]
pub async fn load_dotenv_file(file_path: String) -> Result<Vec<EnvVarEntry>, String> {
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let mut entries = Vec::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some(eq_pos) = line.find('=') {
            let key = line[..eq_pos].trim().to_string();
            let mut value = line[eq_pos + 1..].trim().to_string();
            // Strip surrounding quotes
            if (value.starts_with('"') && value.ends_with('"'))
                || (value.starts_with('\'') && value.ends_with('\''))
            {
                value = value[1..value.len() - 1].to_string();
            }
            entries.push(EnvVarEntry {
                key,
                value,
                source: "dotenv".to_string(),
                secret: false,
                profile: "default".to_string(),
            });
        }
    }

    Ok(entries)
}

#[tauri::command]
pub async fn run_env_command(
    command: String,
    workspace_path: String,
) -> Result<Vec<EnvVarEntry>, String> {
    let output = Command::new("sh")
        .args(["-c", &command])
        .current_dir(&workspace_path)
        .env("PATH", &*EXTENDED_PATH)
        .output()
        .await
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Command failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut entries = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some(eq_pos) = line.find('=') {
            let key = line[..eq_pos].trim().to_string();
            if key.is_empty() {
                continue;
            }
            let mut value = line[eq_pos + 1..].trim().to_string();
            // Strip surrounding quotes
            if (value.starts_with('"') && value.ends_with('"'))
                || (value.starts_with('\'') && value.ends_with('\''))
            {
                value = value[1..value.len() - 1].to_string();
            }
            entries.push(EnvVarEntry {
                key,
                value,
                source: "command".to_string(),
                secret: false,
                profile: "default".to_string(),
            });
        }
    }

    if entries.is_empty() {
        return Err(
            "Command produced no KEY=VALUE output. Expected format: KEY=VALUE per line."
                .to_string(),
        );
    }

    Ok(entries)
}

async fn stream_child_output(
    app: &AppHandle,
    child: &mut tokio::process::Child,
    event_name: &str,
) -> Result<(), String> {
    let stdout = child.stdout.take();
    let stderr = child.stderr.take();

    if let Some(stdout) = stdout {
        let app_clone = app.clone();
        let event_clone = event_name.to_string();
        tokio::spawn(async move {
            let reader = BufReader::new(stdout);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_clone.emit(&event_clone, &line);
            }
        });
    }

    if let Some(stderr) = stderr {
        let app_clone = app.clone();
        let event_clone = event_name.to_string();
        tokio::spawn(async move {
            let reader = BufReader::new(stderr);
            let mut lines = reader.lines();
            while let Ok(Some(line)) = lines.next_line().await {
                let _ = app_clone.emit(&event_clone, &line);
            }
        });
    }

    Ok(())
}

#[tauri::command]
pub async fn project_rebuild(app: AppHandle, id: String) -> Result<(), String> {
    let projects = load_projects()?;
    let project = find_project(&projects, &id)?;
    let event_name = format!("docker-project-log-{}", project.id);

    // Stop first
    let _ = project_stop(id.clone()).await;

    // Then rebuild
    if project.services.is_empty() {
        dockerfile_up(&app, &project, &event_name).await
    } else {
        multi_service_up(&app, &project, &event_name).await
    }
}

// ─── Multi-service support ──────────────────────────────────────────────────

/// Resolve a service's effective settings by inheriting from the project defaults.
struct ResolvedService {
    name: String,
    image: Option<String>,
    dockerfile: Option<String>,
    ports: Vec<String>,
    volumes: Vec<VolumeMount>,
    watch_mode: bool,
    startup_command: Option<String>,
    remote_debug: bool,
    debug_port: u16,
    env_vars: Vec<EnvVarEntry>,
    network: Option<String>,
    restart: Option<String>,
    cpus: Option<String>,
    memory: Option<String>,
}

fn resolve_service(project: &Project, svc: &Service) -> ResolvedService {
    // Merge env_vars: project first, service overrides by key
    let mut env_map: std::collections::HashMap<String, &EnvVarEntry> =
        std::collections::HashMap::new();
    for var in &project.env_vars {
        if var.profile == project.active_profile {
            env_map.insert(var.key.clone(), var);
        }
    }
    for var in &svc.env_vars {
        env_map.insert(var.key.clone(), var);
    }
    let merged_env: Vec<EnvVarEntry> = env_map.into_values().cloned().collect();

    ResolvedService {
        name: svc.name.clone(),
        image: svc.image.clone(),
        dockerfile: svc.dockerfile.clone().or_else(|| project.dockerfile.clone()),
        ports: svc.ports.clone(),
        volumes: svc.volumes.clone().unwrap_or_else(|| project.volumes.clone()),
        watch_mode: svc.watch_mode.unwrap_or(project.watch_mode),
        startup_command: svc.startup_command.clone(),
        remote_debug: svc.remote_debug.unwrap_or(project.remote_debug),
        debug_port: svc.debug_port.unwrap_or(project.debug_port),
        env_vars: merged_env,
        network: svc.network.clone().or_else(|| project.network.clone()),
        restart: svc.restart.clone(),
        cpus: svc.cpus.clone().or_else(|| project.cpus.clone()),
        memory: svc.memory.clone().or_else(|| project.memory.clone()),
    }
}

/// Topologically sort services so dependencies start first.
fn topological_sort_services(services: &[Service]) -> Result<Vec<&Service>, String> {
    use std::collections::VecDeque;

    let name_to_svc: HashMap<&str, &Service> = services.iter().map(|s| (s.name.as_str(), s)).collect();
    let mut in_degree: HashMap<&str, usize> = HashMap::new();
    let mut adj: HashMap<&str, Vec<&str>> = HashMap::new();

    for svc in services {
        in_degree.entry(svc.name.as_str()).or_insert(0);
        for dep in &svc.depends_on {
            adj.entry(dep.as_str()).or_default().push(svc.name.as_str());
            *in_degree.entry(svc.name.as_str()).or_insert(0) += 1;
        }
    }

    let mut queue: VecDeque<&str> = in_degree
        .iter()
        .filter(|(_, &deg)| deg == 0)
        .map(|(&name, _)| name)
        .collect();

    let mut result = Vec::new();
    while let Some(name) = queue.pop_front() {
        if let Some(svc) = name_to_svc.get(name) {
            result.push(*svc);
        }
        if let Some(dependents) = adj.get(name) {
            for &dep in dependents {
                if let Some(deg) = in_degree.get_mut(dep) {
                    *deg -= 1;
                    if *deg == 0 {
                        queue.push_back(dep);
                    }
                }
            }
        }
    }

    if result.len() != services.len() {
        return Err("Circular dependency detected in service depends_on".to_string());
    }

    Ok(result)
}

async fn multi_service_up(
    app: &AppHandle,
    project: &Project,
    event_name: &str,
) -> Result<(), String> {
    // 1. Run init commands on host (once for all services)
    if !project.init_commands.is_empty() {
        run_init_commands(app, project, event_name).await?;
    }

    // 2. Topologically sort services by depends_on
    let ordered = topological_sort_services(&project.services)?;

    // 3. Start each service in dependency order
    for svc in &ordered {
        let resolved = resolve_service(project, svc);
        let container_name = resolved.name.clone();

        let _ = app.emit(event_name, format!("── Service: {} ──", resolved.name));

        // Resolve image
        let image_tag = if let Some(ref img) = resolved.image {
            if !img.trim().is_empty() {
                let _ = app.emit(
                    event_name,
                    format!("[{}] Using image: {}", resolved.name, img),
                );
                img.trim().to_string()
            } else {
                build_service_image(app, project, &resolved, event_name).await?
            }
        } else {
            build_service_image(app, project, &resolved, event_name).await?
        };

        // Remove existing container
        let _ = CliExecutor::run(container_cmd(), &["rm", "-f", &container_name]).await;

        // Build run args
        let mut run_args = vec![
            "run".to_string(),
            "-d".to_string(),
            "--name".to_string(),
            container_name.clone(),
            "--label".to_string(),
            format!("com.acd.project={}", project.name),
        ];

        // Volume mounts
        if resolved.watch_mode {
            run_args.push("-v".to_string());
            run_args.push(format!("{}:/app", project.workspace_path));
            run_args.push("-w".to_string());
            run_args.push("/app".to_string());
        }
        for vol in &resolved.volumes {
            if vol.source.trim().is_empty() || vol.target.trim().is_empty() {
                continue;
            }
            run_args.push("-v".to_string());
            let mut mount_str = format!("{}:{}", vol.source.trim(), vol.target.trim());
            if vol.readonly {
                mount_str.push_str(":ro");
            }
            run_args.push(mount_str);
        }

        // Resource limits (CPU / Memory)
        if let Some(ref c) = resolved.cpus {
            if !c.is_empty() {
                run_args.push("--cpus".to_string());
                run_args.push(c.clone());
            }
        }
        if let Some(ref m) = resolved.memory {
            if !m.is_empty() {
                run_args.push("--memory".to_string());
                run_args.push(m.clone());
            }
        }

        // Network
        if let Some(ref net) = resolved.network {
            if !net.trim().is_empty() {
                run_args.push("--network".to_string());
                run_args.push(net.trim().to_string());
            }
        }

        // Env vars (resolved/merged)
        for var in &resolved.env_vars {
            let value = if var.secret && crate::crypto::is_encrypted(&var.value) {
                crate::crypto::decrypt(&var.value)?
            } else {
                var.value.clone()
            };
            run_args.push("-e".to_string());
            run_args.push(format!("{}={}", var.key, value));
        }

        // Global env store vars
        let global_pairs = resolve_project_env(project)?;
        for (key, value) in &global_pairs {
            run_args.push("-e".to_string());
            run_args.push(format!("{}={}", key, value));
        }

        // Ports
        for port in &resolved.ports {
            if !port.trim().is_empty() {
                run_args.push("-p".to_string());
                run_args.push(port.trim().to_string());
            }
        }

        // Debug port
        if resolved.remote_debug {
            run_args.push("-p".to_string());
            run_args.push(format!("{}:{}", resolved.debug_port, resolved.debug_port));
        }

        run_args.push(image_tag);

        // Startup command
        if let Some(ref cmd) = resolved.startup_command {
            if !cmd.trim().is_empty() {
                for part in cmd.split_whitespace() {
                    run_args.push(part.to_string());
                }
            }
        }

        let _ = app.emit(
            event_name,
            format!("[{}] Starting container...", resolved.name),
        );

        let str_args: Vec<&str> = run_args.iter().map(|s| s.as_str()).collect();
        let mut run_child = Command::new(container_cmd())
            .args(&str_args)
            .env("PATH", &*EXTENDED_PATH)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .spawn()
            .map_err(|e| {
                format!(
                    "Failed to spawn container run for {}: {}",
                    resolved.name, e
                )
            })?;

        stream_child_output(app, &mut run_child, event_name).await?;

        let run_status = run_child
            .wait()
            .await
            .map_err(|e| format!("Failed to wait: {}", e))?;

        if !run_status.success() {
            let _ = app.emit(
                event_name,
                format!("[{}] Container run failed!", resolved.name),
            );
        } else {
            let _ = app.emit(event_name, format!("[{}] Started.", resolved.name));

            // Register restart monitor if policy is set
            if let Some(ref restart) = resolved.restart {
                if !restart.is_empty() && restart != "no" {
                    spawn_restart_monitor(container_name.clone(), restart.clone());
                }
            }
        }
    }

    let _ = app.emit(event_name, "[done]");
    Ok(())
}

async fn build_service_image(
    app: &AppHandle,
    project: &Project,
    resolved: &ResolvedService,
    event_name: &str,
) -> Result<String, String> {
    let dockerfile = resolved.dockerfile.as_deref().unwrap_or("Dockerfile");
    let image_tag = format!(
        "acd-project-{}-{}",
        project.name.to_lowercase().replace(' ', "-"),
        resolved.name.to_lowercase().replace(' ', "-")
    );

    let _ = app.emit(
        event_name,
        format!("[{}] Building image...", resolved.name),
    );

    let mut build_child = Command::new(container_cmd())
        .args(["build", "-t", &image_tag, "-f", dockerfile, "."])
        .current_dir(&project.workspace_path)
        .env("PATH", &*EXTENDED_PATH)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn build for {}: {}", resolved.name, e))?;

    stream_child_output(app, &mut build_child, event_name).await?;

    let build_status = build_child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait: {}", e))?;

    if !build_status.success() {
        return Err(format!("Build failed for service: {}", resolved.name));
    }

    Ok(image_tag)
}

async fn get_multi_service_status(
    project: &Project,
) -> (String, Vec<String>, Vec<ServiceStatus>) {
    let all_containers = list_all_containers().await;
    let mut all_ids = Vec::new();
    let mut svc_statuses = Vec::new();
    let mut any_running = false;
    let mut any_container = false;

    for svc in &project.services {
        let container_name = svc.name.clone();

        // Find exact match for this service's container
        let mut ids = Vec::new();
        let mut svc_running = false;
        for (id, status) in &all_containers {
            if id == &container_name {
                ids.push(id.clone());
                if status == "running" {
                    svc_running = true;
                }
            }
        }

        let status = if svc_running {
            "running".to_string()
        } else if !ids.is_empty() {
            "stopped".to_string()
        } else {
            "not_created".to_string()
        };

        let container_id = ids.first().cloned();
        if svc_running {
            any_running = true;
        }
        if !ids.is_empty() {
            any_container = true;
        }
        all_ids.extend(ids);

        svc_statuses.push(ServiceStatus {
            service_id: svc.id.clone(),
            service_name: svc.name.clone(),
            status,
            container_id,
        });
    }

    let overall = if any_running {
        "running"
    } else if any_container {
        "stopped"
    } else {
        "not_created"
    };

    (overall.to_string(), all_ids, svc_statuses)
}

// ─── Service CRUD ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn add_service(
    project_id: String,
    service: Service,
) -> Result<ProjectWithStatus, String> {
    let mut projects = load_projects()?;
    let project = projects
        .iter_mut()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    if project.services.iter().any(|s| s.name == service.name) {
        return Err(format!("Service '{}' already exists", service.name));
    }

    project.services.push(service);
    let project_clone = project.clone();
    save_projects(&projects)?;

    Ok(mask_project_with_status_secrets(
        get_project_status(project_clone).await,
    ))
}

#[tauri::command]
pub async fn update_service(
    project_id: String,
    service: Service,
) -> Result<ProjectWithStatus, String> {
    let mut projects = load_projects()?;
    let project = projects
        .iter_mut()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    if let Some(existing) = project.services.iter_mut().find(|s| s.id == service.id) {
        *existing = service;
    } else {
        return Err("Service not found".to_string());
    }

    let project_clone = project.clone();
    save_projects(&projects)?;

    Ok(mask_project_with_status_secrets(
        get_project_status(project_clone).await,
    ))
}

#[tauri::command]
pub async fn remove_service(
    project_id: String,
    service_id: String,
) -> Result<ProjectWithStatus, String> {
    let mut projects = load_projects()?;
    let project = projects
        .iter_mut()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    // Stop the service container if running
    if let Some(svc) = project.services.iter().find(|s| s.id == service_id) {
        let container_name = svc.name.clone();
        let _ = CliExecutor::run(container_cmd(), &["rm", "-f", &container_name]).await;
    }

    project.services.retain(|s| s.id != service_id);
    let project_clone = project.clone();
    save_projects(&projects)?;

    Ok(mask_project_with_status_secrets(
        get_project_status(project_clone).await,
    ))
}

// ─── Compose import/export ───────────────────────────────────────────────────

#[tauri::command]
pub async fn import_compose(
    project_id: String,
    file_path: String,
) -> Result<ProjectWithStatus, String> {
    let content =
        std::fs::read_to_string(&file_path).map_err(|e| format!("Failed to read file: {}", e))?;
    let doc: serde_yaml::Value =
        serde_yaml::from_str(&content).map_err(|e| format!("Failed to parse YAML: {}", e))?;

    let services_map = doc
        .get("services")
        .and_then(|v| v.as_mapping())
        .ok_or("No 'services' key found in compose file")?;

    let mut new_services = Vec::new();

    for (name_val, svc_val) in services_map {
        let name = name_val
            .as_str()
            .unwrap_or("unnamed")
            .to_string();

        let image = svc_val
            .get("image")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let dockerfile = svc_val
            .get("build")
            .and_then(|v| {
                if v.is_string() {
                    // build: ./path  → use default Dockerfile in that path
                    None
                } else {
                    v.get("dockerfile").and_then(|d| d.as_str()).map(|s| s.to_string())
                }
            });

        let ports = svc_val
            .get("ports")
            .and_then(|v| v.as_sequence())
            .map(|seq| {
                seq.iter()
                    .filter_map(|p| p.as_str().map(|s| s.to_string()))
                    .collect::<Vec<_>>()
            })
            .unwrap_or_default();

        let volumes = svc_val
            .get("volumes")
            .and_then(|v| v.as_sequence())
            .map(|seq| {
                seq.iter()
                    .filter_map(|v| v.as_str())
                    .map(|s| parse_compose_volume(s))
                    .collect::<Vec<_>>()
            });

        let env_vars = parse_compose_environment(svc_val);

        let network = svc_val
            .get("networks")
            .and_then(|v| v.as_sequence())
            .and_then(|seq| seq.first())
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let startup_command = svc_val
            .get("command")
            .and_then(|v| {
                if v.is_string() {
                    v.as_str().map(|s| s.to_string())
                } else if v.is_sequence() {
                    v.as_sequence().map(|seq| {
                        seq.iter()
                            .filter_map(|p| p.as_str())
                            .collect::<Vec<_>>()
                            .join(" ")
                    })
                } else {
                    None
                }
            });

        let restart = svc_val
            .get("restart")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let depends_on = svc_val
            .get("depends_on")
            .and_then(|v| {
                if let Some(seq) = v.as_sequence() {
                    // Simple format: depends_on: [db, redis]
                    Some(
                        seq.iter()
                            .filter_map(|item| item.as_str().map(|s| s.to_string()))
                            .collect::<Vec<_>>(),
                    )
                } else if let Some(map) = v.as_mapping() {
                    // Extended format: depends_on: { db: { condition: ... } }
                    Some(
                        map.keys()
                            .filter_map(|k| k.as_str().map(|s| s.to_string()))
                            .collect::<Vec<_>>(),
                    )
                } else {
                    None
                }
            })
            .unwrap_or_default();

        // Resource limits: deploy.resources.limits.cpus / memory
        let cpus = svc_val
            .get("deploy")
            .and_then(|d| d.get("resources"))
            .and_then(|r| r.get("limits"))
            .and_then(|l| l.get("cpus"))
            .and_then(|v| match v {
                serde_yaml::Value::String(s) => Some(s.clone()),
                serde_yaml::Value::Number(n) => Some(n.to_string()),
                _ => None,
            })
            .or_else(|| {
                svc_val.get("cpus").and_then(|v| match v {
                    serde_yaml::Value::String(s) => Some(s.clone()),
                    serde_yaml::Value::Number(n) => Some(n.to_string()),
                    _ => None,
                })
            });
        let memory = svc_val
            .get("deploy")
            .and_then(|d| d.get("resources"))
            .and_then(|r| r.get("limits"))
            .and_then(|l| l.get("memory"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .or_else(|| {
                svc_val.get("mem_limit").and_then(|v| v.as_str()).map(|s| s.to_string())
            });

        new_services.push(Service {
            id: uuid::Uuid::new_v4().to_string(),
            name,
            image,
            dockerfile,
            ports,
            volumes,
            watch_mode: None,
            startup_command,
            remote_debug: None,
            debug_port: None,
            env_vars,
            network,
            restart,
            depends_on,
            cpus,
            memory,
        });
    }

    let mut projects = load_projects()?;
    let project = projects
        .iter_mut()
        .find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    // Parse top-level networks (stored in project, created on project_up)
    let project_networks = doc
        .get("networks")
        .and_then(|v| v.as_mapping())
        .map(|map| {
            map.iter()
                .filter_map(|(name_val, net_val)| {
                    let name = name_val.as_str()?.to_string();
                    let external = net_val
                        .as_mapping()
                        .and_then(|m| m.get(&serde_yaml::Value::String("external".into())))
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    if external {
                        return None;
                    }
                    let driver = net_val
                        .as_mapping()
                        .and_then(|m| m.get(&serde_yaml::Value::String("driver".into())))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    Some(ProjectNetwork { name, driver })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    // Parse top-level volumes (stored in project, created on project_up)
    let named_volumes = doc
        .get("volumes")
        .and_then(|v| v.as_mapping())
        .map(|map| {
            map.iter()
                .filter_map(|(name_val, vol_val)| {
                    let name = name_val.as_str()?.to_string();
                    let external = vol_val
                        .as_mapping()
                        .and_then(|m| m.get(&serde_yaml::Value::String("external".into())))
                        .and_then(|v| v.as_bool())
                        .unwrap_or(false);
                    if external {
                        return None;
                    }
                    let driver = vol_val
                        .as_mapping()
                        .and_then(|m| m.get(&serde_yaml::Value::String("driver".into())))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());
                    Some(NamedVolume { name, driver })
                })
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    project.services = new_services;
    project.project_networks = project_networks;
    project.named_volumes = named_volumes;
    let project_clone = project.clone();
    save_projects(&projects)?;

    Ok(mask_project_with_status_secrets(
        get_project_status(project_clone).await,
    ))
}

fn parse_compose_volume(s: &str) -> VolumeMount {
    let parts: Vec<&str> = s.splitn(3, ':').collect();
    let (source, target, readonly) = match parts.len() {
        1 => (parts[0].to_string(), parts[0].to_string(), false),
        2 => (parts[0].to_string(), parts[1].to_string(), false),
        _ => (
            parts[0].to_string(),
            parts[1].to_string(),
            parts[2] == "ro",
        ),
    };
    let mount_type = if source.starts_with('/') || source.starts_with('.') {
        "bind"
    } else {
        "volume"
    };
    VolumeMount {
        mount_type: mount_type.to_string(),
        source,
        target,
        readonly,
    }
}

fn parse_compose_environment(svc_val: &serde_yaml::Value) -> Vec<EnvVarEntry> {
    let mut entries = Vec::new();
    if let Some(env) = svc_val.get("environment") {
        if let Some(map) = env.as_mapping() {
            for (k, v) in map {
                if let Some(key) = k.as_str() {
                    let value = match v {
                        serde_yaml::Value::String(s) => s.clone(),
                        serde_yaml::Value::Number(n) => n.to_string(),
                        serde_yaml::Value::Bool(b) => b.to_string(),
                        _ => String::new(),
                    };
                    entries.push(EnvVarEntry {
                        key: key.to_string(),
                        value,
                        source: "manual".to_string(),
                        secret: false,
                        profile: "default".to_string(),
                    });
                }
            }
        } else if let Some(seq) = env.as_sequence() {
            for item in seq {
                if let Some(s) = item.as_str() {
                    if let Some(eq) = s.find('=') {
                        entries.push(EnvVarEntry {
                            key: s[..eq].to_string(),
                            value: s[eq + 1..].to_string(),
                            source: "manual".to_string(),
                            secret: false,
                            profile: "default".to_string(),
                        });
                    }
                }
            }
        }
    }
    entries
}

#[tauri::command]
pub async fn export_compose(project_id: String, file_path: String) -> Result<(), String> {
    let projects = load_projects()?;
    let project = find_project(&projects, &project_id)?;

    let mut services_map = serde_yaml::Mapping::new();

    let services_to_export: Vec<_> = if project.services.is_empty() {
        // Export single-mode project as one service
        vec![Service {
            id: project.id.clone(),
            name: project.name.clone(),
            image: project.image.clone(),
            dockerfile: project.dockerfile.clone(),
            ports: project.ports.clone(),
            volumes: if project.volumes.is_empty() {
                None
            } else {
                Some(project.volumes.clone())
            },
            watch_mode: Some(project.watch_mode),
            startup_command: project.startup_command.clone(),
            remote_debug: Some(project.remote_debug),
            debug_port: Some(project.debug_port),
            env_vars: project.env_vars.clone(),
            network: project.network.clone(),
            restart: None,
            depends_on: vec![],
            cpus: project.cpus.clone(),
            memory: project.memory.clone(),
        }]
    } else {
        project.services.clone()
    };

    for svc in &services_to_export {
        let mut svc_map = serde_yaml::Mapping::new();

        if let Some(ref img) = svc.image {
            svc_map.insert(
                serde_yaml::Value::String("image".to_string()),
                serde_yaml::Value::String(img.clone()),
            );
        } else if let Some(ref df) = svc.dockerfile {
            let mut build_map = serde_yaml::Mapping::new();
            build_map.insert(
                serde_yaml::Value::String("context".to_string()),
                serde_yaml::Value::String(".".to_string()),
            );
            build_map.insert(
                serde_yaml::Value::String("dockerfile".to_string()),
                serde_yaml::Value::String(df.clone()),
            );
            svc_map.insert(
                serde_yaml::Value::String("build".to_string()),
                serde_yaml::Value::Mapping(build_map),
            );
        }

        if !svc.ports.is_empty() {
            let ports_seq: Vec<serde_yaml::Value> = svc
                .ports
                .iter()
                .map(|p| serde_yaml::Value::String(p.clone()))
                .collect();
            svc_map.insert(
                serde_yaml::Value::String("ports".to_string()),
                serde_yaml::Value::Sequence(ports_seq),
            );
        }

        if let Some(ref vols) = svc.volumes {
            if !vols.is_empty() {
                let vols_seq: Vec<serde_yaml::Value> = vols
                    .iter()
                    .map(|v| {
                        let mut s = format!("{}:{}", v.source, v.target);
                        if v.readonly {
                            s.push_str(":ro");
                        }
                        serde_yaml::Value::String(s)
                    })
                    .collect();
                svc_map.insert(
                    serde_yaml::Value::String("volumes".to_string()),
                    serde_yaml::Value::Sequence(vols_seq),
                );
            }
        }

        if !svc.env_vars.is_empty() {
            let mut env_map = serde_yaml::Mapping::new();
            for var in &svc.env_vars {
                env_map.insert(
                    serde_yaml::Value::String(var.key.clone()),
                    serde_yaml::Value::String(var.value.clone()),
                );
            }
            svc_map.insert(
                serde_yaml::Value::String("environment".to_string()),
                serde_yaml::Value::Mapping(env_map),
            );
        }

        if let Some(ref cmd) = svc.startup_command {
            svc_map.insert(
                serde_yaml::Value::String("command".to_string()),
                serde_yaml::Value::String(cmd.clone()),
            );
        }

        if let Some(ref net) = svc.network {
            svc_map.insert(
                serde_yaml::Value::String("networks".to_string()),
                serde_yaml::Value::Sequence(vec![serde_yaml::Value::String(net.clone())]),
            );
        }

        if let Some(ref restart) = svc.restart {
            if !restart.is_empty() && restart != "no" {
                svc_map.insert(
                    serde_yaml::Value::String("restart".to_string()),
                    serde_yaml::Value::String(restart.clone()),
                );
            }
        }

        if !svc.depends_on.is_empty() {
            let deps_seq: Vec<serde_yaml::Value> = svc
                .depends_on
                .iter()
                .map(|d| serde_yaml::Value::String(d.clone()))
                .collect();
            svc_map.insert(
                serde_yaml::Value::String("depends_on".to_string()),
                serde_yaml::Value::Sequence(deps_seq),
            );
        }

        // Resource limits → deploy.resources.limits
        if svc.cpus.is_some() || svc.memory.is_some() {
            let mut limits = serde_yaml::Mapping::new();
            if let Some(ref c) = svc.cpus {
                if !c.is_empty() {
                    limits.insert(
                        serde_yaml::Value::String("cpus".to_string()),
                        serde_yaml::Value::String(c.clone()),
                    );
                }
            }
            if let Some(ref m) = svc.memory {
                if !m.is_empty() {
                    limits.insert(
                        serde_yaml::Value::String("memory".to_string()),
                        serde_yaml::Value::String(m.clone()),
                    );
                }
            }
            if !limits.is_empty() {
                let mut resources = serde_yaml::Mapping::new();
                resources.insert(
                    serde_yaml::Value::String("limits".to_string()),
                    serde_yaml::Value::Mapping(limits),
                );
                let mut deploy = serde_yaml::Mapping::new();
                deploy.insert(
                    serde_yaml::Value::String("resources".to_string()),
                    serde_yaml::Value::Mapping(resources),
                );
                svc_map.insert(
                    serde_yaml::Value::String("deploy".to_string()),
                    serde_yaml::Value::Mapping(deploy),
                );
            }
        }

        services_map.insert(
            serde_yaml::Value::String(svc.name.clone()),
            serde_yaml::Value::Mapping(svc_map),
        );
    }

    let mut root = serde_yaml::Mapping::new();
    root.insert(
        serde_yaml::Value::String("services".to_string()),
        serde_yaml::Value::Mapping(services_map),
    );

    // Export top-level networks: project_networks + service references
    let mut networks_map = serde_yaml::Mapping::new();
    for net in &project.project_networks {
        if let Some(ref driver) = net.driver {
            let mut m = serde_yaml::Mapping::new();
            m.insert(
                serde_yaml::Value::String("driver".to_string()),
                serde_yaml::Value::String(driver.clone()),
            );
            networks_map.insert(
                serde_yaml::Value::String(net.name.clone()),
                serde_yaml::Value::Mapping(m),
            );
        } else {
            networks_map.insert(
                serde_yaml::Value::String(net.name.clone()),
                serde_yaml::Value::Null,
            );
        }
    }
    for svc in &services_to_export {
        if let Some(ref net) = svc.network {
            let key = serde_yaml::Value::String(net.trim().to_string());
            if !net.trim().is_empty() && !networks_map.contains_key(&key) {
                networks_map.insert(key, serde_yaml::Value::Null);
            }
        }
    }
    if !networks_map.is_empty() {
        root.insert(
            serde_yaml::Value::String("networks".to_string()),
            serde_yaml::Value::Mapping(networks_map),
        );
    }

    // Export top-level volumes: named_volumes + service volume references
    let mut volumes_map = serde_yaml::Mapping::new();
    for vol in &project.named_volumes {
        if let Some(ref driver) = vol.driver {
            let mut m = serde_yaml::Mapping::new();
            m.insert(
                serde_yaml::Value::String("driver".to_string()),
                serde_yaml::Value::String(driver.clone()),
            );
            volumes_map.insert(
                serde_yaml::Value::String(vol.name.clone()),
                serde_yaml::Value::Mapping(m),
            );
        } else {
            volumes_map.insert(
                serde_yaml::Value::String(vol.name.clone()),
                serde_yaml::Value::Null,
            );
        }
    }
    for svc in &services_to_export {
        if let Some(ref vols) = svc.volumes {
            for v in vols {
                let key = serde_yaml::Value::String(v.source.trim().to_string());
                if v.mount_type == "volume" && !v.source.trim().is_empty() && !volumes_map.contains_key(&key) {
                    volumes_map.insert(key, serde_yaml::Value::Null);
                }
            }
        }
    }
    if !volumes_map.is_empty() {
        root.insert(
            serde_yaml::Value::String("volumes".to_string()),
            serde_yaml::Value::Mapping(volumes_map),
        );
    }

    let yaml_str = serde_yaml::to_string(&serde_yaml::Value::Mapping(root))
        .map_err(|e| format!("Failed to serialize YAML: {}", e))?;

    std::fs::write(&file_path, yaml_str)
        .map_err(|e| format!("Failed to write file: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn open_terminal_exec(container_id: String) -> Result<(), String> {
    let settings = crate::commands::app_settings::load_app_settings();
    let container_bin = container_cmd();
    let shell = &settings.shell;
    let terminal = settings.terminal;

    if cfg!(target_os = "macos") {
        if terminal.contains("iTerm") {
            let script = format!(
                r#"tell application "iTerm"
  activate
  set newWindow to (create window with default profile)
  tell current session of newWindow
    write text "{} exec -it {} {}"
  end tell
end tell"#,
                container_bin, container_id, shell
            );
            Command::new("osascript")
                .args(["-e", &script])
                .spawn()
                .map_err(|e| format!("Failed to open iTerm: {}", e))?;
        } else if terminal.contains("Warp") {
            let script = format!(
                r#"tell application "Warp" to activate
delay 0.5
tell application "System Events"
  keystroke "{} exec -it {} {}"
  key code 36
end tell"#,
                container_bin, container_id, shell
            );
            Command::new("osascript")
                .args(["-e", &script])
                .spawn()
                .map_err(|e| format!("Failed to open Warp: {}", e))?;
        } else {
            let script = format!(
                r#"tell application "{}"
  activate
  do script "{} exec -it {} {}"
end tell"#,
                terminal, container_bin, container_id, shell
            );
            Command::new("osascript")
                .args(["-e", &script])
                .spawn()
                .map_err(|e| format!("Failed to open terminal: {}", e))?;
        }
    } else {
        // Linux
        let exec_cmd = format!("{} exec -it {} {}", container_bin, container_id, shell);
        let result = if terminal.contains("gnome-terminal") {
            Command::new(&terminal)
                .args(["--", "bash", "-c", &exec_cmd])
                .spawn()
        } else if terminal.contains("konsole")
            || terminal.contains("alacritty")
            || terminal.contains("kitty")
            || terminal.contains("wezterm")
        {
            Command::new(&terminal)
                .args(["-e", "bash", "-c", &exec_cmd])
                .spawn()
        } else {
            Command::new(&terminal)
                .args(["-e", &exec_cmd])
                .spawn()
        };

        result.map_err(|e| format!("Failed to open terminal '{}': {}", terminal, e))?;
    }

    Ok(())
}
