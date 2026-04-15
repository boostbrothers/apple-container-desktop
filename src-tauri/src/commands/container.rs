use crate::cli::executor::{container_cmd, CliExecutor, EXTENDED_PATH};
use crate::cli::types::{
    Container, ContainerDetail, ContainerStats, ContainerListEntry, MountInfo, NetworkInfo, PortBinding, LabelEntry,
};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[tauri::command]
pub async fn list_containers() -> Result<Vec<Container>, String> {
    let entries: Vec<ContainerListEntry> =
        CliExecutor::run_json_array(container_cmd(), &["list", "-a", "--format", "json"]).await?;
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

    // Apple Container returns a JSON array
    let item = parsed
        .as_array()
        .and_then(|arr| arr.first())
        .ok_or("Empty inspect result")?;

    let config = &item["configuration"];
    let container_id = config["id"].as_str().unwrap_or("").to_string();
    let name = container_id.clone();
    let image = config["image"]["reference"]
        .as_str()
        .unwrap_or("")
        .to_string();
    let state = item["status"].as_str().unwrap_or("").to_string();

    let status = if state == "running" {
        if let Some(abs_time) = item["startedDate"].as_f64() {
            let unix_ts = (abs_time + 978_307_200.0) as i64;
            format!("Up since {}", format_unix_ts(unix_ts))
        } else {
            "Up".to_string()
        }
    } else {
        state.clone()
    };

    let created = item["startedDate"]
        .as_f64()
        .map(|t| format_unix_ts((t + 978_307_200.0) as i64))
        .unwrap_or_default();

    let os = config["platform"]["os"].as_str().unwrap_or("");
    let arch = config["platform"]["architecture"].as_str().unwrap_or("");
    let platform = if !os.is_empty() {
        format!("{}/{}", os, arch)
    } else {
        String::new()
    };

    let env_vars = config["initProcess"]["environment"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str().map(String::from))
                .collect()
        })
        .unwrap_or_default();

    let mut ports = Vec::new();
    if let Some(published) = config["publishedPorts"].as_array() {
        for p in published {
            ports.push(PortBinding {
                container_port: p["containerPort"]
                    .as_u64()
                    .map(|v| v.to_string())
                    .unwrap_or_default(),
                host_port: p["hostPort"]
                    .as_u64()
                    .map(|v| v.to_string())
                    .unwrap_or_default(),
                protocol: p["protocol"].as_str().unwrap_or("tcp").to_string(),
            });
        }
    }

    let mounts = config["mounts"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|m| {
                    // mount type is an object like {"virtiofs":{}} or {"tmpfs":{}}
                    let mount_type = m["type"]
                        .as_object()
                        .and_then(|o| o.keys().next().cloned())
                        .unwrap_or_default();
                    MountInfo {
                        mount_type,
                        source: m["source"].as_str().unwrap_or("").to_string(),
                        destination: m["destination"].as_str().unwrap_or("").to_string(),
                        mode: String::new(),
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    let networks = item["networks"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .map(|n| NetworkInfo {
                    name: n["network"].as_str().unwrap_or("").to_string(),
                    hostname: n["hostname"].as_str().unwrap_or("").to_string(),
                    ip_address: n["ipv4Address"].as_str().unwrap_or("").to_string(),
                    gateway: n["ipv4Gateway"].as_str().unwrap_or("").to_string(),
                    mac_address: n["macAddress"].as_str()
                        .or_else(|| n["hwAddress"].as_str())
                        .unwrap_or("").to_string(),
                })
                .collect()
        })
        .unwrap_or_default();

    let cmd = config["initProcess"]["arguments"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_str())
                .collect::<Vec<_>>()
                .join(" ")
        })
        .unwrap_or_default();

    let entrypoint = config["initProcess"]["executable"]
        .as_str()
        .unwrap_or("")
        .to_string();

    // hostname
    let hostname = config["hostname"].as_str().unwrap_or("").to_string();

    // working directory
    let working_dir = config["initProcess"]["cwd"].as_str()
        .or_else(|| config["initProcess"]["workingDirectory"].as_str())
        .unwrap_or("").to_string();

    // user
    let user = config["initProcess"]["user"].as_str()
        .or_else(|| config["user"].as_str())
        .unwrap_or("").to_string();

    // labels
    let labels = config["labels"].as_object()
        .map(|obj| obj.iter().map(|(k, v)| LabelEntry {
            key: k.clone(),
            value: v.as_str().unwrap_or("").to_string(),
        }).collect())
        .unwrap_or_default();

    // restart policy
    let restart_policy = config["restartPolicy"].as_str()
        .or_else(|| config["restart"].as_str())
        .unwrap_or("").to_string();

    // PID
    let pid = item["pid"].as_u64().or_else(|| item["containerPID"].as_u64());

    // Raw JSON
    let raw_json = serde_json::to_string_pretty(item).unwrap_or_default();

    Ok(ContainerDetail {
        id: container_id,
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
        hostname,
        working_dir,
        user,
        labels,
        restart_policy,
        pid,
        raw_json,
    })
}

