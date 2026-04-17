use crate::cli::types::{EnvProfile, EnvStoreConfig, GlobalEnvVar, InfisicalConfig};
use crate::crypto;
use tokio::process::Command;

fn store_path() -> Result<std::path::PathBuf, String> {
    let config_dir = dirs::config_dir().ok_or("Cannot find config directory")?;
    let app_dir = config_dir.join("apple-container-desktop");
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create config dir: {}", e))?;
    Ok(app_dir.join("env-store.json"))
}

fn load_store() -> Result<EnvStoreConfig, String> {
    let path = store_path()?;
    if !path.exists() {
        let default_store = EnvStoreConfig {
            profiles: vec![EnvProfile {
                id: uuid::Uuid::new_v4().to_string(),
                name: "default".to_string(),
                env_vars: Vec::new(),
                infisical_config: None,
            }],
        };
        save_store(&default_store)?;
        return Ok(default_store);
    }
    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("Failed to read env store: {}", e))?;
    serde_json::from_str(&content)
        .map_err(|e| format!("Failed to parse env store: {}", e))
}

fn save_store(store: &EnvStoreConfig) -> Result<(), String> {
    let path = store_path()?;
    let content = serde_json::to_string_pretty(store)
        .map_err(|e| format!("Failed to serialize env store: {}", e))?;
    std::fs::write(&path, content)
        .map_err(|e| format!("Failed to write env store: {}", e))?;
    Ok(())
}

fn find_profile_mut<'a>(store: &'a mut EnvStoreConfig, profile_id: &str) -> Result<&'a mut EnvProfile, String> {
    store.profiles.iter_mut()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| "Profile not found".to_string())
}

// ─── Profile CRUD ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_env_profiles() -> Result<Vec<EnvProfile>, String> {
    let store = load_store()?;
    Ok(store.profiles.into_iter().map(mask_profile_secrets).collect())
}

#[tauri::command]
pub async fn create_env_profile(name: String) -> Result<EnvProfile, String> {
    let name = name.trim().to_lowercase();
    if name.is_empty() {
        return Err("Profile name cannot be empty".to_string());
    }
    let mut store = load_store()?;
    if store.profiles.iter().any(|p| p.name == name) {
        return Err(format!("Profile '{}' already exists", name));
    }
    let profile = EnvProfile {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        env_vars: Vec::new(),
        infisical_config: None,
    };
    let result = profile.clone();
    store.profiles.push(profile);
    save_store(&store)?;
    Ok(mask_profile_secrets(result))
}

#[tauri::command]
pub async fn delete_env_profile(profile_id: String) -> Result<(), String> {
    let mut store = load_store()?;
    let profile = store.profiles.iter().find(|p| p.id == profile_id)
        .ok_or_else(|| "Profile not found".to_string())?;
    if profile.name == "default" {
        return Err("Cannot delete the 'default' profile".to_string());
    }
    store.profiles.retain(|p| p.id != profile_id);
    save_store(&store)?;
    Ok(())
}

#[tauri::command]
pub async fn rename_env_profile(profile_id: String, new_name: String) -> Result<EnvProfile, String> {
    let new_name = new_name.trim().to_lowercase();
    if new_name.is_empty() {
        return Err("Profile name cannot be empty".to_string());
    }
    let mut store = load_store()?;
    if store.profiles.iter().any(|p| p.name == new_name && p.id != profile_id) {
        return Err(format!("Profile '{}' already exists", new_name));
    }
    let profile = find_profile_mut(&mut store, &profile_id)?;
    if profile.name == "default" {
        return Err("Cannot rename the 'default' profile".to_string());
    }
    profile.name = new_name;
    let result = mask_profile_secrets(profile.clone());
    save_store(&store)?;
    Ok(result)
}

// ─── Env Var CRUD ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn add_global_env_var(profile_id: String, entry: GlobalEnvVar) -> Result<EnvProfile, String> {
    let mut store = load_store()?;
    let profile = find_profile_mut(&mut store, &profile_id)?;

    // Encrypt secret values before storing
    let entry = encrypt_global_var_if_secret(entry)?;

    if entry.source == "manual" {
        if let Some(existing) = profile.env_vars.iter_mut()
            .find(|e| e.key == entry.key && e.source == "manual")
        {
            *existing = entry;
        } else {
            let has_conflict = profile.env_vars.iter().any(|e| e.key == entry.key && e.enabled);
            let mut new_entry = entry;
            if has_conflict {
                new_entry.enabled = false;
            }
            profile.env_vars.push(new_entry);
        }
    } else {
        profile.env_vars.push(entry);
    }

    let result = mask_profile_secrets(profile.clone());
    save_store(&store)?;
    Ok(result)
}

