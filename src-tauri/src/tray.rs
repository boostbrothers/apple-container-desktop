use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    Emitter, Manager, Runtime,
};

pub fn create_tray<R: Runtime>(app: &tauri::App<R>) -> tauri::Result<()> {
    let quit = MenuItem::with_id(app, "quit", "Quit Colima Desktop", true, None::<&str>)?;
    let show = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
    let separator = MenuItem::with_id(app, "sep", "─────────", false, None::<&str>)?;
    let start = MenuItem::with_id(app, "colima_start", "Start Colima", true, None::<&str>)?;
    let stop = MenuItem::with_id(app, "colima_stop", "Stop Colima", true, None::<&str>)?;
    let restart = MenuItem::with_id(app, "colima_restart", "Restart Colima", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&show, &separator, &start, &stop, &restart, &quit])?;

    TrayIconBuilder::new()
        .icon(app.default_window_icon().unwrap().clone())
        .menu(&menu)
        .tooltip("Colima Desktop")
        .on_menu_event(move |app, event| match event.id.as_ref() {
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
                });
            }
            "colima_stop" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = crate::commands::colima::colima_stop().await;
                    let _ = app.emit("colima-status-changed", ());
                });
            }
            "colima_restart" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let _ = crate::commands::colima::colima_restart().await;
                    let _ = app.emit("colima-status-changed", ());
                });
            }
            _ => {}
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

    Ok(())
}
