mod cli;
mod commands;
pub mod crypto;
pub mod proxy;
mod tray;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_liquid_glass::init())
        .manage(commands::proxy::ProxyState::new())
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
            commands::project::check_devcontainer_cli,
            commands::project_config::read_devcontainer_json,
            commands::project_config::write_devcontainer_json,
            commands::project_config::validate_devcontainer_json,
            commands::onboarding::check_colima_installed,
            commands::onboarding::check_onboarding_needed,
            commands::onboarding::complete_onboarding,
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
            commands::app_settings::get_app_settings,
            commands::app_settings::save_app_settings,
            // Container Domains (DNS + Reverse Proxy)
            commands::proxy::domain_get_config,
            commands::proxy::domain_set_config,
            commands::proxy::domain_set_override,
            commands::proxy::domain_remove_override,
            commands::proxy::domain_sync,
            commands::proxy::proxy_start,
            commands::proxy::proxy_stop,
            commands::proxy::proxy_get_status,
            commands::proxy::proxy_add_route,
            commands::proxy::proxy_remove_route,
            commands::proxy::proxy_install_resolver,
            commands::proxy::proxy_uninstall_resolver,
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
