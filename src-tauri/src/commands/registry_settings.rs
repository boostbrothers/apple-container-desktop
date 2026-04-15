use crate::cli::executor::{CliExecutor, EXTENDED_PATH};
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct RegistryEntry {
    pub registry: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct RegistrySettings {
    pub registries: Vec<RegistryEntry>,
    pub default_domain: String,
}

#[tauri::command]
pub async fn get_registry_settings() -> Result<RegistrySettings, String> {
    let output = CliExecutor::run("container", &["registry", "list"])
        .await
        .unwrap_or_default();
    let registries: Vec<RegistryEntry> = output
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .map(|r| RegistryEntry { registry: r })
        .collect();
    let default_domain = CliExecutor::run(
        "container",
        &["system", "property", "get", "registry.domain"],
    )
    .await
    .unwrap_or_default()
    .trim()
    .to_string();
    Ok(RegistrySettings {
        registries,
        default_domain,
    })
}

#[tauri::command]
pub async fn registry_login(
    registry: String,
    username: String,
    password: String,
) -> Result<(), String> {
    use tokio::io::AsyncWriteExt;
    use tokio::process::Command;

    let mut child = Command::new("container")
        .args([
            "registry",
            "login",
            &registry,
            "-u",
            &username,
            "--password-stdin",
        ])
        .env("PATH", &*EXTENDED_PATH)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(password.as_bytes())
            .await
            .map_err(|e| format!("Failed to write password: {}", e))?;
    }

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| format!("Failed to wait: {}", e))?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Login failed: {}", stderr))
    }
}

#[tauri::command]
pub async fn registry_logout(registry: String) -> Result<(), String> {
    CliExecutor::run("container", &["registry", "logout", &registry]).await?;
    Ok(())
}

#[tauri::command]
pub async fn set_default_registry(domain: String) -> Result<(), String> {
    CliExecutor::run(
        "container",
        &["system", "property", "set", "registry.domain", &domain],
    )
    .await?;
    Ok(())
}
