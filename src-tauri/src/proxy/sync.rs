use crate::cli::executor::CliExecutor;
use crate::cli::types::DockerPsEntry;
use crate::proxy::config::DomainConfig;
use crate::proxy::gateway;
use serde::Serialize;
use std::collections::HashMap;
use std::net::Ipv4Addr;

const DOCKER: &str = "docker";

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

        // Determine hostname, port_routes, and auto flag from config
        let (hostname, port_routes, legacy_port, auto) =
            if let Some(ovr) = config.container_overrides.get(name) {
                if !ovr.enabled {
                    continue;
                }
                let h = ovr.hostname.as_deref().unwrap_or(name).to_string();
                if !ovr.port_routes.is_empty() {
                    (h, ovr.port_routes.clone(), None, false)
                } else {
                    let p = ovr.port.or_else(|| parse_first_host_port(&entry.ports));
                    (h, vec![], p, false)
                }
            } else if config.auto_register {
                let p = parse_first_host_port(&entry.ports);
                (name.clone(), vec![], p, true)
            } else {
                continue;
            };

        // Build list of (route_hostname, container_port) pairs
        let routes: Vec<(String, u16)> = if !port_routes.is_empty() {
            port_routes
                .iter()
                .enumerate()
                .map(|(i, r)| {
                    let rh = if i == 0 {
                        hostname.clone()
                    } else {
                        format!("{}-{}", hostname, r.host_port)
                    };
                    (rh, r.container_port)
                })
                .collect()
        } else {
            match legacy_port {
                Some(p) => vec![(hostname.clone(), p)],
                None => continue,
            }
        };

        // Resolve container IP once (shared across all port routes)
        let container_ip = if gateway_running {
            let _ = gateway::connect_container(name).await;
            gateway::get_container_ip(name).await.ok()
        } else {
            None
        };

        for (route_hostname, container_port) in &routes {
            let domain = format!("{}.{}", route_hostname, config.domain_suffix);

            // DNS: resolve domain to 127.0.0.1
            dns_table.insert(domain.clone(), Ipv4Addr::LOCALHOST);

            // Gateway: write Traefik dynamic config
            let mut registered = false;
            if let Some(ref ip) = container_ip {
                if gateway::write_route_config(route_hostname, &domain, ip, *container_port)
                    .is_ok()
                {
                    registered = true;
                    active_hostnames.push(route_hostname.clone());
                }
            }

            result_services.push(DomainServiceEntry {
                container_id: entry.id.clone(),
                container_name: name.clone(),
                hostname: route_hostname.clone(),
                domain,
                port: *container_port,
                registered,
                auto_registered: auto,
            });
        }
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
