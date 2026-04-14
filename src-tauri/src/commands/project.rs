use crate::cli::executor::{container_cmd, CliExecutor, EXTENDED_PATH};
use crate::cli::types::{
    EnvVarEntry, Project, ProjectEnvBinding, ProjectTypeDetection, ProjectWithStatus,
    ProjectsConfig,
};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

fn config_path() -> Result<std::path::PathBuf, String> {
    let config_dir = dirs::config_dir().ok_or("Cannot find config directory")?;
    let app_dir = config_dir.join("apple-container-desktop");
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create config dir: {}", e))?;
    Ok(app_dir.join("projects.json"))
}

pub fn load_projects() -> Result<Vec<Project>, String> {
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
    let status = get_dockerfile_status(&project).await;
    project.with_status(status.0, status.1)
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
                project.with_status("path_missing".to_string(), vec![]),
            ));
            continue;
        }

        let (status, container_ids) = get_dockerfile_status(&project).await;
        result.push(mask_project_with_status_secrets(
            project.with_status(status, container_ids),
        ));
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

async fn get_dockerfile_status(project: &Project) -> (String, Vec<String>) {
    let container_name = format!(
        "acd-project-{}",
        project.id.chars().take(8).collect::<String>()
    );
    let filter = format!("name={}", container_name);
    match CliExecutor::run(
        container_cmd(),
        &[
            "ps",
            "-a",
            "--filter",
            &filter,
            "--format",
            "{{.ID}}|{{.State}}",
        ],
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
    };

    projects.push(project.clone());
    save_projects(&projects)?;

    Ok(mask_project_with_status_secrets(
        project.with_status("not_created".to_string(), vec![]),
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
    let container_name = format!(
        "acd-project-{}",
        project.id.chars().take(8).collect::<String>()
    );
    let _ = CliExecutor::run(container_cmd(), &["rm", "-f", &container_name]).await;
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

    dockerfile_up(&app, &project, &event_name).await?;

    Ok(())
}

async fn dockerfile_up(
    app: &AppHandle,
    project: &Project,
    event_name: &str,
) -> Result<(), String> {
    let dockerfile = project.dockerfile.as_deref().unwrap_or("Dockerfile");
    let container_name = format!(
        "acd-project-{}",
        project.id.chars().take(8).collect::<String>()
    );
    let image_tag = format!(
        "acd-project-{}",
        project.name.to_lowercase().replace(' ', "-")
    );

    // Build image
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

    // Remove existing container if any
    let _ = CliExecutor::run(container_cmd(), &["rm", "-f", &container_name]).await;

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

#[tauri::command]
pub async fn project_stop(id: String) -> Result<(), String> {
    let projects = load_projects()?;
    let project = find_project(&projects, &id)?;

    let container_name = format!(
        "acd-project-{}",
        project.id.chars().take(8).collect::<String>()
    );
    CliExecutor::run(container_cmd(), &["stop", &container_name]).await?;

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
    dockerfile_up(&app, &project, &event_name).await
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
