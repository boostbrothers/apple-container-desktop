use crate::cli::types::{EnvVarEntry, InfisicalConfig, Project, ProjectWithStatus};
use crate::commands::project::{find_project, get_project_status, load_projects, save_projects};
use std::io::Write;
use tokio::process::Command;

// ─── Helper ───────────────────────────────────────────────────────────────────

/// Save updated project back to disk, then return it with live status.
async fn save_and_status(mut projects: Vec<Project>, project: Project) -> Result<ProjectWithStatus, String> {
    let idx = projects
        .iter()
        .position(|p| p.id == project.id)
        .ok_or_else(|| "Project not found".to_string())?;
    projects[idx] = project.clone();
    save_projects(&projects)?;
    Ok(get_project_status(project).await)
}

// ─── Profile Management ───────────────────────────────────────────────────────

#[tauri::command]
pub async fn create_profile(project_id: String, profile_name: String) -> Result<ProjectWithStatus, String> {
    let name = profile_name.trim().to_lowercase();
    if name.is_empty() {
        return Err("Profile name cannot be empty".to_string());
    }

    let projects = load_projects()?;
    let mut project = find_project(&projects, &project_id)?;

    if project.profiles.contains(&name) {
        return Err(format!("Profile '{}' already exists", name));
    }

    project.profiles.push(name);
    save_and_status(projects, project).await
}

#[tauri::command]
pub async fn delete_profile(project_id: String, profile_name: String) -> Result<ProjectWithStatus, String> {
    if profile_name == "default" {
        return Err("Cannot delete the 'default' profile".to_string());
    }

    let projects = load_projects()?;
    let mut project = find_project(&projects, &project_id)?;

    if !project.profiles.contains(&profile_name) {
        return Err(format!("Profile '{}' not found", profile_name));
    }

    // Remove the profile
    project.profiles.retain(|p| p != &profile_name);

    // Remove all env_vars belonging to that profile
    project.env_vars.retain(|e| e.profile != profile_name);

    // Reset active_profile if it was the deleted one
    if project.active_profile == profile_name {
        project.active_profile = "default".to_string();
    }

    save_and_status(projects, project).await
}

#[tauri::command]
pub async fn switch_profile(project_id: String, profile_name: String) -> Result<ProjectWithStatus, String> {
    let projects = load_projects()?;
    let mut project = find_project(&projects, &project_id)?;

    if !project.profiles.contains(&profile_name) {
        return Err(format!("Profile '{}' does not exist", profile_name));
    }

    project.active_profile = profile_name;
    save_and_status(projects, project).await
}

// ─── Env Var CRUD ─────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn set_env_var(project_id: String, entry: EnvVarEntry) -> Result<ProjectWithStatus, String> {
    let projects = load_projects()?;
    let mut project = find_project(&projects, &project_id)?;

    // Upsert: find by key + profile
    if let Some(existing) = project
        .env_vars
        .iter_mut()
        .find(|e| e.key == entry.key && e.profile == entry.profile)
    {
        *existing = entry;
    } else {
        project.env_vars.push(entry);
    }

    save_and_status(projects, project).await
}

#[tauri::command]
pub async fn remove_env_var(
    project_id: String,
    key: String,
    profile: String,
) -> Result<ProjectWithStatus, String> {
    let projects = load_projects()?;
    let mut project = find_project(&projects, &project_id)?;

    project.env_vars.retain(|e| !(e.key == key && e.profile == profile));

    save_and_status(projects, project).await
}

#[tauri::command]
pub async fn bulk_import_env(
    project_id: String,
    profile: String,
    entries: Vec<EnvVarEntry>,
) -> Result<ProjectWithStatus, String> {
    let projects = load_projects()?;
    let mut project = find_project(&projects, &project_id)?;

    for mut entry in entries {
        entry.profile = profile.clone();
        if let Some(existing) = project
            .env_vars
            .iter_mut()
            .find(|e| e.key == entry.key && e.profile == entry.profile)
        {
            *existing = entry;
        } else {
            project.env_vars.push(entry);
        }
    }

    save_and_status(projects, project).await
}

// ─── Dotenv Import / Export ───────────────────────────────────────────────────

/// Parse a .env file into a list of key/value pairs.
/// Skips blank lines and `#` comments; strips surrounding quotes from values.
fn parse_dotenv(content: &str) -> Vec<(String, String)> {
    let mut pairs = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        if let Some(eq_pos) = trimmed.find('=') {
            let key = trimmed[..eq_pos].trim().to_string();
            let raw_val = trimmed[eq_pos + 1..].trim();
            // Strip surrounding single or double quotes
            let value = if (raw_val.starts_with('"') && raw_val.ends_with('"'))
                || (raw_val.starts_with('\'') && raw_val.ends_with('\''))
            {
                raw_val[1..raw_val.len() - 1].to_string()
            } else {
                raw_val.to_string()
            };
            if !key.is_empty() {
                pairs.push((key, value));
            }
        }
    }
    pairs
}

