use crate::cli::executor::{container_cmd, CliExecutor};
use crate::cli::types::{VolumeListEntry, Volume};

#[tauri::command]
pub async fn list_volumes() -> Result<Vec<Volume>, String> {
    let entries: Vec<VolumeListEntry> =
        CliExecutor::run_json_lines(container_cmd(), &["volume", "list", "--format", "json"]).await?;
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
    CliExecutor::run(container_cmd(), &args).await
}

#[tauri::command]
pub async fn remove_volume(name: String) -> Result<(), String> {
    CliExecutor::run(container_cmd(), &["volume", "delete", &name]).await?;
    Ok(())
}

#[tauri::command]
pub async fn prune_volumes() -> Result<String, String> {
    CliExecutor::run(container_cmd(), &["volume", "prune"]).await
}
