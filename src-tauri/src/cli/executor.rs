use std::process::Output;
use std::sync::LazyLock;
use tokio::process::Command;

/// Extended PATH that includes common binary locations for macOS app bundles.
/// macOS .app bundles have a minimal PATH (/usr/bin:/bin:/usr/sbin:/sbin),
/// so Homebrew and other user-installed binaries are not found without this.
pub static EXTENDED_PATH: LazyLock<String> = LazyLock::new(|| {
    let extra = [
        "/opt/homebrew/bin",
        "/opt/homebrew/sbin",
        "/usr/local/bin",
        "/usr/local/sbin",
    ];
    let current = std::env::var("PATH").unwrap_or_default();
    let mut parts: Vec<&str> = extra.to_vec();
    for p in current.split(':') {
        if !parts.contains(&p) {
            parts.push(p);
        }
    }
    parts.join(":")
});

/// Resolved docker binary path. Checks common install locations and falls
/// back to the bare name (relying on PATH) when no candidate is found.
static DOCKER_PATH: LazyLock<String> = LazyLock::new(|| {
    find_binary("docker").unwrap_or_else(|| "docker".to_string())
});

/// Return the resolved docker binary path (`&'static str`).
pub fn docker_cmd() -> &'static str {
    &DOCKER_PATH
}

pub struct CliExecutor;

impl CliExecutor {
    pub async fn run(program: &str, args: &[&str]) -> Result<String, String> {
        let output: Output = Command::new(program)
            .args(args)
            .env("PATH", &*EXTENDED_PATH)
            .env("DOCKER_HOST", docker_host())
            .output()
            .await
            .map_err(|e| format!("Failed to execute {}: {}", program, e))?;

        if output.status.success() {
            String::from_utf8(output.stdout)
                .map_err(|e| format!("Invalid UTF-8 output: {}", e))
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("{} failed: {}", program, stderr.trim()))
        }
    }

    pub async fn run_json_lines<T: serde::de::DeserializeOwned>(
        program: &str,
        args: &[&str],
    ) -> Result<Vec<T>, String> {
        let stdout = Self::run(program, args).await?;
        let mut results = Vec::new();
        for line in stdout.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() {
                continue;
            }
            let item: T = serde_json::from_str(trimmed)
                .map_err(|e| format!("JSON parse error: {} for line: {}", e, trimmed))?;
            results.push(item);
        }
        Ok(results)
    }
}

/// Find a binary by checking common install paths.
/// Returns the absolute path if found, or None.
pub fn find_binary(name: &str) -> Option<String> {
    let candidates = [
        format!("/opt/homebrew/bin/{}", name),
        format!("/usr/local/bin/{}", name),
        format!("/usr/bin/{}", name),
    ];
    for path in &candidates {
        if std::path::Path::new(path).exists() {
            return Some(path.clone());
        }
    }
    None
}

pub fn docker_host() -> String {
    std::env::var("DOCKER_HOST").unwrap_or_else(|_| {
        let home = std::env::var("HOME").unwrap_or_default();
        format!("unix://{}/.colima/default/docker.sock", home)
    })
}
