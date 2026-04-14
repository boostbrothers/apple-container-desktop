use crate::cli::executor::{docker_cmd, docker_host, CliExecutor, EXTENDED_PATH};
use crate::cli::types::{
    Project, ProjectWithStatus, ProjectsConfig, EnvVarEntry,
    ProjectTypeDetection, ProjectEnvBinding,
};
use crate::proxy::config::{self as domain_config, ContainerDomainOverride, PortRoute};
use tauri::{AppHandle, Emitter, Manager};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

fn config_path() -> Result<std::path::PathBuf, String> {
    let config_dir = dirs::config_dir().ok_or("Cannot find config directory")?;
    let app_dir = config_dir.join("colima-desktop");
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create config dir: {}", e))?;
    Ok(app_dir.join("projects.json"))
}

/// Migrate old config files (docker-projects.json, devcontainer-projects.json)
/// into the unified projects.json format.
fn migrate_config_if_needed() -> Result<(), String> {
    let config_dir = dirs::config_dir().ok_or("Cannot find config directory")?;
    let app_dir = config_dir.join("colima-desktop");
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create config dir: {}", e))?;

    let new_path = app_dir.join("projects.json");
    if new_path.exists() {
        return Ok(());
    }

    let mut merged_projects: Vec<Project> = Vec::new();

    // Read docker-projects.json if it exists
    let docker_path = app_dir.join("docker-projects.json");
    if docker_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&docker_path) {
            if let Ok(config) = serde_json::from_str::<ProjectsConfig>(&content) {
                merged_projects.extend(config.projects);
            }
        }
    }

    // Read devcontainer-projects.json if it exists (old format)
    let devcontainer_path = app_dir.join("devcontainer-projects.json");
    if devcontainer_path.exists() {
        if let Ok(content) = std::fs::read_to_string(&devcontainer_path) {
            // Old format: { projects: [{ id, workspace_path, name }] }
            #[derive(serde::Deserialize)]
            struct OldDevContainerProject {
                id: String,
                workspace_path: String,
                name: String,
            }
            #[derive(serde::Deserialize)]
            struct OldDevContainerConfig {
                projects: Vec<OldDevContainerProject>,
            }

            if let Ok(old_config) = serde_json::from_str::<OldDevContainerConfig>(&content) {
                for old_proj in old_config.projects {
                    // Skip duplicates by workspace_path
                    if merged_projects.iter().any(|p| p.workspace_path == old_proj.workspace_path) {
                        continue;
                    }
                    merged_projects.push(Project {
                        id: old_proj.id,
                        name: old_proj.name,
                        workspace_path: old_proj.workspace_path,
                        project_type: "devcontainer".to_string(),
                        env_vars: Vec::new(),
                        dotenv_path: None,
                        watch_mode: false,
                        remote_debug: false,
                        debug_port: 9229,
                        compose_file: None,
                        dockerfile: None,
                        service_name: None,
                        env_command: None,
                        ports: Vec::new(),
                        startup_command: None,
                        active_profile: "default".to_string(),
                        profiles: vec!["default".to_string()],
                        infisical_config: None,
                        env_binding: ProjectEnvBinding::default(),
                        domain: None,
                    });
                }
            }
        }
    }

    // Only write if we found any old data
    if !merged_projects.is_empty() {
        let config = ProjectsConfig {
            projects: merged_projects,
        };
        let content = serde_json::to_string_pretty(&config)
            .map_err(|e| format!("Failed to serialize migrated config: {}", e))?;
        std::fs::write(&new_path, content)
            .map_err(|e| format!("Failed to write migrated config: {}", e))?;
    }

    // Rename old files to .bak
    if docker_path.exists() {
        let _ = std::fs::rename(&docker_path, app_dir.join("docker-projects.json.bak"));
    }
    if devcontainer_path.exists() {
        let _ = std::fs::rename(&devcontainer_path, app_dir.join("devcontainer-projects.json.bak"));
    }

    Ok(())
}

