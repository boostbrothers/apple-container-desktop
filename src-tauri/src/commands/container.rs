use crate::cli::executor::{container_cmd, CliExecutor, EXTENDED_PATH};
use crate::cli::types::{
    Container, ContainerDetail, ContainerStats, ContainerListEntry, MountInfo, NetworkInfo, PortBinding,
};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[tauri::command]
pub async fn list_containers() -> Result<Vec<Container>, String> {
    let entries: Vec<ContainerListEntry> =
        CliExecutor::run_json_lines(container_cmd(), &["list", "-a", "--format", "json"]).await?;
    Ok(entries.into_iter().map(Container::from).collect())
}

#[tauri::command]
pub async fn container_start(id: String) -> Result<(), String> {
    CliExecutor::run(container_cmd(), &["start", &id]).await?;
    Ok(())
}

#[tauri::command]
pub async fn container_stop(id: String) -> Result<(), String> {
    CliExecutor::run(container_cmd(), &["stop", &id]).await?;
    Ok(())
}

#[tauri::command]
pub async fn container_restart(id: String) -> Result<(), String> {
    CliExecutor::run(container_cmd(), &["stop", &id]).await?;
    CliExecutor::run(container_cmd(), &["start", &id]).await?;
    Ok(())
}

#[tauri::command]
pub async fn container_remove(id: String) -> Result<(), String> {
    CliExecutor::run(container_cmd(), &["delete", "-f", &id]).await?;
    Ok(())
}

#[tauri::command]
pub async fn prune_containers() -> Result<String, String> {
    CliExecutor::run(container_cmd(), &["prune"]).await
}

#[tauri::command]
pub async fn run_container(
    image: String,
    name: Option<String>,
    ports: Option<String>,
    env_vars: Option<Vec<String>>,
) -> Result<String, String> {
    let mut args: Vec<String> = vec!["run".into(), "-d".into()];

    if let Some(n) = name {
        if !n.is_empty() {
            args.push("--name".into());
            args.push(n);
        }
    }

    if let Some(p) = ports {
        for mapping in p.split(',') {
            let mapping = mapping.trim();
            if !mapping.is_empty() {
                args.push("-p".into());
                args.push(mapping.to_string());
            }
        }
    }

    if let Some(envs) = env_vars {
        for e in envs {
            if !e.is_empty() {
                args.push("-e".into());
                args.push(e);
            }
        }
    }

    args.push(image);

    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    CliExecutor::run(container_cmd(), &refs).await
}

#[tauri::command]
pub async fn stream_container_logs(app: AppHandle, id: String) -> Result<(), String> {
    let mut child = Command::new(container_cmd())
        .args(["logs", "-f", "-n", "200", &id])
        .env("PATH", &*EXTENDED_PATH)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn container logs: {}", e))?;

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let stderr = child.stderr.take().ok_or("No stderr")?;
    let event_name = format!("container-log-{}", id);

    let app_clone = app.clone();
    let event_clone = event_name.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_clone.emit(&event_clone, &line);
        }
    });

    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app.emit(&event_name, &line);
        }
    });

    Ok(())
}

#[tauri::command]
pub async fn container_inspect(id: String) -> Result<ContainerDetail, String> {
    let output = CliExecutor::run(container_cmd(), &["inspect", &id]).await?;
    let parsed: serde_json::Value =
        serde_json::from_str(&output).map_err(|e| format!("JSON parse error: {}", e))?;

    let item = parsed
        .as_array()
        .and_then(|arr| arr.first())
        .ok_or("Empty inspect result")?;

    let name = item["Name"]
        .as_str()
        .unwrap_or("")
        .trim_start_matches('/')
        .to_string();
    let image = item["Config"]["Image"].as_str().unwrap_or("").to_string();
    let state = item["State"]["Status"].as_str().unwrap_or("").to_string();
    let started_at = item["State"]["StartedAt"].as_str().unwrap_or("");
    let status = if state == "running" {
        format!("Up since {}", started_at)
    } else {
        state.clone()
    };
    let created = item["Created"].as_str().unwrap_or("").to_string();
    let platform = item["Platform"].as_str().unwrap_or("").to_string();

    let env_vars = item["Config"]["Env"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let mut ports = Vec::new();
    if let Some(port_map) = item["NetworkSettings"]["Ports"].as_object() {
        for (key, bindings) in port_map {
            let parts: Vec<&str> = key.split('/').collect();
            let container_port = parts.first().unwrap_or(&"").to_string();
            let protocol = parts.get(1).unwrap_or(&"tcp").to_string();

            if let Some(arr) = bindings.as_array() {
                for binding in arr {
                    ports.push(PortBinding {
                        container_port: container_port.clone(),
                        host_port: binding["HostPort"].as_str().unwrap_or("").to_string(),
                        protocol: protocol.clone(),
                    });
                }
            } else {
                ports.push(PortBinding {
                    container_port,
                    host_port: String::new(),
                    protocol,
                });
            }
        }
    }

    let mounts = item["Mounts"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|m| MountInfo {
                    mount_type: m["Type"].as_str().unwrap_or("").to_string(),
                    source: m["Source"].as_str().unwrap_or("").to_string(),
                    destination: m["Destination"].as_str().unwrap_or("").to_string(),
                    mode: m["Mode"].as_str().unwrap_or("").to_string(),
                })
                .collect()
        })
        .unwrap_or_default();

    let mut networks = Vec::new();
    if let Some(net_map) = item["NetworkSettings"]["Networks"].as_object() {
        for (net_name, net_val) in net_map {
            networks.push(NetworkInfo {
                name: net_name.clone(),
                ip_address: net_val["IPAddress"].as_str().unwrap_or("").to_string(),
                gateway: net_val["Gateway"].as_str().unwrap_or("").to_string(),
            });
        }
    }

    let cmd = item["Config"]["Cmd"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str())
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_default();

    let entrypoint = item["Config"]["Entrypoint"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str())
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_default();

    Ok(ContainerDetail {
        id: item["Id"].as_str().unwrap_or("").to_string(),
        name,
        image,
        state,
        status,
        created,
        platform,
        env_vars,
        ports,
        mounts,
        networks,
        cmd,
        entrypoint,
    })
}

#[tauri::command]
pub async fn container_stats(id: String) -> Result<ContainerStats, String> {
    let output = CliExecutor::run(
        container_cmd(),
        &[
            "stats",
            &id,
            "--no-stream",
            "--format",
            "{{.CPUPerc}}|{{.MemUsage}}|{{.MemPerc}}|{{.NetIO}}|{{.BlockIO}}|{{.PIDs}}",
        ],
    )
    .await?;

    let line = output.trim();
    let parts: Vec<&str> = line.split('|').collect();
    if parts.len() < 6 {
        return Err(format!("Unexpected stats format: {}", line));
    }

    let mem_parts: Vec<&str> = parts[1].split(" / ").collect();
    let memory_usage = mem_parts.first().unwrap_or(&"").trim().to_string();
    let memory_limit = mem_parts.get(1).unwrap_or(&"").trim().to_string();

    Ok(ContainerStats {
        cpu_percent: parts[0].trim().to_string(),
        memory_usage,
        memory_limit,
        memory_percent: parts[2].trim().to_string(),
        net_io: parts[3].trim().to_string(),
        block_io: parts[4].trim().to_string(),
        pids: parts[5].trim().to_string(),
    })
}