#[tauri::command]
pub async fn remove_global_env_var(profile_id: String, key: String, source: String) -> Result<EnvProfile, String> {
    let mut store = load_store()?;
    let profile = find_profile_mut(&mut store, &profile_id)?;
    profile.env_vars.retain(|e| !(e.key == key && e.source == source));
    let result = mask_profile_secrets(profile.clone());
    save_store(&store)?;
    Ok(result)
}

#[tauri::command]
pub async fn toggle_global_env_var(profile_id: String, key: String, source: String, enabled: bool) -> Result<EnvProfile, String> {
    let mut store = load_store()?;
    let profile = find_profile_mut(&mut store, &profile_id)?;

    if enabled {
        for var in profile.env_vars.iter_mut() {
            if var.key == key && var.source != source {
                var.enabled = false;
            }
        }
    }

    if let Some(var) = profile.env_vars.iter_mut()
        .find(|e| e.key == key && e.source == source)
    {
        var.enabled = enabled;
    }

    let result = mask_profile_secrets(profile.clone());
    save_store(&store)?;
    Ok(result)
}

// ─── Dotenv Import ───────────────────────────────────────────────────────────

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
pub async fn import_dotenv_to_profile(profile_id: String, file_path: String) -> Result<EnvProfile, String> {
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read .env file: {}", e))?;
    let parsed = parse_dotenv(&content);
    let mut store = load_store()?;
    let profile = find_profile_mut(&mut store, &profile_id)?;

    profile.env_vars.retain(|e| !(e.source == "dotenv" && e.source_file.as_deref() == Some(&file_path)));

    for (key, value) in parsed {
        let has_enabled = profile.env_vars.iter().any(|e| e.key == key && e.enabled);
        profile.env_vars.push(GlobalEnvVar {
            key,
            value,
            source: "dotenv".to_string(),
            secret: false,
            source_file: Some(file_path.clone()),
            enabled: !has_enabled,
        });
    }

    let result = mask_profile_secrets(profile.clone());
    save_store(&store)?;
    Ok(result)
}

#[tauri::command]
pub async fn reimport_dotenv(profile_id: String, file_path: String) -> Result<EnvProfile, String> {
    import_dotenv_to_profile(profile_id, file_path).await
}

// ─── Infisical Integration ───────────────────────────────────────────────────

#[tauri::command]
pub async fn configure_profile_infisical(profile_id: String, mut config: InfisicalConfig) -> Result<EnvProfile, String> {
    let mut store = load_store()?;
    let profile = find_profile_mut(&mut store, &profile_id)?;

    // If frontend sent back the masked placeholder, preserve existing encrypted token
    if let Some(ref token) = config.token {
        if token == "••••••••" {
            config.token = profile
                .infisical_config
                .as_ref()
                .and_then(|c| c.token.clone());
        } else if !token.is_empty() {
            config.token = Some(crypto::ensure_encrypted(token)?);
        }
    }

    profile.infisical_config = Some(config);
    let result = mask_profile_secrets(profile.clone());
    save_store(&store)?;
    Ok(result)
}