pub fn load_projects() -> Result<Vec<Project>, String> {
    migrate_config_if_needed()?;
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
    let status = match project.project_type.as_str() {
        "compose" => get_compose_status(&project).await,
        "dockerfile" => get_dockerfile_status(&project).await,
        "devcontainer" => get_devcontainer_status(&project).await,
        _ => ("unknown".to_string(), vec![]),
    };
    project.with_status(status.0, status.1)
}

fn find_docker_compose_cmd() -> Option<Vec<String>> {
    // Try `docker compose` (v2 plugin) first
    if let Ok(output) = std::process::Command::new(docker_cmd())
        .args(["compose", "version"])
        .env("PATH", &*EXTENDED_PATH)
        .env("DOCKER_HOST", docker_host())
        .output()
    {
        if output.status.success() {
            return Some(vec![docker_cmd().to_string(), "compose".to_string()]);
        }
    }
    // Try standalone docker-compose
    let candidates = [
        "/opt/homebrew/bin/docker-compose",
        "/usr/local/bin/docker-compose",
    ];
    for path in candidates {
        if std::path::Path::new(path).exists() {
            return Some(vec![path.to_string()]);
        }
    }
    None
}

#[tauri::command]
pub async fn detect_project_type(workspace_path: String) -> Result<ProjectTypeDetection, String> {
    let path = std::path::Path::new(&workspace_path);
    if !path.exists() {
        return Err("Path does not exist".to_string());
    }

    let mut dockerfiles = Vec::new();
    let mut compose_files = Vec::new();
    let mut dotenv_files = Vec::new();

    let dockerfile_names = ["Dockerfile", "dockerfile", "Dockerfile.dev", "Dockerfile.development"];
    for name in &dockerfile_names {
        if path.join(name).exists() {
            dockerfiles.push(name.to_string());
        }
    }

    let compose_names = [
        "docker-compose.yml",
        "docker-compose.yaml",
        "compose.yml",
        "compose.yaml",
        "docker-compose.dev.yml",
        "docker-compose.dev.yaml",
        "docker-compose.override.yml",
    ];
    for name in &compose_names {
        if path.join(name).exists() {
            compose_files.push(name.to_string());
        }
    }

    let has_devcontainer = path.join(".devcontainer").join("devcontainer.json").exists()
        || path.join(".devcontainer.json").exists();

    // Scan for .env files
    let env_names = [".env", ".env.local", ".env.development", ".env.dev"];
    for name in &env_names {
        if path.join(name).exists() {
            dotenv_files.push(name.to_string());
        }
    }

    Ok(ProjectTypeDetection {
        has_dockerfile: !dockerfiles.is_empty(),
        has_compose: !compose_files.is_empty(),
        has_devcontainer,
        compose_files,
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
            result.push(mask_project_with_status_secrets(project.with_status("path_missing".to_string(), vec![])));
            continue;
        }

        let (status, container_ids) = match project.project_type.as_str() {
            "compose" => get_compose_status(&project).await,
            "dockerfile" => get_dockerfile_status(&project).await,
            "devcontainer" => get_devcontainer_status(&project).await,
            _ => ("unknown".to_string(), vec![]),
        };

        result.push(mask_project_with_status_secrets(project.with_status(status, container_ids)));
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

async fn get_compose_status(project: &Project) -> (String, Vec<String>) {
    let project_name = project.name.to_lowercase().replace(' ', "-");
    let label_filter = format!("label=com.docker.compose.project={}", project_name);
    match CliExecutor::run(
        docker_cmd(),
        &["ps", "-a", "--filter", &label_filter, "--format", "{{.ID}}|{{.State}}"],
    )
    .await
    {
        Ok(out) => parse_container_status(&out),
        Err(_) => ("stopped".to_string(), vec![]),
    }
}

async fn get_dockerfile_status(project: &Project) -> (String, Vec<String>) {
    let container_name = format!("colima-project-{}", project.id.chars().take(8).collect::<String>());
    let filter = format!("name={}", container_name);
    match CliExecutor::run(
        docker_cmd(),
        &["ps", "-a", "--filter", &filter, "--format", "{{.ID}}|{{.State}}"],
    )
    .await
    {
        Ok(out) => parse_container_status(&out),
        Err(_) => ("stopped".to_string(), vec![]),
    }
}

async fn get_devcontainer_status(project: &Project) -> (String, Vec<String>) {
    let label_filter = format!(
        "label=devcontainer.local_folder={}",
        project.workspace_path
    );
    match CliExecutor::run(
        docker_cmd(),
        &["ps", "-a", "--filter", &label_filter, "--format", "{{.ID}}|{{.State}}"],
    )
    .await
    {
        Ok(out) => parse_container_status(&out),
        Err(_) => ("stopped".to_string(), vec![]),
    }
}

fn parse_container_status(output: &str) -> (String, Vec<String>) {
    let mut ids = Vec::new();
    let mut any_running = false;
    let mut any_container = false;

    for line in output.lines() {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        any_container = true;
        let parts: Vec<&str> = line.split('|').collect();
        if let Some(id) = parts.first() {
            ids.push(id.to_string());
        }
        if let Some(state) = parts.get(1) {
            if *state == "running" {
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
    project_type: String,
    compose_file: Option<String>,
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
        project_type,
        env_vars: Vec::new(),
        dotenv_path: None,
        watch_mode: false,
        remote_debug: false,
        debug_port: 9229,
        compose_file,
        dockerfile,
        service_name: None,
        env_command: None,
        ports: Vec::new(),
        startup_command: None,
        active_profile: "default".to_string(),
        profiles: vec!["default".to_string()],
        infisical_config: None,
        env_binding: ProjectEnvBinding::default(),
        domain: None,
    };

    projects.push(project.clone());
    save_projects(&projects)?;

    Ok(mask_project_with_status_secrets(project.with_status("not_created".to_string(), vec![])))
}

#[tauri::command]
pub async fn update_project(mut project: Project) -> Result<(), String> {
    let mut projects = load_projects()?;
    if let Some(existing) = projects.iter_mut().find(|p| p.id == project.id) {
        // Preserve env_vars from disk – the frontend receives masked secrets
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
    match project.project_type.as_str() {
        "compose" => {
            if let Some(compose_cmd) = find_docker_compose_cmd() {
                let compose_file = project
                    .compose_file
                    .as_deref()
                    .unwrap_or("docker-compose.yml");
                let mut args: Vec<String> = compose_cmd[1..].to_vec();
                args.extend(["-f".to_string(), compose_file.to_string(), "down".to_string()]);
                let _ = CliExecutor::run(&compose_cmd[0], &args.iter().map(|s| s.as_str()).collect::<Vec<_>>()).await;
            }
        }
        "dockerfile" => {
            let container_name = format!(
                "colima-project-{}",
                project.id.chars().take(8).collect::<String>()
            );
            let _ = CliExecutor::run(docker_cmd(), &["rm", "-f", &container_name]).await;
        }
        "devcontainer" => {
            let label_filter = format!(
                "label=devcontainer.local_folder={}",
                project.workspace_path
            );
            if let Ok(out) = CliExecutor::run(
                docker_cmd(),
                &["ps", "-q", "--filter", &label_filter],
            )
            .await
            {
                for cid in out.lines() {
                    let cid = cid.trim();
                    if !cid.is_empty() {
                        let _ = CliExecutor::run(docker_cmd(), &["rm", "-f", cid]).await;
                    }
                }
            }
        }
        _ => {}
    }
    Ok(())
}

async fn collect_env_args(project: &Project, app: &AppHandle, event_name: &str) -> Result<Vec<String>, String> {
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

    // Run env_command if specified — fetch fresh secrets every time
    if let Some(ref cmd) = project.env_command {
        if !cmd.trim().is_empty() {
            let _ = app.emit(event_name, format!("Fetching env vars: {}", cmd));
            let output = Command::new("sh")
                .args(["-c", cmd])
                .current_dir(&project.workspace_path)
                .env("PATH", &*EXTENDED_PATH)
                .env("DOCKER_HOST", docker_host())
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
            let _ = app.emit(event_name, format!("Loaded {} env vars from command", count));
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
                    let _ = app.emit(&event_name, format!("Synced {} secrets from Infisical", entries.len()));
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

    run_project_up(&app, &project, &event_name).await?;

    // Auto-register mDNS services for project ports
    if let Err(e) = auto_register_project_domains(&app, &project).await {
        let _ = app.emit(&event_name, format!("Domain auto-register warning: {}", e));
    }

    Ok(())
}

async fn run_project_up(app: &AppHandle, project: &Project, event_name: &str) -> Result<(), String> {
    match project.project_type.as_str() {
        "compose" => compose_up(app, project, event_name).await,
        "dockerfile" => dockerfile_up(app, project, event_name).await,
        "devcontainer" => devcontainer_project_up(app, project, event_name).await,
        _ => Err(format!("Unknown project type: {}", project.project_type)),
    }
}

// ─── mDNS Auto-Registration ────────────────────────────────────────────────

/// Get running container names for a project.
async fn get_project_container_names(project: &Project) -> Vec<String> {
    let filter = match project.project_type.as_str() {
        "compose" => {
            let name = project.name.to_lowercase().replace(' ', "-");
            format!("label=com.docker.compose.project={}", name)
        }
        "dockerfile" => {
            let name = format!(
                "colima-project-{}",
                project.id.chars().take(8).collect::<String>()
            );
            format!("name={}", name)
        }
        "devcontainer" => {
            format!(
                "label=devcontainer.local_folder={}",
                project.workspace_path
            )
        }
        _ => return vec![],
    };

    match CliExecutor::run(
        docker_cmd(),
        &["ps", "--filter", &filter, "--format", "{{.Names}}"],
    )
    .await
    {
        Ok(out) => out
            .lines()
            .map(|l| l.trim().to_string())
            .filter(|l| !l.is_empty())
            .collect(),
        Err(_) => vec![],
    }
}

/// Parse the host port from a port mapping string like "8080:3000" → 8080.
/// Parse a port mapping string into (host_port, container_port).
/// Supports formats: "8080:3000", "8080:3000/tcp", "3000" (same on both sides).
fn parse_port_mapping(mapping: &str) -> Option<(u16, u16)> {
    let trimmed = mapping.trim();
    if trimmed.is_empty() {
        return None;
    }
    let parts: Vec<&str> = trimmed.split(':').collect();
    match parts.len() {
        1 => {
            let p = parts[0].split('/').next()?.parse::<u16>().ok()?;
            Some((p, p))
        }
        2 => {
            let host = parts[0].parse::<u16>().ok()?;
            let container = parts[1].split('/').next()?.parse::<u16>().ok()?;
            Some((host, container))
        }
        _ => None,
    }
}

/// Auto-register domain overrides for a project's containers after startup.
/// Creates gateway routes for ALL configured ports (not just the first one).
async fn auto_register_project_domains(app: &AppHandle, project: &Project) -> Result<(), String> {
    let config_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    let config_path = config_dir.join("domain-config.json");
    let mut config = domain_config::load_config(&config_path).await;

    if !config.enabled {
        return Ok(());
    }

    // Parse ALL port mappings into PortRoute entries
    let mut port_routes: Vec<PortRoute> = project
        .ports
        .iter()
        .filter_map(|p| parse_port_mapping(p))
        .map(|(host, container)| PortRoute {
            host_port: host,
            container_port: container,
        })
        .collect();

    // Include debug port if enabled
    if project.remote_debug {
        let dp = project.debug_port;
        if !port_routes.iter().any(|r| r.host_port == dp) {
            port_routes.push(PortRoute {
                host_port: dp,
                container_port: dp,
            });
        }
    }

    if port_routes.is_empty() {
        return Ok(()); // No ports to register
    }

    let container_names = get_project_container_names(project).await;
    if container_names.is_empty() {
        return Ok(());
    }

    // Use project.domain if set, otherwise derive from name
    let project_hostname = project
        .domain
        .as_deref()
        .filter(|d| !d.is_empty())
        .map(|d| d.to_string())
        .unwrap_or_else(|| project.name.to_lowercase().replace(' ', "-"));
    let mut changed = false;

    for (i, name) in container_names.iter().enumerate() {
        // Don't overwrite user-configured overrides
        if config.container_overrides.contains_key(name) {
            continue;
        }

        let hostname = if container_names.len() == 1 {
            project_hostname.clone()
        } else {
            format!("{}-{}", project_hostname, i + 1)
        };

        config.container_overrides.insert(
            name.clone(),
            ContainerDomainOverride {
                enabled: true,
                hostname: Some(hostname),
                port: Some(port_routes[0].container_port),
                port_routes: port_routes.clone(),
            },
        );
        changed = true;
    }

    if changed {
        domain_config::save_config(&config_path, &config).await?;
    }

    Ok(())
}

async fn compose_up(
    app: &AppHandle,
    project: &Project,
    event_name: &str,
) -> Result<(), String> {
    let compose_cmd = find_docker_compose_cmd()
        .ok_or("Docker Compose not found. Install Docker Compose plugin.")?;

    let compose_file = project
        .compose_file
        .as_deref()
        .unwrap_or("docker-compose.yml");

    let mut args: Vec<String> = compose_cmd[1..].to_vec();
    args.extend(["-f".to_string(), compose_file.to_string()]);

    // Prepare secrets and override file
    let has_override = match crate::commands::env_secrets::prepare_secrets_for_compose(project) {
        Ok(Some(_path)) => {
            args.extend(["-f".to_string(), "docker-compose.override.yml".to_string()]);
            true
        }
        Ok(None) => false,
        Err(e) => {
            let _ = app.emit(event_name, format!("Warning: secrets prep failed: {}", e));
            false
        }
    };

    // Fallback: use old env file approach if no override was generated
    let _temp_env_file = if !has_override {
        if let Some(ref dotenv_path) = project.dotenv_path {
            let full_path = if std::path::Path::new(dotenv_path).is_absolute() {
                dotenv_path.clone()
            } else {
                format!("{}/{}", project.workspace_path, dotenv_path)
            };
            if std::path::Path::new(&full_path).exists() {
                args.extend(["--env-file".to_string(), full_path]);
            }
        }

        let collected = collect_env_args(project, app, event_name).await?;
        if !collected.is_empty() {
            let mut lines = Vec::new();
            let mut iter = collected.iter();
            while let Some(flag) = iter.next() {
                if flag == "-e" {
                    if let Some(kv) = iter.next() {
                        lines.push(kv.clone());
                    }
                }
            }
            if !lines.is_empty() {
                let temp_dir = tempfile::tempdir()
                    .map_err(|e| format!("Failed to create temp dir: {}", e))?;
                let temp_path = temp_dir.path().join(".env.colima-project");
                std::fs::write(&temp_path, lines.join("\n"))
                    .map_err(|e| format!("Failed to write temp env file: {}", e))?;
                args.extend(["--env-file".to_string(), temp_path.to_string_lossy().to_string()]);
                Some(temp_dir) // keep alive until compose reads it
            } else {
                None
            }
        } else {
            None
        }
    } else {
        None
    };

    // Inject global env store vars via temp env file
    let _global_env_file = {
        let global_pairs = resolve_project_env(project)?;
        if !global_pairs.is_empty() {
            let lines: Vec<String> = global_pairs.iter()
                .map(|(k, v)| format!("{}={}", k, v))
                .collect();
            let temp_dir = tempfile::tempdir()
                .map_err(|e| format!("Failed to create temp dir: {}", e))?;
            let temp_path = temp_dir.path().join(".env.colima-global");
            std::fs::write(&temp_path, lines.join("\n"))
                .map_err(|e| format!("Failed to write temp env file: {}", e))?;
            args.extend(["--env-file".to_string(), temp_path.to_string_lossy().to_string()]);
            Some(temp_dir)
        } else {
            None
        }
    };

    args.push("up".to_string());
    args.push("-d".to_string());
    args.push("--build".to_string());

    if project.watch_mode {
        // Remove -d for watch mode, add --watch
        args.retain(|a| a != "-d");
        args.push("--watch".to_string());
    }

    let docker_host_val = docker_host();
    let str_args: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

    let mut child = Command::new(&compose_cmd[0])
        .args(&str_args)
        .current_dir(&project.workspace_path)
        .env("PATH", &*EXTENDED_PATH)
        .env("DOCKER_HOST", &docker_host_val)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn compose up: {}", e))?;

    stream_child_output(app, &mut child, event_name).await?;

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait: {}", e))?;

    let _ = app.emit(event_name, "[done]");

    if !status.success() && !project.watch_mode {
        return Err("compose up failed. Check logs for details.".to_string());
    }

    Ok(())
}

async fn dockerfile_up(
    app: &AppHandle,
    project: &Project,
    event_name: &str,
) -> Result<(), String> {
    let dockerfile = project.dockerfile.as_deref().unwrap_or("Dockerfile");
    let container_name = format!(
        "colima-project-{}",
        project.id.chars().take(8).collect::<String>()
    );
    let image_tag = format!("colima-project-{}", project.name.to_lowercase().replace(' ', "-"));
    let docker_host_val = docker_host();

    // Build image
    let _ = app.emit(event_name, "Building Docker image...");

    let mut build_child = Command::new(docker_cmd())
        .args([
            "build",
            "-t",
            &image_tag,
            "-f",
            dockerfile,
            ".",
        ])
        .current_dir(&project.workspace_path)
        .env("PATH", &*EXTENDED_PATH)
        .env("DOCKER_HOST", &docker_host_val)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn docker build: {}", e))?;

    stream_child_output(app, &mut build_child, event_name).await?;

    let build_status = build_child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait: {}", e))?;

    if !build_status.success() {
        let _ = app.emit(event_name, "[done]");
        return Err("Docker build failed. Check logs.".to_string());
    }

    // Remove existing container if any
    let _ = CliExecutor::run(docker_cmd(), &["rm", "-f", &container_name]).await;

    // Run container
    let _ = app.emit(event_name, "Starting container...");

    let mut run_args = vec![
        "run".to_string(),
        "-d".to_string(),
        "--name".to_string(),
        container_name.clone(),
        "-v".to_string(),
        format!("{}:/app", project.workspace_path),
        "-w".to_string(),
        "/app".to_string(),
    ];

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
            // Split by shell words
            for part in cmd.split_whitespace() {
                run_args.push(part.to_string());
            }
        }
    }

    let str_args: Vec<&str> = run_args.iter().map(|s| s.as_str()).collect();

    let mut run_child = Command::new(docker_cmd())
        .args(&str_args)
        .env("PATH", &*EXTENDED_PATH)
        .env("DOCKER_HOST", &docker_host_val)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn docker run: {}", e))?;

    stream_child_output(app, &mut run_child, event_name).await?;

    let run_status = run_child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait: {}", e))?;

    let _ = app.emit(event_name, "[done]");

    if !run_status.success() {
        return Err("Docker run failed. Check logs.".to_string());
    }

    Ok(())
}

async fn devcontainer_project_up(
    app: &AppHandle,
    project: &Project,
    event_name: &str,
) -> Result<(), String> {
    let cli = find_devcontainer_cli().ok_or(
        "devcontainer CLI not found. Install with: npm install -g @devcontainers/cli",
    )?;

    let docker_host_val = docker_host();

    let mut owned_args: Vec<String> = vec![
        "up".to_string(),
        "--workspace-folder".to_string(),
        project.workspace_path.clone(),
    ];

    // Inject global env store vars first (lower priority)
    let global_pairs = resolve_project_env(project)?;
    for (key, value) in &global_pairs {
        owned_args.push("--remote-env".to_string());
        owned_args.push(format!("{}={}", key, value));
    }

    // Inject project-specific env vars last so they override globals for same key
    let collected = collect_env_args(project, app, event_name).await?;
    for pair in collected.chunks(2) {
        if pair.len() == 2 && pair[0] == "-e" {
            owned_args.push("--remote-env".to_string());
            owned_args.push(pair[1].clone());
        }
    }

    let str_args: Vec<&str> = owned_args.iter().map(|s| s.as_str()).collect();

    let mut child = Command::new(&cli)
        .args(&str_args)
        .env("PATH", &*EXTENDED_PATH)
        .env("DOCKER_HOST", &docker_host_val)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn devcontainer up: {}", e))?;

    stream_child_output(app, &mut child, event_name).await?;

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait: {}", e))?;

    let _ = app.emit(event_name, "[done]");

    if !status.success() {
        return Err("devcontainer up failed. Check logs.".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn check_devcontainer_cli() -> Result<bool, String> {
    Ok(find_devcontainer_cli().is_some())
}

fn find_devcontainer_cli() -> Option<String> {
    let candidates = [
        "/opt/homebrew/bin/devcontainer",
        "/usr/local/bin/devcontainer",
    ];
    for path in candidates {
        if std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }
    if let Ok(output) = std::process::Command::new("which")
        .arg("devcontainer")
        .env("PATH", &*EXTENDED_PATH)
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
    }
    None
}

#[tauri::command]
pub async fn project_stop(id: String) -> Result<(), String> {
    let projects = load_projects()?;
    let project = find_project(&projects, &id)?;

    match project.project_type.as_str() {
        "compose" => {
            let compose_cmd = find_docker_compose_cmd()
                .ok_or("Docker Compose not found.")?;
            let compose_file = project
                .compose_file
                .as_deref()
                .unwrap_or("docker-compose.yml");
            let mut args: Vec<String> = compose_cmd[1..].to_vec();
            args.extend(["-f".to_string(), compose_file.to_string(), "stop".to_string()]);
            let str_args: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
            CliExecutor::run(&compose_cmd[0], &str_args).await?;
        }
        "dockerfile" => {
            let container_name = format!(
                "colima-project-{}",
                project.id.chars().take(8).collect::<String>()
            );
            CliExecutor::run(docker_cmd(), &["stop", &container_name]).await?;
        }
        "devcontainer" => {
            let label_filter = format!(
                "label=devcontainer.local_folder={}",
                project.workspace_path
            );
            let output = CliExecutor::run(
                docker_cmd(),
                &["ps", "-q", "--filter", &label_filter],
            )
            .await?;
            for cid in output.lines() {
                let cid = cid.trim();
                if !cid.is_empty() {
                    CliExecutor::run(docker_cmd(), &["stop", cid]).await?;
                }
            }
        }
        _ => return Err("Unknown project type".to_string()),
    }

    Ok(())
}

#[tauri::command]
pub async fn project_logs(app: AppHandle, id: String) -> Result<(), String> {
    let projects = load_projects()?;
    let project = find_project(&projects, &id)?;
    let event_name = format!("docker-project-log-{}", project.id);
    let docker_host_val = docker_host();

    match project.project_type.as_str() {
        "compose" => {
            let compose_cmd = find_docker_compose_cmd()
                .ok_or("Docker Compose not found.")?;
            let compose_file = project
                .compose_file
                .as_deref()
                .unwrap_or("docker-compose.yml");
            let mut args: Vec<String> = compose_cmd[1..].to_vec();
            args.extend([
                "-f".to_string(),
                compose_file.to_string(),
                "logs".to_string(),
                "-f".to_string(),
                "--tail".to_string(),
                "200".to_string(),
            ]);
            let str_args: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

            let mut child = Command::new(&compose_cmd[0])
                .args(&str_args)
                .current_dir(&project.workspace_path)
                .env("PATH", &*EXTENDED_PATH)
                .env("DOCKER_HOST", &docker_host_val)
                .stdout(std::process::Stdio::piped())
                .stderr(std::process::Stdio::piped())
                .spawn()
                .map_err(|e| format!("Failed to spawn: {}", e))?;

            stream_child_output(&app, &mut child, &event_name).await?;
            let _ = child.wait().await;
        }
        _ => {
            // For dockerfile and devcontainer, get the first container ID
            let (_, container_ids) = match project.project_type.as_str() {
                "dockerfile" => get_dockerfile_status(&project).await,
                "devcontainer" => get_devcontainer_status(&project).await,
                _ => return Err("Unknown project type".to_string()),
            };

            if let Some(cid) = container_ids.first() {
                let mut child = Command::new(docker_cmd())
                    .args(["logs", "-f", "--tail", "200", cid])
                    .env("PATH", &*EXTENDED_PATH)
                    .env("DOCKER_HOST", &docker_host_val)
                    .stdout(std::process::Stdio::piped())
                    .stderr(std::process::Stdio::piped())
                    .spawn()
                    .map_err(|e| format!("Failed to spawn: {}", e))?;

                stream_child_output(&app, &mut child, &event_name).await?;
                let _ = child.wait().await;
            } else {
                return Err("No running container found".to_string());
            }
        }
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
pub async fn run_env_command(command: String, workspace_path: String) -> Result<Vec<EnvVarEntry>, String> {
    let output = Command::new("sh")
        .args(["-c", &command])
        .current_dir(&workspace_path)
        .env("PATH", &*EXTENDED_PATH)
        .env("DOCKER_HOST", docker_host())
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
        return Err("Command produced no KEY=VALUE output. Expected format: KEY=VALUE per line.".to_string());
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

    // Then start
    match project.project_type.as_str() {
        "compose" => compose_up(&app, &project, &event_name).await,
        "dockerfile" => dockerfile_up(&app, &project, &event_name).await,
        "devcontainer" => devcontainer_project_up(&app, &project, &event_name).await,
        _ => Err(format!("Unknown project type: {}", project.project_type)),
    }
}

#[tauri::command]
pub async fn open_terminal_exec(container_id: String) -> Result<(), String> {
    let settings = crate::commands::app_settings::load_app_settings();
    let docker_host_val = docker_host();
    let exec_cmd = format!(
        "DOCKER_HOST={} {} exec -it {} {}",
        docker_host_val, docker_cmd(), container_id, settings.shell
    );

    let terminal = settings.terminal;

    if cfg!(target_os = "macos") {
        if terminal.contains("iTerm") {
            let script = format!(
                r#"tell application "iTerm"
  activate
  set newWindow to (create window with default profile)
  tell current session of newWindow
    write text "{}"
  end tell
end tell"#,
                exec_cmd
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
  keystroke "{}"
  key code 36
end tell"#,
                exec_cmd
            );
            Command::new("osascript")
                .args(["-e", &script])
                .spawn()
                .map_err(|e| format!("Failed to open Warp: {}", e))?;
        } else {
            let script = format!(
                r#"tell application "{}"
  activate
  do script "{}"
end tell"#,
                terminal, exec_cmd
            );
            Command::new("osascript")
                .args(["-e", &script])
                .spawn()
                .map_err(|e| format!("Failed to open terminal: {}", e))?;
        }
    } else {
        // Linux
        let result = if terminal.contains("gnome-terminal") {
            Command::new(&terminal)
                .args(["--", "bash", "-c", &exec_cmd])
                .spawn()
        } else if terminal.contains("konsole") || terminal.contains("alacritty")
            || terminal.contains("kitty") || terminal.contains("wezterm")
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
