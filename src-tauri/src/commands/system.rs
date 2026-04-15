use crate::cli::executor::CliExecutor;
use crate::cli::types::SystemStatus;

#[tauri::command]
pub async fn system_status() -> Result<SystemStatus, String> {
    let result = CliExecutor::run("container", &["system", "status"]).await;
    match result {
        Ok(stdout) => {
            let running = stdout.to_lowercase().contains("running");
            let version = CliExecutor::run("container", &["system", "version"])
                .await
                .unwrap_or_default();
            Ok(SystemStatus {
                running,
                version: version.trim().to_string(),
            })
        }
        Err(_) => Ok(SystemStatus::stopped()),
    }
}

#[tauri::command]
pub async fn system_start() -> Result<(), String> {
    CliExecutor::run("container", &["system", "start"]).await?;
    Ok(())
}

#[tauri::command]
pub async fn system_stop() -> Result<(), String> {
    CliExecutor::run("container", &["system", "stop"]).await?;
    Ok(())
}

#[tauri::command]
pub async fn system_restart() -> Result<(), String> {
    CliExecutor::run("container", &["system", "stop"]).await.ok();
    CliExecutor::run("container", &["system", "start"]).await?;
    Ok(())
}
