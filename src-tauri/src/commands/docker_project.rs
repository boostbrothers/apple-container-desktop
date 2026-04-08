use crate::cli::executor::{docker_host, CliExecutor};
use crate::cli::types::{
    DockerProject, DockerProjectWithStatus, DockerProjectsConfig, EnvVarEntry,
    ProjectTypeDetection,
};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

const DOCKER: &str = "/opt/homebrew/bin/docker";

fn config_path() -> Result<std::path::PathBuf, String> {
    let config_dir = dirs::config_dir().ok_or("Cannot find config directory")?;
    let app_dir = config_dir.join("colima-desktop");
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create config dir: {}", e))?;
    Ok(app_dir.join("docker-projects.json"))
}

fn load_projects() -> Result<Vec<DockerProject>, String> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {}", e))?;
    let config: DockerProjectsConfig =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse config: {}", e))?;
    Ok(config.projects)
}

fn save_projects(projects: &[DockerProject]) -> Result<(), String> {
    let path = config_path()?;
    let config = DockerProjectsConfig {
        projects: projects.to_vec(),
    };
    let content =
        serde_json::to_string_pretty(&config).map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(&path, content).map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}

fn find_project(projects: &[DockerProject], id: &str) -> Result<DockerProject, String> {
    projects
        .iter()
        .find(|p| p.id == id)
        .cloned()
        .ok_or_else(|| "Project not found".to_string())
}