#[tauri::command]
pub async fn sync_profile_infisical(profile_id: String) -> Result<EnvProfile, String> {
    let mut store = load_store()?;
    let profile = find_profile_mut(&mut store, &profile_id)?;

    let cfg = profile.infisical_config.clone()
        .ok_or_else(|| "No Infisical configuration set for this profile".to_string())?;

    let mut args = vec![
        "export".to_string(),
        format!("--projectId={}", cfg.project_id),
        format!("--env={}", cfg.environment),
        format!("--path={}", cfg.secret_path),
        "--format=dotenv".to_string(),
    ];
    if let Some(ref token) = cfg.token {
        if !token.is_empty() {
            let decrypted_token = crypto::decrypt(token)?;
            args.push(format!("--token={}", decrypted_token));
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

    profile.env_vars.retain(|e| e.source != "infisical");

    for (key, value) in parsed {
        let has_enabled = profile.env_vars.iter().any(|e| e.key == key && e.enabled);
        let encrypted_value = crypto::encrypt(&value)
            .map_err(|e| format!("Failed to encrypt secret '{}': {}", key, e))?;
        profile.env_vars.push(GlobalEnvVar {
            key,
            value: encrypted_value,
            source: "infisical".to_string(),
            secret: true,
            source_file: Some(cfg.project_id.clone()),
            enabled: !has_enabled,
        });
    }

    let result = mask_profile_secrets(profile.clone());
    save_store(&store)?;
    Ok(result)
}

#[tauri::command]
pub async fn test_profile_infisical(profile_id: String) -> Result<bool, String> {
    let store = load_store()?;
    let profile = store.profiles.iter().find(|p| p.id == profile_id)
        .ok_or_else(|| "Profile not found".to_string())?;

    let cfg = profile.infisical_config.as_ref()
        .ok_or_else(|| "No Infisical configuration set for this profile".to_string())?;

    let mut args = vec![
        "export".to_string(),
        format!("--projectId={}", cfg.project_id),
        format!("--env={}", cfg.environment),
        format!("--path={}", cfg.secret_path),
        "--format=dotenv".to_string(),
    ];
    if let Some(ref token) = cfg.token {
        if !token.is_empty() {
            let decrypted_token = crypto::decrypt(token)?;
            args.push(format!("--token={}", decrypted_token));
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

// ─── Resolve Env Vars ────────────────────────────────────────────────────────

pub fn get_resolved_vars(profile: &EnvProfile) -> Vec<&GlobalEnvVar> {
    let mut result: Vec<&GlobalEnvVar> = Vec::new();
    for var in &profile.env_vars {
        if !var.enabled {
            continue;
        }
        if let Some(pos) = result.iter().position(|v| v.key == var.key) {
            result[pos] = var;
        } else {
            result.push(var);
        }
    }
    result
}

#[tauri::command]
pub async fn get_resolved_env_vars(profile_id: String) -> Result<Vec<GlobalEnvVar>, String> {
    let store = load_store()?;
    let profile = store.profiles.iter().find(|p| p.id == profile_id)
        .ok_or_else(|| "Profile not found".to_string())?;
    Ok(get_resolved_vars(profile).into_iter().cloned().map(mask_global_var_secret).collect())
}

/// Public helper for project commands to load store and resolve vars.
/// Returns **decrypted** values for CLI execution.
pub fn load_and_resolve_profile(profile_id: &str) -> Result<Vec<GlobalEnvVar>, String> {
    let store = load_store()?;
    let profile = store.profiles.iter().find(|p| p.id == profile_id)
        .ok_or_else(|| "Profile not found".to_string())?;
    let vars: Vec<GlobalEnvVar> = get_resolved_vars(profile).into_iter().cloned().collect();
    vars.into_iter().map(decrypt_global_var_if_secret).collect()
}

// ─── Encryption Helpers ─────────────────────────────────────────────────────

/// Encrypt a GlobalEnvVar's value if it is marked as secret.
fn encrypt_global_var_if_secret(mut var: GlobalEnvVar) -> Result<GlobalEnvVar, String> {
    if var.secret {
        var.value = crypto::ensure_encrypted(&var.value)?;
    }
    Ok(var)
}

/// Decrypt a GlobalEnvVar's value if it is marked as secret.
fn decrypt_global_var_if_secret(mut var: GlobalEnvVar) -> Result<GlobalEnvVar, String> {
    if var.secret && crypto::is_encrypted(&var.value) {
        var.value = crypto::decrypt(&var.value)?;
    }
    Ok(var)
}

/// Replace secret values with a placeholder for frontend display.
fn mask_global_var_secret(mut var: GlobalEnvVar) -> GlobalEnvVar {
    if var.secret {
        var.value = "••••••••".to_string();
    }
    var
}

/// Mask all secret values in a profile for frontend display.
fn mask_profile_secrets(mut profile: EnvProfile) -> EnvProfile {
    profile.env_vars = profile.env_vars.into_iter().map(mask_global_var_secret).collect();
    // Mask Infisical service token
    if let Some(ref mut cfg) = profile.infisical_config {
        if cfg.token.as_ref().is_some_and(|t| !t.is_empty()) {
            cfg.token = Some("••••••••".to_string());
        }
    }
    profile
}

// ─── Decrypt Commands for Frontend ──────────────────────────────────────────

/// Decrypt a global env var's secret value for frontend reveal.
#[tauri::command]
pub async fn decrypt_global_env_secret(profile_id: String, key: String) -> Result<String, String> {
    let store = load_store()?;
    let profile = store.profiles.iter().find(|p| p.id == profile_id)
        .ok_or_else(|| "Profile not found".to_string())?;
    let var = profile.env_vars.iter().find(|v| v.key == key && v.secret)
        .ok_or_else(|| format!("Secret '{}' not found", key))?;
    crypto::decrypt(&var.value)
}

/// Decrypt a project env var's secret value for frontend reveal.
#[tauri::command]
pub async fn decrypt_project_env_secret(project_id: String, key: String, profile: String) -> Result<String, String> {
    let projects = crate::commands::project::load_projects()?;
    let project = crate::commands::project::find_project(&projects, &project_id)?;
    let entry = project.env_vars.iter()
        .find(|e| e.key == key && e.profile == profile && e.secret)
        .ok_or_else(|| format!("Secret '{}' not found", key))?;
    crypto::decrypt(&entry.value)
}
