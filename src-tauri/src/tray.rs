use tauri::{
    menu::{Menu, MenuBuilder, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, Runtime,
};

use crate::cli::executor::CliExecutor;
use crate::cli::types::{ColimaStatus, ColimaStatusRaw, Container, DockerPsEntry};

async fn fetch_colima_status() -> ColimaStatus {
    match CliExecutor::run("colima", &["status", "--json"]).await {
        Ok(stdout) => match serde_json::from_str::<ColimaStatusRaw>(&stdout) {
            Ok(raw) => raw.into_status(),
            Err(_) => ColimaStatus::stopped(),
        },
        Err(_) => ColimaStatus::stopped(),
    }
}

async fn fetch_running_containers() -> Vec<Container> {
    let docker = "/opt/homebrew/bin/docker";
    match CliExecutor::run_json_lines::<DockerPsEntry>(docker, &["ps", "--format", "json"]).await {
        Ok(entries) => entries.into_iter().map(Container::from).collect(),
        Err(_) => Vec::new(),
    }
}

fn build_tray_menu<R: Runtime>(
    app: &tauri::AppHandle<R>,
    status: &ColimaStatus,
    containers: &[Container],
) -> tauri::Result<Menu<R>> {
    let mut builder = MenuBuilder::new(app);

    // -- Status section --
    if status.running {
        let status_text = format!(
            "Colima: Running ({} CPU, {:.1}GB RAM, {:.0}GB Disk)",
            status.cpus, status.memory_gib, status.disk_gib,
        );
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
            "Colima: Stopped",
            false,
            None::<&str>,
        )?);
    }

    builder = builder.separator();

    // -- Container section --
    if status.running && !containers.is_empty() {
        let header = format!("Containers ({})", containers.len());
        builder = builder.item(&MenuItem::with_id(
            app,
            "containers_header",
            &header,
            false,
            None::<&str>,
        )?);

        for container in containers.iter().take(10) {
            let label = format!("  {} ({})", container.name, container.image);
            let stop_id = format!("container_stop_{}", container.id);
            let submenu = Submenu::with_items(
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
                    &MenuItem::with_id(app, &stop_id, "Stop", true, None::<&str>)?,
                ],
            )?;
            builder = builder.item(&submenu);
        }

        if containers.len() > 10 {
            let more = format!("  ... and {} more", containers.len() - 10);
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
            "No running containers",
            false,
            None::<&str>,
        )?);
        builder = builder.separator();
    }

    // -- Colima controls --
    if status.running {
        builder = builder
            .item(&MenuItem::with_id(
                app,
                "colima_stop",
                "Stop Colima",
                true,
                None::<&str>,
            )?)
            .item(&MenuItem::with_id(
                app,
                "colima_restart",
                "Restart Colima",
                true,
                None::<&str>,
            )?);
    } else {
        builder = builder.item(&MenuItem::with_id(
            app,
            "colima_start",
            "Start Colima",
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
            "Quit Colima Desktop",
            true,
            None::<&str>,
        )?);

    builder.build()
}

pub fn create_tray<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    // Build initial menu (stopped state, no containers)
    let initial_status = ColimaStatus::stopped();
    let menu = build_tray_menu(&app.handle(), &initial_status, &[])?;

    let tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("Colima Desktop")
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
                "colima_start" => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = crate::commands::colima::colima_start().await;
                        let _ = app.emit("colima-status-changed", ());
                        refresh_tray(&app).await;
                    });
                }
                "colima_stop" => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = crate::commands::colima::colima_stop().await;
                        let _ = app.emit("colima-status-changed", ());
                        refresh_tray(&app).await;
                    });
                }
                "colima_restart" => {
                    let app = app.clone();
                    tauri::async_runtime::spawn(async move {
                        let _ = crate::commands::colima::colima_restart().await;
                        let _ = app.emit("colima-status-changed", ());
                        refresh_tray(&app).await;
                    });
                }
                _ => {
                    if let Some(container_id) = id.strip_prefix("container_stop_") {
                        let app = app.clone();
                        let container_id = container_id.to_string();
                        tauri::async_runtime::spawn(async move {
                            let _ = crate::commands::container::container_stop(container_id).await;
                            let _ = app.emit("colima-status-changed", ());
                            refresh_tray(&app).await;
                        });
                    } else if let Some(container_id) = id.strip_prefix("container_restart_") {
                        let app = app.clone();
                        let container_id = container_id.to_string();
                        tauri::async_runtime::spawn(async move {
                            let _ =
                                crate::commands::container::container_restart(container_id).await;
                            let _ = app.emit("colima-status-changed", ());
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
    let status = fetch_colima_status().await;
    let containers = if status.running {
        fetch_running_containers().await
    } else {
        Vec::new()
    };

    // Update tooltip with summary
    let tooltip = if status.running {
        let container_count = containers.len();
        format!(
            "Colima Desktop - Running\n{} CPU | {:.1}GB RAM | {:.0}GB Disk\n{} container{}",
            status.cpus,
            status.memory_gib,
            status.disk_gib,
            container_count,
            if container_count == 1 { "" } else { "s" },
        )
    } else {
        "Colima Desktop - Stopped".to_string()
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
