use crate::cli::executor::{container_cmd, CliExecutor, EXTENDED_PATH};
use crate::cli::types::{ImageListEntry, Image};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[tauri::command]
pub async fn list_images() -> Result<Vec<Image>, String> {
    let entries: Vec<ImageListEntry> =
        CliExecutor::run_json_array(container_cmd(), &["image", "list", "--format", "json"]).await?;
    Ok(entries.into_iter().map(Image::from).collect())
}

#[tauri::command]
pub async fn pull_image(app: AppHandle, name: String) -> Result<(), String> {
    let mut child = Command::new(container_cmd())
        .args(["image", "pull", &name])
        .env("PATH", &*EXTENDED_PATH)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn image pull: {}", e))?;

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
        .map_err(|e| format!("image pull failed: {}", e))?;

    if output.success() {
        let _ = app.emit("image-pull-complete", &name);
        Ok(())
    } else {
        Err(format!("image pull {} failed", name))
    }
}

#[tauri::command]
pub async fn remove_image(id: String) -> Result<(), String> {
    CliExecutor::run(container_cmd(), &["image", "delete", &id]).await?;
    Ok(())
}

#[tauri::command]
pub async fn prune_images() -> Result<String, String> {
    CliExecutor::run(container_cmd(), &["image", "prune", "-a"]).await
}
