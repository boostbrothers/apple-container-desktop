mod cli;
mod commands;
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_liquid_glass::init())
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
            commands::container::prune_containers,
            commands::container::run_container,
            commands::container::container_inspect,
            commands::container::container_stats,
            commands::image::list_images,
            commands::image::pull_image,
            commands::image::remove_image,
            commands::image::prune_images,
            commands::vm_settings::get_vm_settings,
            commands::vm_settings::get_host_info,
            commands::vm_settings::apply_vm_settings,
            commands::volume::list_volumes,
            commands::volume::create_volume,
            commands::volume::remove_volume,
            commands::volume::prune_volumes,
            commands::network::list_networks,
            commands::network::create_network,
            commands::network::remove_network,
            commands::network::prune_networks,
            commands::mounts::get_mount_settings,
            commands::mounts::save_mount_settings,
            commands::network_settings::get_network_settings,
            commands::network_settings::save_network_settings,
            commands::docker_settings::get_docker_settings,
            commands::docker_settings::save_docker_settings,
            commands::update::get_colima_version,
            commands::update::update_colima_runtime,
            commands::update::check_latest_version,
            commands::devcontainer::check_devcontainer_cli,
            commands::devcontainer::list_devcontainer_projects,
            commands::devcontainer::add_devcontainer_project,
            commands::devcontainer::remove_devcontainer_project,
            commands::devcontainer::devcontainer_up,
            commands::devcontainer::devcontainer_build,
            commands::devcontainer::devcontainer_stop,
            commands::devcontainer::devcontainer_read_config,
            commands::onboarding::check_colima_installed,
            commands::onboarding::check_onboarding_needed,
            commands::onboarding::complete_onboarding,
            commands::docker_project::detect_project_type,
            commands::docker_project::list_docker_projects,
            commands::docker_project::add_docker_project,
            commands::docker_project::update_docker_project,
            commands::docker_project::remove_docker_project,
            commands::docker_project::docker_project_up,
            commands::docker_project::docker_project_stop,
            commands::docker_project::docker_project_logs,
            commands::docker_project::docker_project_rebuild,
            commands::docker_project::load_dotenv_file,
            commands::docker_project::run_env_command,
            commands::docker_project::open_terminal_exec,
            commands::app_settings::get_app_settings,
            commands::app_settings::save_app_settings,
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
