use std::process::Output;
use tokio::process::Command;

pub struct CliExecutor;

impl CliExecutor {
    pub async fn run(program: &str, args: &[&str]) -> Result<String, String> {
        let output: Output = Command::new(program)
            .args(args)
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

pub fn docker_host() -> String {
    std::env::var("DOCKER_HOST").unwrap_or_else(|_| {
        let home = std::env::var("HOME").unwrap_or_default();
        format!("unix://{}/.colima/default/docker.sock", home)
    })
}
