use crate::cli::executor::{docker_cmd, CliExecutor};
use crate::cli::types::{DockerVolumeEntry, Volume};

#[tauri::command]
pub async fn list_volumes() -> Result<Vec<Volume>, String> {
    let entries: Vec<DockerVolumeEntry> =
        CliExecutor::run_json_lines(docker_cmd(), &["volume", "ls", "--format", "json"]).await?;
    Ok(entries.into_iter().map(Volume::from).collect())
}

#[tauri::command]
pub async fn create_volume(name: String, driver: Option<String>) -> Result<String, String> {
    let mut args = vec!["volume", "create"];
    let driver_val;
    if let Some(ref d) = driver {
        if !d.is_empty() && d != "local" {
            driver_val = d.clone();
            args.push("--driver");
            args.push(&driver_val);
        }
    }
    args.push(&name);
    CliExecutor::run(docker_cmd(), &args).await
}

#[tauri::command]
pub async fn remove_volume(name: String) -> Result<(), String> {
    CliExecutor::run(docker_cmd(), &["volume", "rm", &name]).await?;
    Ok(())
}

#[tauri::command]
pub async fn prune_volumes() -> Result<String, String> {
    CliExecutor::run(docker_cmd(), &["volume", "prune", "-f"]).await
}
