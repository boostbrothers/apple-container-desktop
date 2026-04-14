use crate::cli::executor::CliExecutor;
use crate::proxy::config::{self as domain_config, DomainConfig};
use serde::Serialize;
use std::path::PathBuf;
use tauri::Manager;

fn config_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data dir: {}", e))?;
    Ok(dir.join("domain-config.json"))
}

#[derive(Serialize)]
pub struct DomainStatus {
    pub enabled: bool,
    pub domain_suffix: String,
    pub dns_domains: Vec<String>,
}

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
pub async fn domain_setup(domain: String) -> Result<(), String> {
    let script = format!(
        r#"do shell script "container system dns create {} --localhost" with administrator privileges"#,
        domain
    );
    let output = tokio::process::Command::new("osascript")
        .args(["-e", &script])
        .output()
        .await
        .map_err(|e| format!("Failed to run osascript: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to create DNS domain: {}", stderr));
    }
    CliExecutor::run(
        "container",
        &["system", "property", "set", "dns.domain", &domain],
    )
    .await?;
    Ok(())
}

#[tauri::command]
pub async fn domain_teardown(domain: String) -> Result<(), String> {
    let script = format!(
        r#"do shell script "container system dns delete {}" with administrator privileges"#,
        domain
    );
    let output = tokio::process::Command::new("osascript")
        .args(["-e", &script])
        .output()
        .await
        .map_err(|e| format!("Failed to run osascript: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to delete DNS domain: {}", stderr));
    }
    Ok(())
}

#[tauri::command]
pub async fn domain_status() -> Result<DomainStatus, String> {
    let output = CliExecutor::run("container", &["system", "dns", "list"])
        .await
        .unwrap_or_default();
    let dns_domains: Vec<String> = output
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    let suffix = CliExecutor::run("container", &["system", "property", "get", "dns.domain"])
        .await
        .unwrap_or_else(|_| "container.local".to_string())
        .trim()
        .to_string();
    Ok(DomainStatus {
        enabled: !dns_domains.is_empty(),
        domain_suffix: suffix,
        dns_domains,
    })
}
