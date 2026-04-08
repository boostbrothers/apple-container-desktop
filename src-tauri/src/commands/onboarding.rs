use serde::Serialize;
use tokio::process::Command;

#[derive(Debug, Serialize, Clone)]
pub struct ColimaInstallCheck {
    pub installed: bool,
    pub path: Option<String>,
}

#[tauri::command]
pub async fn check_colima_installed() -> Result<ColimaInstallCheck, String> {
    let output = Command::new("which")
        .arg("colima")
        .output()
        .await
        .map_err(|e| format!("Failed to execute which: {}", e))?;

    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(ColimaInstallCheck {
            installed: true,
            path: Some(path),
        })
    } else {
        Ok(ColimaInstallCheck {
            installed: false,
            path: None,
        })
    }
}

#[tauri::command]
pub async fn check_onboarding_needed() -> Result<bool, String> {
    let config_dir = dirs::config_dir().ok_or("Cannot find config directory")?;
    let settings_path = config_dir.join("colima-desktop").join("app-settings.json");
    Ok(!settings_path.exists())
}

#[tauri::command]
pub async fn complete_onboarding() -> Result<(), String> {
    let config_dir = dirs::config_dir().ok_or("Cannot find config directory")?;
    let app_dir = config_dir.join("colima-desktop");
    tokio::fs::create_dir_all(&app_dir)
        .await
        .map_err(|e| format!("Failed to create config dir: {}", e))?;
    let settings_path = app_dir.join("app-settings.json");
    tokio::fs::write(&settings_path, "{}")
        .await
        .map_err(|e| format!("Failed to write settings: {}", e))?;
    Ok(())
}
