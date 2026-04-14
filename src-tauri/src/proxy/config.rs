use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DomainConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_true")]
    pub auto_register: bool,
    #[serde(default = "default_domain_suffix")]
    pub domain_suffix: String,
    #[serde(default)]
    pub container_overrides: HashMap<String, ContainerDomainOverride>,
}

fn default_domain_suffix() -> String {
    "container.local".to_string()
}

fn default_true() -> bool {
    true
}

impl Default for DomainConfig {
    fn default() -> Self {
        DomainConfig {
            enabled: true,
            auto_register: true,
            domain_suffix: default_domain_suffix(),
            container_overrides: HashMap::new(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ContainerDomainOverride {
    pub enabled: bool,
    #[serde(default)]
    pub hostname: Option<String>,
    #[serde(default)]
    pub port: Option<u16>,
}

pub async fn load_config(config_path: &PathBuf) -> DomainConfig {
    match tokio::fs::read_to_string(config_path).await {
        Ok(content) => serde_json::from_str(&content).unwrap_or_default(),
        Err(_) => DomainConfig::default(),
    }
}

pub async fn save_config(config_path: &PathBuf, config: &DomainConfig) -> Result<(), String> {
    if let Some(parent) = config_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("Failed to create config dir: {}", e))?;
    }
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    tokio::fs::write(config_path, json)
        .await
        .map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}