fn format_unix_ts(ts: i64) -> String {
    // Simple ISO-like timestamp
    let secs_per_day = 86400i64;
    let secs_per_hour = 3600i64;
    let secs_per_min = 60i64;

    // Days since Unix epoch to date (simplified)
    let days = ts / secs_per_day;
    let remaining = ts % secs_per_day;
    let hour = remaining / secs_per_hour;
    let min = (remaining % secs_per_hour) / secs_per_min;
    let sec = remaining % secs_per_min;

    // Approximate year/month/day from days since epoch
    let mut y = 1970i64;
    let mut d = days;
    loop {
        let days_in_year = if y % 4 == 0 && (y % 100 != 0 || y % 400 == 0) {
            366
        } else {
            365
        };
        if d < days_in_year {
            break;
        }
        d -= days_in_year;
        y += 1;
    }
    let leap = y % 4 == 0 && (y % 100 != 0 || y % 400 == 0);
    let month_days = [
        31,
        if leap { 29 } else { 28 },
        31,
        30,
        31,
        30,
        31,
        31,
        30,
        31,
        30,
        31,
    ];
    let mut m = 0usize;
    for &md in &month_days {
        if d < md {
            break;
        }
        d -= md;
        m += 1;
    }

    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        y,
        m + 1,
        d + 1,
        hour,
        min,
        sec
    )
}

#[tauri::command]
pub async fn container_stats(id: String) -> Result<ContainerStats, String> {
    let output = CliExecutor::run(
        container_cmd(),
        &["stats", &id, "--no-stream", "--format", "json"],
    )
    .await?;

    let trimmed = output.trim();
    let items: Vec<serde_json::Value> = serde_json::from_str(trimmed)
        .map_err(|e| format!("Stats JSON parse error: {}", e))?;
    let item = items.first().ok_or("Empty stats result")?;

    let mem_usage_bytes = item["memoryUsageBytes"].as_u64().unwrap_or(0);
    let mem_limit_bytes = item["memoryLimitBytes"].as_u64().unwrap_or(1);
    let mem_percent = if mem_limit_bytes > 0 {
        (mem_usage_bytes as f64 / mem_limit_bytes as f64) * 100.0
    } else {
        0.0
    };

    let net_rx = item["networkRxBytes"].as_u64().unwrap_or(0);
    let net_tx = item["networkTxBytes"].as_u64().unwrap_or(0);
    let block_read = item["blockReadBytes"].as_u64().unwrap_or(0);
    let block_write = item["blockWriteBytes"].as_u64().unwrap_or(0);
    let cpu_usec = item["cpuUsageUsec"].as_u64().unwrap_or(0);
    let pids = item["numProcesses"].as_u64().unwrap_or(0);

    // CPU percentage: usec → approximate % (snapshot from stats --no-stream)
    let cpu_percent = format!("{:.2}%", cpu_usec as f64 / 1_000_000.0);

    Ok(ContainerStats {
        cpu_percent,
        memory_usage: format_bytes(mem_usage_bytes),
        memory_limit: format_bytes(mem_limit_bytes),
        memory_percent: format!("{:.1}%", mem_percent),
        net_io: format!("{} / {}", format_bytes(net_rx), format_bytes(net_tx)),
        block_io: format!("{} / {}", format_bytes(block_read), format_bytes(block_write)),
        pids: pids.to_string(),
    })
}

fn format_bytes(bytes: u64) -> String {
    const KIB: f64 = 1024.0;
    const MIB: f64 = 1024.0 * 1024.0;
    const GIB: f64 = 1024.0 * 1024.0 * 1024.0;
    let b = bytes as f64;
    if b >= GIB {
        format!("{:.2} GiB", b / GIB)
    } else if b >= MIB {
        format!("{:.2} MiB", b / MIB)
    } else if b >= KIB {
        format!("{:.2} KiB", b / KIB)
    } else {
        format!("{} B", bytes)
    }
}
