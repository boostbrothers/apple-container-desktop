use crate::cli::types::AppSettings;

fn config_path() -> Result<std::path::PathBuf, String> {
    let config_dir = dirs::config_dir().ok_or("Cannot find config directory")?;
    let app_dir = config_dir.join("colima-desktop");
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create config dir: {}", e))?;
    Ok(app_dir.join("app-settings.json"))
}

pub fn load_app_settings() -> AppSettings {
    let path = match config_path() {
        Ok(p) => p,
        Err(_) => return AppSettings::default(),
    };
    if !path.exists() {
        return AppSettings::default();
    }
    match std::fs::read_to_string(&path) {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => AppSettings::default(),
    }
}

#[tauri::command]
pub async fn get_app_settings() -> Result<AppSettings, String> {
    Ok(load_app_settings())
}

#[tauri::command]
pub async fn save_app_settings(terminal: String, shell: String) -> Result<(), String> {
    let path = config_path()?;
    let settings = AppSettings { terminal, shell };
    let content =
        serde_json::to_string_pretty(&settings).map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(&path, content).map_err(|e| format!("Failed to write: {}", e))?;
    Ok(())
}
