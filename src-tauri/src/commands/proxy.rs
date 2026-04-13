use crate::proxy::config::{self as domain_config, ContainerDomainOverride, DomainConfig};
use crate::proxy::dns::{DnsServer, DnsTable};
use crate::proxy::gateway;
use crate::proxy::sync::{self, DomainSyncResult};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Manager, State};
use tokio::sync::{Mutex, Notify};

const DNS_PORT: u16 = 5553;
const DEFAULT_DOMAIN_SUFFIX: &str = "colima.local";

/// Managed state for the DNS + Gateway subsystem.
pub struct ProxyState {
    pub dns_table: DnsTable,
    pub dns_shutdown: Arc<Notify>,
    pub running: Arc<Mutex<bool>>,
}

impl ProxyState {
    pub fn new() -> Self {
        Self {
            dns_table: Arc::new(Mutex::new(std::collections::HashMap::new())),
            dns_shutdown: Arc::new(Notify::new()),
            running: Arc::new(Mutex::new(false)),
        }
    }
}

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    Ok(dir.join("domain-config.json"))
}

#[derive(Serialize)]
pub struct ProxyRoute {
    pub hostname: String,
    pub domain: String,
    pub target_port: u16,
    pub container_name: String,
}

#[derive(Serialize)]
pub struct ProxyStatus {
    pub running: bool,
    pub gateway_running: bool,
    pub dns_port: u16,
    pub domain_suffix: String,
    pub resolver_installed: bool,
    pub routes: Vec<ProxyRoute>,
}

// ─── Config ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn domain_get_config(app: tauri::AppHandle) -> Result<DomainConfig, String> {
    let path = config_path(&app)?;
    Ok(domain_config::load_config(&path).await)
}

#[tauri::command]
pub async fn domain_set_config(
    app: tauri::AppHandle,
    config: DomainConfig,
) -> Result<(), String> {
    let path = config_path(&app)?;
    domain_config::save_config(&path, &config).await
}

#[tauri::command]
pub async fn domain_set_override(
    app: tauri::AppHandle,
    container_name: String,
    override_config: ContainerDomainOverride,
) -> Result<(), String> {
    let path = config_path(&app)?;
    let mut config = domain_config::load_config(&path).await;
    config
        .container_overrides
        .insert(container_name, override_config);
    domain_config::save_config(&path, &config).await
}

#[tauri::command]
pub async fn domain_remove_override(
    app: tauri::AppHandle,
    container_name: String,
) -> Result<(), String> {
    let path = config_path(&app)?;
    let mut config = domain_config::load_config(&path).await;
    config.container_overrides.remove(&container_name);
    domain_config::save_config(&path, &config).await
}

// ─── Sync ───────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn domain_sync(
    app: tauri::AppHandle,
    state: State<'_, ProxyState>,
) -> Result<DomainSyncResult, String> {
    let path = config_path(&app)?;
    let config = domain_config::load_config(&path).await;

    let mut dns = state.dns_table.lock().await;
    let gw_running = gateway::is_gateway_running().await;

    sync::sync_containers(&config, &mut dns, gw_running).await
}

// ─── Start / Stop ───────────────────────────────────────────────────────────

/// Start DNS server + Traefik gateway. Shared by proxy_start command and auto-start.
pub async fn start_proxy_services(
    dns_table: DnsTable,
    dns_shutdown: Arc<Notify>,
    running: Arc<Mutex<bool>>,
) -> Result<(), String> {
    let mut running_guard = running.lock().await;
    if *running_guard {
        return Ok(());
    }

    // Start DNS server
    let dt = Arc::clone(&dns_table);
    let ds = Arc::clone(&dns_shutdown);
    tokio::spawn(async move {
        let server = DnsServer::with_shared(DNS_PORT, dt, ds);
        if let Err(e) = server.run().await {
            eprintln!("DNS server error: {}", e);
        }
    });

    // Start Traefik gateway container
    gateway::start_gateway().await?;

    *running_guard = true;
    Ok(())
}

#[tauri::command]
pub async fn proxy_start(state: State<'_, ProxyState>) -> Result<(), String> {
    start_proxy_services(
        Arc::clone(&state.dns_table),
        Arc::clone(&state.dns_shutdown),
        Arc::clone(&state.running),
    )
    .await
}

