mod cli;
mod commands;
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            commands::colima::colima_status,
            commands::colima::colima_start,
            commands::colima::colima_stop,
            commands::colima::colima_restart,
            commands::container::list_containers,
            commands::container::container_start,
            commands::container::container_stop,
            commands::container::container_restart,
            commands::container::container_remove,
            commands::container::stream_container_logs,
            commands::image::list_images,
            commands::image::pull_image,
            commands::image::remove_image,
        ])
        .setup(|app| {
            tray::create_tray(app)?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
