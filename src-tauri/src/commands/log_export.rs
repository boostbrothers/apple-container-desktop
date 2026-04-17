use std::path::PathBuf;

#[tauri::command]
pub async fn write_log_file(path: String, content: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    std::fs::write(&path_buf, content).map_err(|e| format!("Failed to write log file: {}", e))
}
