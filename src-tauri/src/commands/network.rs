use crate::cli::executor::{docker_cmd, CliExecutor};
use crate::cli::types::{DockerNetworkEntry, Network};

#[tauri::command]
pub async fn list_networks() -> Result<Vec<Network>, String> {
    let entries: Vec<DockerNetworkEntry> =
        CliExecutor::run_json_lines(docker_cmd(), &["network", "ls", "--format", "json"]).await?;
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
    CliExecutor::run(docker_cmd(), &args).await
}

#[tauri::command]
pub async fn remove_network(id: String) -> Result<(), String> {
    CliExecutor::run(docker_cmd(), &["network", "rm", &id]).await?;
    Ok(())
}

#[tauri::command]
pub async fn prune_networks() -> Result<String, String> {
    CliExecutor::run(docker_cmd(), &["network", "prune", "-f"]).await
}
