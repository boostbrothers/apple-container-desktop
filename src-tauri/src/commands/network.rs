use crate::cli::executor::{container_cmd, CliExecutor};
use crate::cli::types::{NetworkListEntry, Network};

#[tauri::command]
pub async fn list_networks() -> Result<Vec<Network>, String> {
    let entries: Vec<NetworkListEntry> =
        CliExecutor::run_json_lines(container_cmd(), &["network", "list", "--format", "json"]).await?;
    Ok(entries.into_iter().map(Network::from).collect())
}

#[tauri::command]
pub async fn create_network(name: String, driver: Option<String>) -> Result<String, String> {
    let mut args = vec!["network", "create"];
    let driver_val;
    if let Some(ref d) = driver {
        if !d.is_empty() && d != "bridge" {
            driver_val = d.clone();
            args.push("--driver");
            args.push(&driver_val);
        }
    }
    args.push(&name);
    CliExecutor::run(container_cmd(), &args).await
}

#[tauri::command]
pub async fn remove_network(id: String) -> Result<(), String> {
    CliExecutor::run(container_cmd(), &["network", "delete", &id]).await?;
    Ok(())
}

#[tauri::command]
pub async fn prune_networks() -> Result<String, String> {
    CliExecutor::run(container_cmd(), &["network", "prune"]).await
}
