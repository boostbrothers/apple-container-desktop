use crate::proxy::config::{self as domain_config, ContainerDomainOverride, DomainConfig};
use crate::proxy::dns::{DnsServer, DnsTable};
use crate::proxy::server::{ProxyServer, RouteTable};
use crate::proxy::sync::{self, DomainSyncResult};
use serde::Serialize;
use std::net::Ipv4Addr;
use std::path::PathBuf;
use std::sync::Arc;
use tauri::{Manager, State};
use tokio::sync::{Mutex, Notify};

const DNS_PORT: u16 = 5553;
const PROXY_PORT: u16 = 80;
const DOMAIN_SUFFIX: &str = "colima.local";

/// Managed state for the DNS + Proxy subsystem.
pub struct ProxyState {
    pub proxy_routes: RouteTable,
    pub dns_table: DnsTable,
    pub proxy_shutdown: Arc<Notify>,
    pub dns_shutdown: Arc<Notify>,
    pub running: Arc<Mutex<bool>>,
}

impl ProxyState {
    pub fn new() -> Self {
        Self {
            proxy_routes: Arc::new(Mutex::new(std::collections::HashMap::new())),
            dns_table: Arc::new(Mutex::new(std::collections::HashMap::new())),
            proxy_shutdown: Arc::new(Notify::new()),
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
    pub target_port: u16,
}

#[derive(Serialize)]
pub struct ProxyStatus {
    pub running: bool,
    pub proxy_port: u16,
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
    let mut routes = state.proxy_routes.lock().await;

    sync::sync_containers(&config, &mut dns, &mut routes).await
}

// ─── Start / Stop ───────────────────────────────────────────────────────────

#[tauri::command]
pub async fn proxy_start(state: State<'_, ProxyState>) -> Result<(), String> {
    let mut running = state.running.lock().await;
    if *running {
        return Ok(());
    }

    let dns_table = Arc::clone(&state.dns_table);
    let dns_shutdown = Arc::clone(&state.dns_shutdown);
    tokio::spawn(async move {
        let server = DnsServer::with_shared(DNS_PORT, dns_table, dns_shutdown);
        if let Err(e) = server.run().await {
            eprintln!("DNS server error: {}", e);
        }
    });

    let routes = Arc::clone(&state.proxy_routes);
    let proxy_shutdown = Arc::clone(&state.proxy_shutdown);
    tokio::spawn(async move {
        let server = ProxyServer::with_shared(PROXY_PORT, routes, proxy_shutdown);
        if let Err(e) = server.run().await {
            eprintln!("Proxy server error: {}", e);
        }
    });

    *running = true;
    Ok(())
}

#[tauri::command]
pub async fn proxy_stop(state: State<'_, ProxyState>) -> Result<(), String> {
    let mut running = state.running.lock().await;
    if !*running {
        return Ok(());
    }
    state.proxy_shutdown.notify_one();
    state.dns_shutdown.notify_one();
    *running = false;
    Ok(())
}

// ─── Status ─────────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn proxy_get_status(state: State<'_, ProxyState>) -> Result<ProxyStatus, String> {
    let running = *state.running.lock().await;
    let table = state.proxy_routes.lock().await;
    let routes: Vec<ProxyRoute> = table
        .iter()
        .map(|(hostname, port)| ProxyRoute {
            hostname: hostname.clone(),
            target_port: *port,
        })
        .collect();

    Ok(ProxyStatus {
        running,
        proxy_port: PROXY_PORT,
        dns_port: DNS_PORT,
        domain_suffix: DOMAIN_SUFFIX.to_string(),
        resolver_installed: check_resolver_installed(),
        routes,
    })
}

// ─── Route Management ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn proxy_add_route(
    state: State<'_, ProxyState>,
    hostname: String,
    target_port: u16,
) -> Result<(), String> {
    let fqdn = if hostname.ends_with(DOMAIN_SUFFIX) {
        hostname
    } else {
        format!("{}.{}", hostname, DOMAIN_SUFFIX)
    };
    state
        .proxy_routes
        .lock()
        .await
        .insert(fqdn.clone(), target_port);
    state
        .dns_table
        .lock()
        .await
        .insert(fqdn, Ipv4Addr::LOCALHOST);
    Ok(())
}

#[tauri::command]
pub async fn proxy_remove_route(
    state: State<'_, ProxyState>,
    hostname: String,
) -> Result<(), String> {
    let fqdn = if hostname.ends_with(DOMAIN_SUFFIX) {
        hostname
    } else {
        format!("{}.{}", hostname, DOMAIN_SUFFIX)
    };
    state.proxy_routes.lock().await.remove(&fqdn);
    state.dns_table.lock().await.remove(&fqdn);
    Ok(())
}

// ─── /etc/resolver ──────────────────────────────────────────────────────────

#[tauri::command]
pub async fn proxy_install_resolver() -> Result<(), String> {
    let content = format!("nameserver 127.0.0.1\\nport {}", DNS_PORT);
    let script = format!(
        r#"do shell script "mkdir -p /etc/resolver && printf '{}\\n' > /etc/resolver/{}" with administrator privileges"#,
        content, DOMAIN_SUFFIX
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
pub async fn proxy_uninstall_resolver() -> Result<(), String> {
    let script = format!(
        r#"do shell script "rm -f /etc/resolver/{}" with administrator privileges"#,
        DOMAIN_SUFFIX
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

fn check_resolver_installed() -> bool {
    let path = format!("/etc/resolver/{}", DOMAIN_SUFFIX);
    std::path::Path::new(&path).exists()
}