#[tauri::command]
pub async fn load_dotenv_for_profile(
    project_id: String,
    file_path: String,
    profile: String,
) -> Result<ProjectWithStatus, String> {
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read .env file: {}", e))?;

    let parsed = parse_dotenv(&content);

    let projects = load_projects()?;
    let mut project = find_project(&projects, &project_id)?;

    // Remove old dotenv entries for this profile
    project.env_vars.retain(|e| !(e.source == "dotenv" && e.profile == profile));

    // Add new entries
    for (key, value) in parsed {
        project.env_vars.push(EnvVarEntry {
            key,
            value,
            source: "dotenv".to_string(),
            secret: false,
            profile: profile.clone(),
        });
    }

    save_and_status(projects, project).await
}

#[tauri::command]
pub async fn export_profile_to_dotenv(
    project_id: String,
    profile: String,
    file_path: String,
) -> Result<(), String> {
    let projects = load_projects()?;
    let project = find_project(&projects, &project_id)?;

    let filtered: Vec<&EnvVarEntry> = project
        .env_vars
        .iter()
        .filter(|e| e.profile == profile)
        .collect();

    let mut file = std::fs::File::create(&file_path)
        .map_err(|e| format!("Failed to create .env file: {}", e))?;

    for entry in filtered {
        writeln!(file, "{}={}", entry.key, entry.value)
            .map_err(|e| format!("Failed to write to .env file: {}", e))?;
    }

    Ok(())
}

// ─── Infisical CLI Integration ────────────────────────────────────────────────

#[tauri::command]
pub async fn check_infisical_installed() -> Result<bool, String> {
    let output = Command::new("infisical")
        .arg("--version")
        .output()
        .await
        .map_err(|e| format!("Failed to run infisical: {}", e))?;
    Ok(output.status.success())
}

#[tauri::command]
pub async fn configure_infisical(
    project_id: String,
    config: InfisicalConfig,
) -> Result<ProjectWithStatus, String> {
    let projects = load_projects()?;
    let mut project = find_project(&projects, &project_id)?;

    project.infisical_config = Some(config);

    save_and_status(projects, project).await
}