#[tauri::command]
pub async fn proxy_stop(state: State<'_, ProxyState>) -> Result<(), String> {
    let mut running = state.running.lock().await;
    if !*running {
        return Ok(());
    }

    // Stop DNS server
    state.dns_shutdown.notify_one();

    // Stop gateway container
    gateway::stop_gateway().await?;

    // Clear route configs
    let _ = gateway::clear_route_configs();

    *running = false;
    Ok(())
}

// ─── Status ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn proxy_get_status(
    app: tauri::AppHandle,
    state: State<'_, ProxyState>,
) -> Result<ProxyStatus, String> {
    let running = *state.running.lock().await;
    let gw_running = gateway::is_gateway_running().await;
    let path = config_path(&app)?;
    let config = domain_config::load_config(&path).await;
    let suffix = config.domain_suffix.clone();

    let routes = read_active_routes(&suffix);

    Ok(ProxyStatus {
        running,
        gateway_running: gw_running,
        dns_port: DNS_PORT,
        domain_suffix: suffix.clone(),
        resolver_installed: check_resolver_installed(&suffix),
        routes,
    })
}

fn read_active_routes(suffix: &str) -> Vec<ProxyRoute> {
    let config_dir = match gateway::dynamic_config_dir() {
        Ok(d) => d,
        Err(_) => return vec![],
    };

    let mut routes = Vec::new();
    if let Ok(entries) = std::fs::read_dir(&config_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if path.extension().map(|e| e == "yml").unwrap_or(false) {
                if let Ok(content) = std::fs::read_to_string(&path) {
                    // Simple parse: extract Host(`...`) and url
                    if let (Some(domain), Some(url)) = (
                        extract_between(&content, "Host(`", "`)"),
                        extract_between(&content, "url: \"http://", "\""),
                    ) {
                        let port = url
                            .rsplit(':')
                            .next()
                            .and_then(|p| p.parse::<u16>().ok())
                            .unwrap_or(0);
                        let hostname = domain.trim_end_matches(&format!(".{}", suffix));
                        routes.push(ProxyRoute {
                            hostname: hostname.to_string(),
                            domain: domain.to_string(),
                            target_port: port,
                            container_name: hostname.to_string(),
                        });
                    }
                }
            }
        }
    }
    routes
}

fn extract_between<'a>(text: &'a str, start: &str, end: &str) -> Option<String> {
    let s = text.find(start)? + start.len();
    let e = text[s..].find(end)? + s;
    Some(text[s..e].to_string())
}

// ─── /etc/resolver ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn proxy_install_resolver(app: tauri::AppHandle) -> Result<(), String> {
    let path = config_path(&app)?;
    let config = domain_config::load_config(&path).await;
    let suffix = &config.domain_suffix;
    let content = format!("nameserver 127.0.0.1\\nport {}", DNS_PORT);
    let script = format!(
        r#"do shell script "mkdir -p /etc/resolver && printf '{}\\n' > /etc/resolver/{}" with administrator privileges"#,
        content, suffix
    );

    let output = tokio::process::Command::new("osascript")
        .args(["-e", &script])
        .output()
        .await
        .map_err(|e| format!("Failed to run osascript: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to install resolver: {}", stderr));
    }

    Ok(())
}

#[tauri::command]
pub async fn proxy_uninstall_resolver(app: tauri::AppHandle) -> Result<(), String> {
    let path = config_path(&app)?;
    let config = domain_config::load_config(&path).await;
    let suffix = &config.domain_suffix;
    let script = format!(
        r#"do shell script "rm -f /etc/resolver/{}" with administrator privileges"#,
        suffix
    );

    let output = tokio::process::Command::new("osascript")
        .args(["-e", &script])
        .output()
        .await
        .map_err(|e| format!("Failed to run osascript: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to uninstall resolver: {}", stderr));
    }

    Ok(())
}

fn check_resolver_installed(suffix: &str) -> bool {
    let path = format!("/etc/resolver/{}", suffix);
    std::path::Path::new(&path).exists()
}
