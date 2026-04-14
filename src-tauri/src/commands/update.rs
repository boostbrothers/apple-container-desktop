use crate::cli::executor::CliExecutor;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct ContainerVersion {
    pub version: String,
}

#[tauri::command]
pub async fn get_container_version() -> Result<ContainerVersion, String> {
    let output = CliExecutor::run("container", &["system", "version"]).await?;
    Ok(ContainerVersion {
        version: output.trim().to_string(),
    })
}