fn find_docker_compose_cmd() -> Option<Vec<String>> {
    // Try `docker compose` (v2 plugin) first
    if let Ok(output) = std::process::Command::new(DOCKER)
        .args(["compose", "version"])
        .env("DOCKER_HOST", docker_host())
        .output()
    {
        if output.status.success() {
            return Some(vec![DOCKER.to_string(), "compose".to_string()]);
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
pub async fn list_docker_projects() -> Result<Vec<DockerProjectWithStatus>, String> {
    let projects = load_projects()?;
    let mut result = Vec::new();

    for project in projects {
        if !std::path::Path::new(&project.workspace_path).exists() {
            result.push(project.with_status("path_missing".to_string(), vec![]));
            continue;
        }

        let (status, container_ids) = match project.project_type.as_str() {
            "compose" => get_compose_status(&project).await,
            "dockerfile" => get_dockerfile_status(&project).await,
            "devcontainer" => get_devcontainer_status(&project).await,
            _ => ("unknown".to_string(), vec![]),
        };

        result.push(project.with_status(status, container_ids));
    }

    Ok(result)
}

async fn get_compose_status(project: &DockerProject) -> (String, Vec<String>) {
    let project_name = project.name.to_lowercase().replace(' ', "-");
    let label_filter = format!("label=com.docker.compose.project={}", project_name);
    match CliExecutor::run(
        DOCKER,
        &["ps", "-a", "--filter", &label_filter, "--format", "{{.ID}}|{{.State}}"],
    )
    .await
    {
        Ok(out) => parse_container_status(&out),
        Err(_) => ("stopped".to_string(), vec![]),
    }
}

async fn get_dockerfile_status(project: &DockerProject) -> (String, Vec<String>) {
    let container_name = format!("colima-project-{}", project.id.chars().take(8).collect::<String>());
    let filter = format!("name={}", container_name);
    match CliExecutor::run(
        DOCKER,
        &["ps", "-a", "--filter", &filter, "--format", "{{.ID}}|{{.State}}"],
    )
    .await
    {
        Ok(out) => parse_container_status(&out),
        Err(_) => ("stopped".to_string(), vec![]),
    }
}

async fn get_devcontainer_status(project: &DockerProject) -> (String, Vec<String>) {
    let label_filter = format!(
        "label=devcontainer.local_folder={}",
        project.workspace_path
    );
    match CliExecutor::run(
        DOCKER,
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
pub async fn add_docker_project(
    name: String,
    workspace_path: String,
    project_type: String,
    compose_file: Option<String>,
    dockerfile: Option<String>,
) -> Result<DockerProjectWithStatus, String> {
    let path = std::path::Path::new(&workspace_path);
    if !path.exists() {
        return Err("Path does not exist".to_string());
    }

    let mut projects = load_projects()?;
    if projects.iter().any(|p| p.workspace_path == workspace_path) {
        return Err("This project path is already registered".to_string());
    }

    let project = DockerProject {
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
    };

    projects.push(project.clone());
    save_projects(&projects)?;

    Ok(project.with_status("not_created".to_string(), vec![]))
}

#[tauri::command]
pub async fn update_docker_project(project: DockerProject) -> Result<(), String> {
    let mut projects = load_projects()?;
    if let Some(existing) = projects.iter_mut().find(|p| p.id == project.id) {
        *existing = project;
    } else {
        return Err("Project not found".to_string());
    }
    save_projects(&projects)
}

#[tauri::command]
pub async fn remove_docker_project(id: String, stop_containers: bool) -> Result<(), String> {
    let mut projects = load_projects()?;
    let project = find_project(&projects, &id)?;

    if stop_containers {
        let _ = stop_project_containers(&project).await;
    }

    projects.retain(|p| p.id != id);
    save_projects(&projects)
}

async fn stop_project_containers(project: &DockerProject) -> Result<(), String> {
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
            let _ = CliExecutor::run(DOCKER, &["rm", "-f", &container_name]).await;
        }
        "devcontainer" => {
            let label_filter = format!(
                "label=devcontainer.local_folder={}",
                project.workspace_path
            );
            if let Ok(out) = CliExecutor::run(
                DOCKER,
                &["ps", "-q", "--filter", &label_filter],
            )
            .await
            {
                for cid in out.lines() {
                    let cid = cid.trim();
                    if !cid.is_empty() {
                        let _ = CliExecutor::run(DOCKER, &["rm", "-f", cid]).await;
                    }
                }
            }
        }
        _ => {}
    }
    Ok(())
}

async fn collect_env_args(project: &DockerProject, app: &AppHandle, event_name: &str) -> Result<Vec<String>, String> {
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

    // Add manual env vars (these override dotenv and command)
    for var in &project.env_vars {
        env_args.push("-e".to_string());
        env_args.push(format!("{}={}", var.key, var.value));
    }

    Ok(env_args)
}

#[tauri::command]
pub async fn docker_project_up(app: AppHandle, id: String) -> Result<(), String> {
    let projects = load_projects()?;
    let project = find_project(&projects, &id)?;

    let event_name = format!("docker-project-log-{}", project.id);

    match project.project_type.as_str() {
        "compose" => compose_up(&app, &project, &event_name).await,
        "dockerfile" => dockerfile_up(&app, &project, &event_name).await,
        "devcontainer" => devcontainer_project_up(&app, &project, &event_name).await,
        _ => Err(format!("Unknown project type: {}", project.project_type)),
    }
}

async fn compose_up(
    app: &AppHandle,
    project: &DockerProject,
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

    // Add env file if specified
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

    // Collect env vars (from env_command + manual) into a temp env file for compose
    let collected = collect_env_args(project, app, event_name).await?;
    let _temp_env_file = if !collected.is_empty() {
        // collected is ["-e", "KEY=VALUE", "-e", "KEY=VALUE", ...]
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
    project: &DockerProject,
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

    let mut build_child = Command::new(DOCKER)
        .args([
            "build",
            "-t",
            &image_tag,
            "-f",
            dockerfile,
            ".",
        ])
        .current_dir(&project.workspace_path)
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
    let _ = CliExecutor::run(DOCKER, &["rm", "-f", &container_name]).await;

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

    let mut run_child = Command::new(DOCKER)
        .args(&str_args)
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
    project: &DockerProject,
    event_name: &str,
) -> Result<(), String> {
    let cli = find_devcontainer_cli().ok_or(
        "devcontainer CLI not found. Install with: npm install -g @devcontainers/cli",
    )?;

    let docker_host_val = docker_host();

    let mut args = vec!["up", "--workspace-folder"];
    let ws = project.workspace_path.clone();
    args.push(&ws);

    let mut child = Command::new(&cli)
        .args(&args)
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
pub async fn docker_project_stop(id: String) -> Result<(), String> {
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
            CliExecutor::run(DOCKER, &["stop", &container_name]).await?;
        }
        "devcontainer" => {
            let label_filter = format!(
                "label=devcontainer.local_folder={}",
                project.workspace_path
            );
            let output = CliExecutor::run(
                DOCKER,
                &["ps", "-q", "--filter", &label_filter],
            )
            .await?;
            for cid in output.lines() {
                let cid = cid.trim();
                if !cid.is_empty() {
                    CliExecutor::run(DOCKER, &["stop", cid]).await?;
                }
            }
        }
        _ => return Err("Unknown project type".to_string()),
    }

    Ok(())
}

#[tauri::command]
pub async fn docker_project_logs(app: AppHandle, id: String) -> Result<(), String> {
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
                let mut child = Command::new(DOCKER)
                    .args(["logs", "-f", "--tail", "200", cid])
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
pub async fn docker_project_rebuild(app: AppHandle, id: String) -> Result<(), String> {
    let projects = load_projects()?;
    let project = find_project(&projects, &id)?;
    let event_name = format!("docker-project-log-{}", project.id);

    // Stop first
    let _ = docker_project_stop(id.clone()).await;

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
        docker_host_val, DOCKER, container_id, settings.shell
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
