use crate::cli::executor::CliExecutor;
use crate::cli::types::DockerPsEntry;
use crate::proxy::config::DomainConfig;
use crate::proxy::gateway;
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

/// Sync running containers with DNS table, and generate Traefik route configs.
/// Containers are connected to the gateway network and their IPs are resolved.
pub async fn sync_containers(
    config: &DomainConfig,
    dns_table: &mut HashMap<String, Ipv4Addr>,
    gateway_running: bool,
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

    // 2. Clear DNS table — rebuild from scratch each sync
    dns_table.clear();

    // 3. Track which route files should exist
    let mut active_hostnames: Vec<String> = Vec::new();
    let mut result_services = Vec::new();

    for entry in &entries {
        let name = &entry.names;

        // Determine hostname and port from config
        let (hostname, port, auto) = if let Some(ovr) = config.container_overrides.get(name) {
            if !ovr.enabled {
                continue;
            }
            let h = ovr.hostname.as_deref().unwrap_or(name);
            let p = ovr.port.or_else(|| parse_first_host_port(&entry.ports));
            (h.to_string(), p, false)
        } else if config.auto_register {
            let p = parse_first_host_port(&entry.ports);
            (name.clone(), p, true)
        } else {
            continue;
        };

        let port = match port {
            Some(p) => p,
            None => continue,
        };

        let domain = format!("{}.{}", hostname, DOMAIN_SUFFIX);

        // DNS: resolve domain to 127.0.0.1 (for host access via /etc/resolver)
        dns_table.insert(domain.clone(), Ipv4Addr::LOCALHOST);

        // Gateway: connect container and write route config
        let mut registered = false;
        if gateway_running {
            // Connect container to gateway network (idempotent)
            if gateway::connect_container(name).await.is_ok() {
                // Get container IP on the gateway network
                if let Ok(ip) = gateway::get_container_ip(name).await {
                    // Write Traefik dynamic config
                    if gateway::write_route_config(&hostname, &domain, &ip, port).is_ok() {
                        registered = true;
                        active_hostnames.push(hostname.clone());
                    }
                }
            }
        }

        result_services.push(DomainServiceEntry {
            container_id: entry.id.clone(),
            container_name: name.clone(),
            hostname: hostname.clone(),
            domain,
            port,
            registered,
            auto_registered: auto,
        });
    }

    // 4. Remove stale route configs (containers that stopped)
    if gateway_running {
        if let Ok(config_dir) = gateway::dynamic_config_dir() {
            if let Ok(entries) = std::fs::read_dir(&config_dir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.extension().map(|e| e == "yml").unwrap_or(false) {
                        let stem = path
                            .file_stem()
                            .and_then(|s| s.to_str())
                            .unwrap_or("")
                            .replace('-', ".");
                        // If no active hostname matches this file, remove it
                        if !active_hostnames.iter().any(|h| h.replace('.', "-") == entry.file_name().to_string_lossy().trim_end_matches(".yml")) {
                            let _ = std::fs::remove_file(&path);
                        }
                    }
                }
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

/// Extract the container-internal port from docker ps ports string.
/// "0.0.0.0:8080->3001/tcp" → 3001
pub fn parse_first_container_port(ports: &str) -> Option<u16> {
    let segment = ports.split(',').next()?;
    let arrow = segment.find("->")?;
    let after_arrow = &segment[arrow + 2..];
    let port_str = after_arrow.split('/').next()?;
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

    #[test]
    fn test_parse_first_container_port() {
        assert_eq!(
            parse_first_container_port("0.0.0.0:8080->3001/tcp"),
            Some(3001)
        );
        assert_eq!(parse_first_container_port("80/tcp"), None);
    }
}
