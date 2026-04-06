use crate::cli::executor::CliExecutor;
use crate::cli::types::{DockerImageEntry, Image};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

const DOCKER: &str = "/opt/homebrew/bin/docker";

#[tauri::command]
pub async fn list_images() -> Result<Vec<Image>, String> {
    let entries: Vec<DockerImageEntry> =
        CliExecutor::run_json_lines(DOCKER, &["images", "--format", "json"]).await?;
    Ok(entries.into_iter().map(Image::from).collect())
}

#[tauri::command]
pub async fn pull_image(app: AppHandle, name: String) -> Result<(), String> {
    let docker_host = crate::cli::executor::docker_host();

    let mut child = Command::new(DOCKER)
        .args(["pull", &name])
        .env("DOCKER_HOST", &docker_host)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn docker pull: {}", e))?;

    let stdout = child.stdout.take().ok_or("No stdout")?;

    let app_clone = app.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_clone.emit("image-pull-progress", &line);
        }
    });

    let output = child
        .wait()
        .await
        .map_err(|e| format!("docker pull failed: {}", e))?;

    if output.success() {
        let _ = app.emit("image-pull-complete", &name);
        Ok(())
    } else {
        Err(format!("docker pull {} failed", name))
    }
}

#[tauri::command]
pub async fn remove_image(id: String) -> Result<(), String> {
    CliExecutor::run(DOCKER, &["rmi", &id]).await?;
    Ok(())
}
