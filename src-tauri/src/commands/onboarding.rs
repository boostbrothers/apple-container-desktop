use crate::cli::executor::find_binary;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct ContainerInstallCheck {
    pub installed: bool,
    pub path: Option<String>,
}

#[tauri::command]
pub async fn check_container_installed() -> Result<ContainerInstallCheck, String> {
    match find_binary("container") {
        Some(path) => Ok(ContainerInstallCheck {
            installed: true,
            path: Some(path),
        }),
        None => Ok(ContainerInstallCheck {
            installed: false,
            path: None,
        }),
    }
}

#[tauri::command]
pub async fn check_onboarding_needed() -> Result<bool, String> {
    let config_dir = dirs::config_dir().ok_or("Cannot find config directory")?;
    let settings_path = config_dir
        .join("apple-container-desktop")
        .join("app-settings.json");
    Ok(!settings_path.exists())
}

#[tauri::command]
pub async fn complete_onboarding() -> Result<(), String> {
    let config_dir = dirs::config_dir().ok_or("Cannot find config directory")?;
    let app_dir = config_dir.join("apple-container-desktop");
    tokio::fs::create_dir_all(&app_dir)
        .await
        .map_err(|e| format!("Failed to create config dir: {}", e))?;
    let settings_path = app_dir.join("app-settings.json");
    tokio::fs::write(&settings_path, "{}")
        .await
        .map_err(|e| format!("Failed to write settings: {}", e))?;
    Ok(())
}
