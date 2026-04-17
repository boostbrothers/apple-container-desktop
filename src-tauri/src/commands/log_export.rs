use std::path::{Path, PathBuf};

#[tauri::command]
pub async fn write_log_file(path: String, content: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    validate_export_path(&path_buf)?;
    std::fs::write(&path_buf, content).map_err(|e| format!("Failed to write log file: {}", e))
}

fn validate_export_path(path: &Path) -> Result<(), String> {
    let extension = path
        .extension()
        .and_then(|e| e.to_str())
        .map(str::to_ascii_lowercase);
    if extension.as_deref() != Some("log") {
        return Err("Log export path must end with .log".to_string());
    }
    let parent = path
        .parent()
        .ok_or_else(|| "Log export path must include a parent directory".to_string())?;
    if !parent.as_os_str().is_empty() && !parent.exists() {
        return Err(format!("Parent directory does not exist: {}", parent.display()));
    }
    Ok(())
}
