use crate::cli::executor::CliExecutor;
use crate::cli::types::DockerPsEntry;
use crate::proxy::config::DomainConfig;
use serde::Serialize;
use std::collections::HashMap;
use std::net::Ipv4Addr;

const DOCKER: &str = "docker";
const DOMAIN_SUFFIX: &str = "colima.local";

#[derive(Debug, Serialize, Clone)]
pub struct DomainSyncResult {
    pub services: Vec<DomainServiceEntry>,
}

#[derive(Debug, Serialize, Clone)]
pub struct DomainServiceEntry {
    pub container_id: String,
    pub container_name: String,
    pub hostname: String,
    pub domain: String,
    pub port: u16,
    pub registered: bool,
    pub auto_registered: bool,
}

/// Sync running containers with DNS table and proxy route table.
/// Returns the current state of all domain services.
pub async fn sync_containers(
    config: &DomainConfig,
    dns_table: &mut HashMap<String, Ipv4Addr>,
    proxy_routes: &mut HashMap<String, u16>,
) -> Result<DomainSyncResult, String> {
    // 1. Get running containers
    let entries: Vec<DockerPsEntry> = match CliExecutor::run_json_lines(
        DOCKER,
        &["ps", "--format", "{{json .}}"],
    )
    .await
    {
        Ok(e) => e,
        Err(_) => return Ok(DomainSyncResult { services: vec![] }),
    };

    let running: HashMap<String, &DockerPsEntry> =
        entries.iter().map(|e| (e.names.clone(), e)).collect();

    // 2. Clear tables — rebuild from scratch each sync
    dns_table.clear();
    proxy_routes.clear();

    let mut result_services = Vec::new();

    for entry in &entries {
        let name = &entry.names;

        if let Some(ovr) = config.container_overrides.get(name) {
            if !ovr.enabled {
                continue;
            }

            let hostname = ovr.hostname.as_deref().unwrap_or(name);
            let port = ovr.port.or_else(|| parse_first_host_port(&entry.ports));

            if let Some(port) = port {
                let domain = format!("{}.{}", hostname, DOMAIN_SUFFIX);
                dns_table.insert(domain.clone(), Ipv4Addr::LOCALHOST);
                proxy_routes.insert(domain.clone(), port);
                result_services.push(DomainServiceEntry {
                    container_id: entry.id.clone(),
                    container_name: name.clone(),
                    hostname: hostname.to_string(),
                    domain,
                    port,
                    registered: true,
                    auto_registered: false,
                });
            }
        } else if config.auto_register {
            if let Some(port) = parse_first_host_port(&entry.ports) {
                let domain = format!("{}.{}", name, DOMAIN_SUFFIX);
                dns_table.insert(domain.clone(), Ipv4Addr::LOCALHOST);
                proxy_routes.insert(domain.clone(), port);
                result_services.push(DomainServiceEntry {
                    container_id: entry.id.clone(),
                    container_name: name.clone(),
                    hostname: name.clone(),
                    domain,
                    port,
                    registered: true,
                    auto_registered: true,
                });
            }
        }
    }

    Ok(DomainSyncResult {
        services: result_services,
    })
}

pub fn parse_first_host_port(ports: &str) -> Option<u16> {
    // Format: "0.0.0.0:8080->80/tcp, :::8080->80/tcp"
    let segment = ports.split(',').next()?;
    let arrow = segment.find("->")?;
    let before_arrow = &segment[..arrow];
    let colon_pos = before_arrow.rfind(':')?;
    let port_str = &before_arrow[colon_pos + 1..];
    port_str.trim().parse::<u16>().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_first_host_port() {
        assert_eq!(parse_first_host_port("0.0.0.0:8080->80/tcp"), Some(8080));
        assert_eq!(
            parse_first_host_port("0.0.0.0:8080->80/tcp, :::8080->80/tcp"),
            Some(8080)
        );
        assert_eq!(parse_first_host_port("80/tcp"), None);
        assert_eq!(parse_first_host_port(""), None);
    }
}
