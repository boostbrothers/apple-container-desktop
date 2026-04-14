use crate::cli::types::{EnvVarEntry, InfisicalConfig, Project, ProjectWithStatus};
use crate::commands::project::{find_project, get_project_status, load_projects, save_projects};
use crate::crypto;
use std::io::Write;
use tokio::process::Command;

// ─── Helper ───────────────────────────────────────────────────────────────────

/// Save updated project back to disk, then return it with live status.
/// Secret values are masked in the returned ProjectWithStatus.
async fn save_and_status(mut projects: Vec<Project>, project: Project) -> Result<ProjectWithStatus, String> {
    let idx = projects
        .iter()
        .position(|p| p.id == project.id)
        .ok_or_else(|| "Project not found".to_string())?;
    projects[idx] = project.clone();
    save_projects(&projects)?;
    Ok(mask_project_secrets(get_project_status(project).await))
}

// ─── Encryption Helpers ─────────────────────────────────────────────────────

/// Encrypt an EnvVarEntry's value if it is marked as secret.
fn encrypt_entry_if_secret(mut entry: EnvVarEntry) -> Result<EnvVarEntry, String> {
    if entry.secret {
        entry.value = crypto::ensure_encrypted(&entry.value)?;
    }
    Ok(entry)
}

/// Decrypt an EnvVarEntry's value if it is marked as secret and encrypted.
#[allow(dead_code)]
pub fn decrypt_entry_if_secret(mut entry: EnvVarEntry) -> Result<EnvVarEntry, String> {
    if entry.secret && crypto::is_encrypted(&entry.value) {
        entry.value = crypto::decrypt(&entry.value)?;
    }
    Ok(entry)
}

/// Mask secret values in ProjectWithStatus for frontend display.
fn mask_project_secrets(mut pws: ProjectWithStatus) -> ProjectWithStatus {
    for var in &mut pws.env_vars {
        if var.secret {
            var.value = "••••••••".to_string();
        }
    }
    pws
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

    // Encrypt secret values before storing
    let entry = encrypt_entry_if_secret(entry)?;

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
        // Encrypt secret values before storing
        let entry = encrypt_entry_if_secret(entry)?;
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
        let value = if entry.secret && crypto::is_encrypted(&entry.value) {
            crypto::decrypt(&entry.value)?
        } else {
            entry.value.clone()
        };
        writeln!(file, "{}={}", entry.key, value)
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
        .map(|(key, value)| {
            let encrypted_value = crypto::encrypt(&value)
                .map_err(|e| format!("Failed to encrypt secret '{}': {}", key, e))?;
            Ok(EnvVarEntry {
                key,
                value: encrypted_value,
                source: "infisical".to_string(),
                secret: true,
                profile: active.clone(),
            })
        })
        .collect::<Result<Vec<_>, String>>()?;

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

    // Return masked entries to frontend
    Ok(new_entries.into_iter().map(|mut e| {
        if e.secret { e.value = "••••••••".to_string(); }
        e
    }).collect())
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

