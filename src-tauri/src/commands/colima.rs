use crate::cli::executor::CliExecutor;
use crate::cli::types::{ColimaStatus, ColimaStatusRaw};

#[tauri::command]
pub async fn colima_status() -> Result<ColimaStatus, String> {
    let result = CliExecutor::run("colima", &["status", "--json"]).await;
    match result {
        Ok(stdout) => {
            let raw: ColimaStatusRaw = serde_json::from_str(&stdout)
                .map_err(|e| format!("Failed to parse colima status: {}", e))?;
            Ok(raw.into_status())
        }
        Err(_) => Ok(ColimaStatus::stopped()),
    }
}

#[tauri::command]
pub async fn colima_start() -> Result<(), String> {
    CliExecutor::run("colima", &["start"]).await?;
    Ok(())
}

#[tauri::command]
pub async fn colima_stop() -> Result<(), String> {
    CliExecutor::run("colima", &["stop"]).await?;
    Ok(())
}

#[tauri::command]
pub async fn colima_restart() -> Result<(), String> {
    CliExecutor::run("colima", &["stop"]).await.ok();
    CliExecutor::run("colima", &["start"]).await?;
    Ok(())
}
