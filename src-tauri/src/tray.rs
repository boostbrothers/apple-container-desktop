use tauri::{
    menu::{Menu, MenuBuilder, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, Runtime,
};

use crate::cli::executor::{container_cmd, CliExecutor};
use crate::cli::types::{ContainerListEntry, Container, SystemStatus};

async fn fetch_system_status() -> SystemStatus {
    let result = CliExecutor::run("container", &["system", "status"]).await;
    match result {
        Ok(stdout) => {
            let running = stdout.to_lowercase().contains("running");
            let version = CliExecutor::run("container", &["system", "version"])
                .await
                .unwrap_or_default();
            SystemStatus {
                running,
                version: version.trim().to_string(),
            }
        }
        Err(_) => SystemStatus::stopped(),
    }
}

async fn fetch_all_containers() -> Vec<Container> {
    match CliExecutor::run_json_array::<ContainerListEntry>(
        container_cmd(),
        &["list", "-a", "--format", "json"],
    )
    .await
    {
        Ok(entries) => entries.into_iter().map(Container::from).collect(),
        Err(_) => Vec::new(),
    }
}

fn build_tray_menu<R: Runtime>(
    app: &tauri::AppHandle<R>,
    status: &SystemStatus,
    containers: &[Container],
) -> tauri::Result<Menu<R>> {
    let mut builder = MenuBuilder::new(app);

    // -- Status section --
    if status.running {
        let status_text = "Container: Running".to_string();
        builder = builder.item(&MenuItem::with_id(
            app,
            "status_info",
            &status_text,
            false,
            None::<&str>,
        )?);
    } else {
        builder = builder.item(&MenuItem::with_id(
            app,
            "status_info",
            "Container: Stopped",
            false,
            None::<&str>,
        )?);
    }

    builder = builder.separator();

    // -- Container section --
    if status.running && !containers.is_empty() {
        let running_count = containers.iter().filter(|c| c.state == "running").count();
        let stopped_count = containers.len() - running_count;
        let header = format!(
            "Containers ({} running{})",
            running_count,
            if stopped_count > 0 { format!(", {} stopped", stopped_count) } else { String::new() }
        );
        builder = builder.item(&MenuItem::with_id(
            app,
            "containers_header",
            &header,
            false,
            None::<&str>,
        )?);

        for container in containers.iter().take(15) {
            let is_running = container.state == "running";
            let state_icon = if is_running { "●" } else { "○" };
            let label = format!("{} {} ({})", state_icon, container.name, container.image);

            let submenu = if is_running {
                Submenu::with_items(
                    app,
                    &label,
                    true,
                    &[
                        &MenuItem::with_id(
                            app,
                            &format!("container_restart_{}", container.id),
                            "Restart",
                            true,
                            None::<&str>,
                        )?,
                        &MenuItem::with_id(
                            app,
                            &format!("container_stop_{}", container.id),
                            "Stop",
                            true,
                            None::<&str>,
                        )?,
                    ],
                )?
            } else {
                Submenu::with_items(
                    app,
                    &label,
                    true,
                    &[
                        &MenuItem::with_id(
                            app,
                            &format!("container_start_{}", container.id),
                            "Start",
                            true,
                            None::<&str>,
                        )?,
                        &MenuItem::with_id(
                            app,
                            &format!("container_remove_{}", container.id),
                            "Remove",
                            true,
                            None::<&str>,
                        )?,
                    ],
                )?
            };
            builder = builder.item(&submenu);
        }

        if containers.len() > 15 {
            let more = format!("  ... and {} more", containers.len() - 15);
            builder = builder.item(&MenuItem::with_id(
                app,
                "more_containers",
                &more,
                false,
                None::<&str>,
            )?);
        }

        builder = builder.separator();
    } else if status.running {
        builder = builder.item(&MenuItem::with_id(
            app,
            "no_containers",
            "No containers",
            false,
            None::<&str>,
        )?);
        builder = builder.separator();
    }

    // -- Container controls --
    if status.running {
        builder = builder
            .item(&MenuItem::with_id(
                app,
                "system_stop",
                "Stop Container",
                true,
                None::<&str>,
            )?)
            .item(&MenuItem::with_id(
                app,
                "system_restart",
                "Restart Container",
                true,
                None::<&str>,
            )?);
    } else {
        builder = builder.item(&MenuItem::with_id(
            app,
            "system_start",
            "Start Container",
            true,
            None::<&str>,
        )?);
    }

    builder = builder.separator();

    // -- App controls --
    builder = builder
        .item(&MenuItem::with_id(
            app,
            "show",
            "Show Window",
            true,
            None::<&str>,
        )?)
        .item(&PredefinedMenuItem::separator(app)?)
        .item(&MenuItem::with_id(
            app,
            "quit",
            "Quit Apple Container Desktop",
            true,
            None::<&str>,
        )?);

    builder.build()
}

pub fn create_tray<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    // Build initial menu (stopped state, no containers)
    let initial_status = SystemStatus::stopped();
    let menu = build_tray_menu(&app.handle(), &initial_status, &[])?;

    let tray_icon = {
        let icon_bytes = include_bytes!("../icons/tray-icon@2x.png");
        let img = image::load_from_memory(icon_bytes).expect("Failed to load tray icon");
        let rgba = img.to_rgba8();
        let (width, height) = rgba.dimensions();
        tauri::image::Image::new_owned(rgba.into_raw(), width, height)
    };

    let tray = TrayIconBuilder::new()
        .icon(tray_icon)
        .icon_as_template(true)
        .menu(&menu)
        .tooltip("Apple Container Desktop")
        .on_menu_event(move |app, event| {
            let id = event.id.as_ref().to_string();

            match id.as_str() {
                "quit" => {
                    app.exit(0);
                }
                "show" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
                "system_start" => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = crate::commands::system::system_start().await;
                        let _ = app.emit("system-status-changed", ());
                        refresh_tray(&app).await;
                    });
                }
                "system_stop" => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = crate::commands::system::system_stop().await;
                        let _ = app.emit("system-status-changed", ());
                        refresh_tray(&app).await;
                    });
                }
                "system_restart" => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = crate::commands::system::system_restart().await;
                        let _ = app.emit("system-status-changed", ());
                        refresh_tray(&app).await;
                    });
                }
                _ => {
                    if let Some(container_id) = id.strip_prefix("container_stop_") {
                        let app = app.clone();
                        let container_id = container_id.to_string();
                        tauri::async_runtime::spawn(async move {
                            let _ = crate::commands::container::container_stop(container_id).await;
                            let _ = app.emit("system-status-changed", ());
                            refresh_tray(&app).await;
                        });
                    } else if let Some(container_id) = id.strip_prefix("container_restart_") {
                        let app = app.clone();
                        let container_id = container_id.to_string();
                        tauri::async_runtime::spawn(async move {
                            let _ =
                                crate::commands::container::container_restart(container_id).await;
                            let _ = app.emit("system-status-changed", ());
                            refresh_tray(&app).await;
                        });
                    } else if let Some(container_id) = id.strip_prefix("container_start_") {
                        let app = app.clone();
                        let container_id = container_id.to_string();
                        tauri::async_runtime::spawn(async move {
                            let _ = crate::commands::container::container_start(container_id).await;
                            let _ = app.emit("system-status-changed", ());
                            refresh_tray(&app).await;
                        });
                    } else if let Some(container_id) = id.strip_prefix("container_remove_") {
                        let app = app.clone();
                        let container_id = container_id.to_string();
                        tauri::async_runtime::spawn(async move {
                            let _ = crate::commands::container::container_remove(container_id).await;
                            let _ = app.emit("system-status-changed", ());
                            refresh_tray(&app).await;
                        });
                    }
                }
            }
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    // Store tray ID for later menu updates
    let tray_id = tray.id().clone();
    app.manage(TrayState(tray_id));

    // Start background refresh task
    let app_handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        // Initial refresh after a short delay
        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
        refresh_tray(&app_handle).await;

        // Periodic refresh every 5 seconds
        let mut interval = tokio::time::interval(std::time::Duration::from_secs(5));
        loop {
            interval.tick().await;
            refresh_tray(&app_handle).await;
        }
    });

    Ok(())
}

struct TrayState(tauri::tray::TrayIconId);

async fn refresh_tray<R: Runtime>(app: &tauri::AppHandle<R>) {
    let status = fetch_system_status().await;
    let containers = if status.running {
        fetch_all_containers().await
    } else {
        Vec::new()
    };

    // Update tooltip with summary
    let tooltip = if status.running {
        let container_count = containers.len();
        format!(
            "Apple Container Desktop - Running\n{} container{}",
            container_count,
            if container_count == 1 { "" } else { "s" },
        )
    } else {
        "Apple Container Desktop - Stopped".to_string()
    };

    if let Some(tray_state) = app.try_state::<TrayState>() {
        if let Some(tray) = app.tray_by_id(&tray_state.0) {
            let _ = tray.set_tooltip(Some(&tooltip));
            if let Ok(menu) = build_tray_menu(app, &status, &containers) {
                let _ = tray.set_menu(Some(menu));
            }
        }
    }
}
