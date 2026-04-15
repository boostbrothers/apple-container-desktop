use crate::cli::executor::{container_cmd, CliExecutor};
use serde::Serialize;

#[derive(Serialize)]
pub struct DnsList {
    pub domains: Vec<String>,
    pub default_domain: String,
}

#[tauri::command]
pub async fn dns_list() -> Result<DnsList, String> {
    let output = CliExecutor::run(container_cmd(), &["system", "dns", "list"])
        .await
        .unwrap_or_default();
    let domains: Vec<String> = output
        .lines()
        .skip(1) // skip header line "DOMAIN"
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    let default_domain =
        CliExecutor::run(container_cmd(), &["system", "property", "get", "dns.domain"])
            .await
            .unwrap_or_default()
            .trim()
            .to_string();
    Ok(DnsList {
        domains,
        default_domain,
    })
}

#[tauri::command]
pub async fn dns_create(domain: String) -> Result<(), String> {
    let bin = container_cmd();
    let script = format!(
        r#"do shell script "{} system dns create {}" with administrator privileges"#,
        bin, domain
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
    Ok(())
}

#[tauri::command]
pub async fn dns_delete(domain: String) -> Result<(), String> {
    let bin = container_cmd();
    let script = format!(
        r#"do shell script "{} system dns delete {}" with administrator privileges"#,
        bin, domain
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
pub async fn dns_set_default(domain: String) -> Result<(), String> {
    CliExecutor::run(
        container_cmd(),
        &["system", "property", "set", "dns.domain", &domain],
    )
    .await?;
    Ok(())
}