#[tauri::command]
pub async fn sync_infisical(project_id: String) -> Result<Vec<EnvVarEntry>, String> {
    let projects = load_projects()?;
    let mut project = find_project(&projects, &project_id)?;

    let cfg = project
        .infisical_config
        .clone()
        .ok_or_else(|| "No Infisical configuration set for this project".to_string())?;

    // Determine target environment: check profile_mapping first, then fallback
    let active = project.active_profile.clone();
    let environment = cfg
        .profile_mapping
        .get(&active)
        .cloned()
        .unwrap_or_else(|| cfg.environment.clone());

    let mut args = vec![
        "export".to_string(),
        format!("--projectId={}", cfg.project_id),
        format!("--env={}", environment),
        format!("--path={}", cfg.secret_path),
        "--format=dotenv".to_string(),
    ];
    if let Some(ref token) = cfg.token {
        if !token.is_empty() {
            args.push(format!("--token={}", token));
        }
    }
    let str_args: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

    let output = Command::new("infisical")
        .args(&str_args)
        .output()
        .await
        .map_err(|e| format!("Failed to run infisical: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("infisical export failed: {}", stderr));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed = parse_dotenv(&stdout);

    let new_entries: Vec<EnvVarEntry> = parsed
        .into_iter()
        .map(|(key, value)| EnvVarEntry {
            key,
            value,
            source: "infisical".to_string(),
            secret: true,
            profile: active.clone(),
        })
        .collect();

    // Replace old infisical entries for this profile
    project.env_vars.retain(|e| !(e.source == "infisical" && e.profile == active));
    project.env_vars.extend(new_entries.clone());

    let idx = projects
        .iter()
        .position(|p| p.id == project_id)
        .ok_or_else(|| "Project not found".to_string())?;
    let mut updated_projects = projects;
    updated_projects[idx] = project;
    save_projects(&updated_projects)?;

    Ok(new_entries)
}

#[tauri::command]
pub async fn test_infisical_connection(project_id: String) -> Result<bool, String> {
    let projects = load_projects()?;
    let project = find_project(&projects, &project_id)?;

    let cfg = project
        .infisical_config
        .ok_or_else(|| "No Infisical configuration set for this project".to_string())?;

    let active = project.active_profile.clone();
    let environment = cfg
        .profile_mapping
        .get(&active)
        .cloned()
        .unwrap_or_else(|| cfg.environment.clone());

    let mut args = vec![
        "export".to_string(),
        format!("--projectId={}", cfg.project_id),
        format!("--env={}", environment),
        format!("--path={}", cfg.secret_path),
        "--format=dotenv".to_string(),
    ];
    if let Some(ref token) = cfg.token {
        if !token.is_empty() {
            args.push(format!("--token={}", token));
        }
    }
    let str_args: Vec<&str> = args.iter().map(|s| s.as_str()).collect();

    let output = Command::new("infisical")
        .args(&str_args)
        .output()
        .await
        .map_err(|e| format!("Failed to run infisical: {}", e))?;

    Ok(output.status.success())
}

// ─── Compose Secrets Preparation ─────────────────────────────────────────────

/// Internal helper (not a Tauri command) — called from compose_up.
/// Prepares secrets and env vars for `docker-compose.override.yml`.
pub fn prepare_secrets_for_compose(project: &Project) -> Result<Option<String>, String> {
    let active = &project.active_profile;

    let secrets: Vec<&EnvVarEntry> = project
        .env_vars
        .iter()
        .filter(|e| e.profile == active.as_str() && e.secret)
        .collect();

    let env_vars: Vec<&EnvVarEntry> = project
        .env_vars
        .iter()
        .filter(|e| e.profile == active.as_str() && !e.secret)
        .collect();

    if secrets.is_empty() && env_vars.is_empty() {
        return Ok(None);
    }

    let workspace = std::path::Path::new(&project.workspace_path);
    let secrets_dir = workspace.join(".secrets");
    std::fs::create_dir_all(&secrets_dir)
        .map_err(|e| format!("Failed to create .secrets/ directory: {}", e))?;

    // Write each secret to .secrets/{key}
    for entry in &secrets {
        let secret_file = secrets_dir.join(&entry.key);
        std::fs::write(&secret_file, &entry.value)
            .map_err(|e| format!("Failed to write secret '{}': {}", entry.key, e))?;
    }

    // Ensure .secrets/ is in .gitignore
    let gitignore_path = workspace.join(".gitignore");
    let gitignore_entry = ".secrets/\n";
    let already_ignored = if gitignore_path.exists() {
        let content = std::fs::read_to_string(&gitignore_path)
            .map_err(|e| format!("Failed to read .gitignore: {}", e))?;
        content.lines().any(|l| l.trim() == ".secrets" || l.trim() == ".secrets/")
    } else {
        false
    };

    if !already_ignored {
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&gitignore_path)
            .map_err(|e| format!("Failed to open .gitignore: {}", e))?;
        writeln!(file, "{}", gitignore_entry.trim())
            .map_err(|e| format!("Failed to update .gitignore: {}", e))?;
    }

    // Determine service name
    let service_name = project
        .service_name
        .clone()
        .unwrap_or_else(|| "app".to_string());

    // Build override YAML content
    // Secrets are injected BOTH as Compose secrets (file at /run/secrets/{key})
    // AND as environment variables, since most apps expect env vars.
    let mut yaml = String::from("# Auto-generated by Colima Desktop — do not edit manually\n");
    yaml.push_str("services:\n");
    yaml.push_str(&format!("  {}:\n", service_name));

    if !secrets.is_empty() {
        yaml.push_str("    secrets:\n");
        for entry in &secrets {
            yaml.push_str(&format!("      - {}\n", entry.key));
        }
    }

    // All vars (both secret and non-secret) go into environment
    if !secrets.is_empty() || !env_vars.is_empty() {
        yaml.push_str("    environment:\n");
        for entry in &secrets {
            yaml.push_str(&format!("      - {}={}\n", entry.key, entry.value));
        }
        for entry in &env_vars {
            yaml.push_str(&format!("      - {}={}\n", entry.key, entry.value));
        }
    }

    if !secrets.is_empty() {
        yaml.push_str("secrets:\n");
        for entry in &secrets {
            yaml.push_str(&format!("  {}:\n", entry.key));
            yaml.push_str(&format!("    file: ./.secrets/{}\n", entry.key));
        }
    }

    let override_path = workspace.join("docker-compose.override.yml");
    std::fs::write(&override_path, &yaml)
        .map_err(|e| format!("Failed to write docker-compose.override.yml: {}", e))?;

    Ok(Some(
        override_path
            .to_str()
            .ok_or_else(|| "Invalid override path".to_string())?
            .to_string(),
    ))
}
