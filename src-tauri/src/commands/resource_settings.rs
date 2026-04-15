use crate::cli::executor::CliExecutor;
use crate::cli::types::{HostInfo, ResourceSettings};

#[tauri::command]
pub async fn get_resource_settings() -> Result<ResourceSettings, String> {
    let container_cpus = CliExecutor::run(
        "container",
        &["system", "property", "get", "container.cpus"],
    )
    .await
    .unwrap_or_default()
    .trim()
    .to_string();
    let container_memory = CliExecutor::run(
        "container",
        &["system", "property", "get", "container.memory"],
    )
    .await
    .unwrap_or_default()
    .trim()
    .to_string();
    let build_cpus = CliExecutor::run(
        "container",
        &["system", "property", "get", "build.cpus"],
    )
    .await
    .unwrap_or_default()
    .trim()
    .to_string();
    let build_memory = CliExecutor::run(
        "container",
        &["system", "property", "get", "build.memory"],
    )
    .await
    .unwrap_or_default()
    .trim()
    .to_string();
    Ok(ResourceSettings {
        container_cpus,
        container_memory,
        build_cpus,
        build_memory,
    })
}

#[tauri::command]
pub async fn get_host_info() -> Result<HostInfo, String> {
    let cpu_str = CliExecutor::run("sysctl", &["-n", "hw.ncpu"]).await?;
    let cpus: u32 = cpu_str
        .trim()
        .parse()
        .map_err(|e| format!("Failed to parse CPU count: {}", e))?;

    let mem_str = CliExecutor::run("sysctl", &["-n", "hw.memsize"]).await?;
    let mem_bytes: u64 = mem_str
        .trim()
        .parse()
        .map_err(|e| format!("Failed to parse memory: {}", e))?;

    Ok(HostInfo {
        cpus,
        memory_gib: mem_bytes as f64 / 1_073_741_824.0,
    })
}

#[tauri::command]
pub async fn apply_resource_settings(
    container_cpus: String,
    container_memory: String,
    build_cpus: String,
    build_memory: String,
) -> Result<(), String> {
    if !container_cpus.is_empty() {
        CliExecutor::run(
            "container",
            &["system", "property", "set", "container.cpus", &container_cpus],
        )
        .await?;
    }
    if !container_memory.is_empty() {
        CliExecutor::run(
            "container",
            &[
                "system",
                "property",
                "set",
                "container.memory",
                &container_memory,
            ],
        )
        .await?;
    }
    if !build_cpus.is_empty() {
        CliExecutor::run(
            "container",
            &["system", "property", "set", "build.cpus", &build_cpus],
        )
        .await?;
    }
    if !build_memory.is_empty() {
        CliExecutor::run(
            "container",
            &["system", "property", "set", "build.memory", &build_memory],
        )
        .await?;
    }
    Ok(())
}
