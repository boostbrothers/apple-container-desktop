mod cli;
mod commands;
pub mod crypto;

mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_liquid_glass::init())
        .invoke_handler(tauri::generate_handler![
            // System
            commands::system::system_status,
            commands::system::system_start,
            commands::system::system_stop,
            commands::system::system_restart,
            // Containers
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
            // Images
            commands::image::list_images,
            commands::image::pull_image,
            commands::image::remove_image,
            commands::image::prune_images,
            // Resource Settings
            commands::resource_settings::get_resource_settings,
            commands::resource_settings::get_host_info,
            commands::resource_settings::apply_resource_settings,
            // Volumes
            commands::volume::list_volumes,
            commands::volume::create_volume,
            commands::volume::remove_volume,
            commands::volume::prune_volumes,
            // Networks
            commands::network::list_networks,
            commands::network::create_network,
            commands::network::remove_network,
            commands::network::prune_networks,
            // Registry Settings
            commands::registry_settings::get_registry_settings,
            commands::registry_settings::registry_login,
            commands::registry_settings::registry_logout,
            commands::registry_settings::set_default_registry,
            // Update
            commands::update::get_container_version,
            // Projects
            commands::project::detect_project_type,
            commands::project::list_projects,
            commands::project::add_project,
            commands::project::update_project,
            commands::project::remove_project,
            commands::project::project_up,
            commands::project::project_stop,
            commands::project::project_logs,
            commands::project::project_rebuild,
            commands::project::load_dotenv_file,
            commands::project::run_env_command,
            commands::project::open_terminal_exec,
            commands::project::add_service,
            commands::project::update_service,
            commands::project::remove_service,
            commands::project::import_compose,
            commands::project::export_compose,
            // Onboarding
            commands::onboarding::check_container_installed,
            commands::onboarding::check_onboarding_needed,
            commands::onboarding::complete_onboarding,
            // Project Env Secrets
            commands::env_secrets::create_profile,
            commands::env_secrets::delete_profile,
            commands::env_secrets::switch_profile,
            commands::env_secrets::set_env_var,
            commands::env_secrets::remove_env_var,
            commands::env_secrets::bulk_import_env,
            commands::env_secrets::load_dotenv_for_profile,
            commands::env_secrets::export_profile_to_dotenv,
            commands::env_secrets::check_infisical_installed,
            commands::env_secrets::configure_infisical,
            commands::env_secrets::sync_infisical,
            commands::env_secrets::test_infisical_connection,
            // Global Env Store
            commands::env_store::list_env_profiles,
            commands::env_store::create_env_profile,
            commands::env_store::delete_env_profile,
            commands::env_store::rename_env_profile,
            commands::env_store::add_global_env_var,
            commands::env_store::remove_global_env_var,
            commands::env_store::toggle_global_env_var,
            commands::env_store::import_dotenv_to_profile,
            commands::env_store::reimport_dotenv,
            commands::env_store::configure_profile_infisical,
            commands::env_store::sync_profile_infisical,
            commands::env_store::test_profile_infisical,
            commands::env_store::get_resolved_env_vars,
            commands::env_store::decrypt_global_env_secret,
            commands::env_store::decrypt_project_env_secret,
            // App Settings
            commands::app_settings::get_app_settings,
            commands::app_settings::save_app_settings,
            // DNS (Apple Container built-in DNS)
            commands::proxy::dns_list,
            commands::proxy::dns_create,
            commands::proxy::dns_delete,
            commands::proxy::dns_set_default,
            // Log export
            commands::log_export::write_log_file,
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
