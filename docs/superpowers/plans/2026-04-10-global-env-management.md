# Global Environment Variables & Secrets Management Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple environment variable/secret management from individual projects into a global store accessible via a dedicated sidebar page, where profiles manage env vars imported from Infisical, dotenv files, or manual input. Projects reference global profiles and select which vars to inject when running containers.

**Architecture:** A new global env store (`~/.config/colima-desktop/env-store.json`) holds profiles with env vars from multiple sources. The sidebar "Environment" page provides full CRUD. Projects reference a global profile and maintain a selection (all or individual keys). At CLI execution time, the selected resolved env vars are injected into docker/compose/devcontainer commands as process env vars or `-e` flags.

**Tech Stack:** Rust (Tauri IPC commands), React 19 + TypeScript, TanStack React Query, Tailwind CSS 4, Lucide React icons

---

## File Structure

### New Files (Rust Backend)
- `src-tauri/src/commands/env_store.rs` — Global env store CRUD commands (profiles, env vars, dotenv import, infisical integration, conflict resolution)

### New Files (Frontend)
- `src/components/environment/EnvironmentPage.tsx` — Main sidebar page for env management
- `src/components/environment/GlobalProfileSelector.tsx` — Profile switcher + create/delete for global profiles
- `src/components/environment/GlobalEnvVarTable.tsx` — Env var table with search, source badges, conflict resolution, read-only for imported data
- `src/components/environment/DotenvImport.tsx` — Dotenv file import UI
- `src/components/environment/GlobalInfisicalConfig.tsx` — Infisical configuration for global profile
- `src/components/environment/ProjectEnvSelector.tsx` — Per-project env var selection UI (all/individual)
- `src/hooks/useEnvStore.ts` — React Query hooks for global env store API

### Modified Files (Rust Backend)
- `src-tauri/src/cli/types.rs` — Add new types (EnvProfile, EnvStoreConfig, ProjectEnvBinding), modify Project struct
- `src-tauri/src/commands/mod.rs` — Register new env_store module
- `src-tauri/src/commands/project.rs` — Modify project_up/compose_up/dockerfile_up/devcontainer_project_up to resolve and inject global env vars
- `src-tauri/src/lib.rs` — Register new IPC commands

### Modified Files (Frontend)
- `src/types/index.ts` — Add new TypeScript interfaces
- `src/lib/tauri.ts` — Add new API bindings
- `src/components/layout/Sidebar.tsx` — Add "Environment" nav button
- `src/components/layout/MainLayout.tsx` — Add environment page routing + import
- `src/components/containers/ProjectDetail.tsx` — Replace inline env management with ProjectEnvSelector

---

## Task 1: Rust Backend — Global Env Store Types

**Files:**
- Modify: `src-tauri/src/cli/types.rs`

- [ ] **Step 1: Add global env store types to cli/types.rs**

Add these types after the existing `EnvVarEntry` struct (around line 367):

```rust
// ─── Global Environment Store ────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GlobalEnvVar {
    pub key: String,
    pub value: String,
    pub source: String, // "manual" | "dotenv" | "infisical"
    pub secret: bool,
    #[serde(default)]
    pub source_file: Option<String>, // path for dotenv, project_id for infisical
    #[serde(default = "default_true")]
    pub enabled: bool, // active when there are key conflicts across sources
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EnvProfile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub env_vars: Vec<GlobalEnvVar>,
    #[serde(default)]
    pub infisical_config: Option<InfisicalConfig>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EnvStoreConfig {
    #[serde(default)]
    pub profiles: Vec<EnvProfile>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectEnvBinding {
    #[serde(default)]
    pub profile_id: Option<String>,
    #[serde(default = "default_true")]
    pub select_all: bool,
    #[serde(default)]
    pub selected_keys: Vec<String>,   // used when select_all = false
    #[serde(default)]
    pub excluded_keys: Vec<String>,   // used when select_all = true
}

impl Default for ProjectEnvBinding {
    fn default() -> Self {
        ProjectEnvBinding {
            profile_id: None,
            select_all: true,
            selected_keys: Vec::new(),
            excluded_keys: Vec::new(),
        }
    }
}
```

- [ ] **Step 2: Add env_binding field to Project struct**

In the `Project` struct (around line 391), add after `infisical_config`:

```rust
    #[serde(default)]
    pub env_binding: ProjectEnvBinding,
```

Also add `env_binding` to `ProjectWithStatus`:

```rust
    pub env_binding: ProjectEnvBinding,
```

And update `Project::with_status()` to include `env_binding: self.env_binding`:

```rust
impl Project {
    pub fn with_status(self, status: String, container_ids: Vec<String>) -> ProjectWithStatus {
        ProjectWithStatus {
            // ... existing fields ...
            env_binding: self.env_binding,
            status,
            container_ids,
        }
    }
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/.worktrees/devcontainer && cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5`
Expected: compilation succeeds (warnings OK)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/cli/types.rs
git commit -m "feat(types): add global env store types and ProjectEnvBinding"
```

---

## Task 2: Rust Backend — Global Env Store CRUD Commands

**Files:**
- Create: `src-tauri/src/commands/env_store.rs`
- Modify: `src-tauri/src/commands/mod.rs`

- [ ] **Step 1: Create env_store.rs with store persistence helpers**

```rust
use crate::cli::types::{EnvProfile, EnvStoreConfig, GlobalEnvVar, InfisicalConfig};
use std::io::Write;
use tokio::process::Command;

fn store_path() -> Result<std::path::PathBuf, String> {
    let config_dir = dirs::config_dir().ok_or("Cannot find config directory")?;
    let app_dir = config_dir.join("colima-desktop");
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

fn find_profile<'a>(store: &'a EnvStoreConfig, profile_id: &str) -> Result<&'a EnvProfile, String> {
    store.profiles.iter()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| "Profile not found".to_string())
}

fn find_profile_mut<'a>(store: &'a mut EnvStoreConfig, profile_id: &str) -> Result<&'a mut EnvProfile, String> {
    store.profiles.iter_mut()
        .find(|p| p.id == profile_id)
        .ok_or_else(|| "Profile not found".to_string())
}
```

- [ ] **Step 2: Add profile CRUD commands**

```rust
// ─── Profile CRUD ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn list_env_profiles() -> Result<Vec<EnvProfile>, String> {
    let store = load_store()?;
    Ok(store.profiles)
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

    store.profiles.push(profile.clone());
    save_store(&store)?;
    Ok(profile)
}

#[tauri::command]
pub async fn delete_env_profile(profile_id: String) -> Result<(), String> {
    let mut store = load_store()?;
    let profile = find_profile(&store, &profile_id)?;

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
    let result = profile.clone();
    save_store(&store)?;
    Ok(result)
}
```

- [ ] **Step 3: Add env var CRUD commands**

```rust
// ─── Env Var CRUD ────────────────────────────────────────────────────────────

#[tauri::command]
pub async fn add_global_env_var(profile_id: String, entry: GlobalEnvVar) -> Result<EnvProfile, String> {
    let mut store = load_store()?;
    let profile = find_profile_mut(&mut store, &profile_id)?;

    // For manual source: upsert by key + source
    if entry.source == "manual" {
        if let Some(existing) = profile.env_vars.iter_mut()
            .find(|e| e.key == entry.key && e.source == "manual")
        {
            *existing = entry;
        } else {
            // If this key already exists from another source, disable the new one by default
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

    let result = profile.clone();
    save_store(&store)?;
    Ok(result)
}

#[tauri::command]
pub async fn remove_global_env_var(profile_id: String, key: String, source: String) -> Result<EnvProfile, String> {
    let mut store = load_store()?;
    let profile = find_profile_mut(&mut store, &profile_id)?;

    profile.env_vars.retain(|e| !(e.key == key && e.source == source));

    let result = profile.clone();
    save_store(&store)?;
    Ok(result)
}

#[tauri::command]
pub async fn toggle_global_env_var(profile_id: String, key: String, source: String, enabled: bool) -> Result<EnvProfile, String> {
    let mut store = load_store()?;
    let profile = find_profile_mut(&mut store, &profile_id)?;

    // When enabling a var, disable other vars with the same key
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

    let result = profile.clone();
    save_store(&store)?;
    Ok(result)
}
```

- [ ] **Step 4: Add dotenv import command**

```rust
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

    // Remove old dotenv entries from this file
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

    let result = profile.clone();
    save_store(&store)?;
    Ok(result)
}

#[tauri::command]
pub async fn reimport_dotenv(profile_id: String, file_path: String) -> Result<EnvProfile, String> {
    import_dotenv_to_profile(profile_id, file_path).await
}
```

- [ ] **Step 5: Add infisical commands for global profiles**

```rust
// ─── Infisical Integration ───────────────────────────────────────────────────

#[tauri::command]
pub async fn configure_profile_infisical(profile_id: String, config: InfisicalConfig) -> Result<EnvProfile, String> {
    let mut store = load_store()?;
    let profile = find_profile_mut(&mut store, &profile_id)?;

    profile.infisical_config = Some(config);

    let result = profile.clone();
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

    // Remove old infisical entries
    profile.env_vars.retain(|e| e.source != "infisical");

    for (key, value) in parsed {
        let has_enabled = profile.env_vars.iter().any(|e| e.key == key && e.enabled);
        profile.env_vars.push(GlobalEnvVar {
            key,
            value,
            source: "infisical".to_string(),
            secret: true,
            source_file: Some(cfg.project_id.clone()),
            enabled: !has_enabled,
        });
    }

    let result = profile.clone();
    save_store(&store)?;
    Ok(result)
}

#[tauri::command]
pub async fn test_profile_infisical(profile_id: String) -> Result<bool, String> {
    let store = load_store()?;
    let profile = find_profile(&store, &profile_id)?;

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
```

- [ ] **Step 6: Add resolved env vars helper (used by CLI injection)**

```rust
// ─── Resolve Env Vars ────────────────────────────────────────────────────────

/// Get the effective (enabled, deduplicated) env vars from a profile.
/// Returns only vars where `enabled == true`, keeping the last one per key.
pub fn get_resolved_vars(profile: &EnvProfile) -> Vec<&GlobalEnvVar> {
    let mut result: Vec<&GlobalEnvVar> = Vec::new();
    for var in &profile.env_vars {
        if !var.enabled {
            continue;
        }
        // Replace existing key if already present
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
    let profile = find_profile(&store, &profile_id)?;
    Ok(get_resolved_vars(profile).into_iter().cloned().collect())
}

/// Public helper for project commands to load store and resolve vars.
pub fn load_and_resolve_profile(profile_id: &str) -> Result<Vec<GlobalEnvVar>, String> {
    let store = load_store()?;
    let profile = find_profile(&store, profile_id)?;
    Ok(get_resolved_vars(profile).into_iter().cloned().collect())
}
```

- [ ] **Step 7: Register module in mod.rs**

In `src-tauri/src/commands/mod.rs`, add:

```rust
pub mod env_store;
```

- [ ] **Step 8: Verify it compiles**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/.worktrees/devcontainer && cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -10`
Expected: compilation succeeds

- [ ] **Step 9: Commit**

```bash
git add src-tauri/src/commands/env_store.rs src-tauri/src/commands/mod.rs
git commit -m "feat(backend): add global env store CRUD commands"
```

---

## Task 3: Rust Backend — Register IPC Commands

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Register all new env_store commands in lib.rs**

Add to the `invoke_handler` in `lib.rs`, after the existing `env_secrets` commands:

```rust
            // Global Env Store
            commands::env_store::list_env_profiles,
            commands::env_store::create_env_profile,
            commands::env_store::delete_env_profile,
            commands::env_store::rename_env_profile,
            commands::env_store::add_global_env_var,
            commands::env_store::remove_global_env_var,
            commands::env_store::toggle_global_env_var,
            commands::env_store::import_dotenv_to_profile,
            commands::env_store::reimport_dotenv,
            commands::env_store::configure_profile_infisical,
            commands::env_store::sync_profile_infisical,
            commands::env_store::test_profile_infisical,
            commands::env_store::get_resolved_env_vars,
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/.worktrees/devcontainer && cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5`
Expected: compilation succeeds

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(backend): register global env store IPC commands"
```

---

## Task 4: Rust Backend — CLI Env Injection

**Files:**
- Modify: `src-tauri/src/commands/project.rs`

- [ ] **Step 1: Add helper function to resolve project env vars from global store**

Add this function near the top of `project.rs` (after `find_project`):

```rust
use crate::cli::types::ProjectEnvBinding;

/// Resolve environment variables for a project from the global env store.
/// Returns a list of (key, value) pairs based on the project's env_binding settings.
fn resolve_project_env(project: &Project) -> Result<Vec<(String, String)>, String> {
    let binding = &project.env_binding;
    let profile_id = match &binding.profile_id {
        Some(id) => id.clone(),
        None => return Ok(Vec::new()),
    };

    let all_vars = crate::commands::env_store::load_and_resolve_profile(&profile_id)?;

    let selected: Vec<(String, String)> = all_vars
        .into_iter()
        .filter(|var| {
            if binding.select_all {
                !binding.excluded_keys.contains(&var.key)
            } else {
                binding.selected_keys.contains(&var.key)
            }
        })
        .map(|var| (var.key, var.value))
        .collect();

    Ok(selected)
}
```

- [ ] **Step 2: Modify compose_up to inject global env vars**

In `compose_up` (around line 559), after the existing secrets override logic and before `args.push("up".to_string())`, add global env injection:

```rust
    // Inject global env store vars into the compose process environment
    let global_env_pairs = resolve_project_env(project)?;
```

Then, when spawning the Command (around line 643), chain `.envs()` to inject:

```rust
    let mut child = Command::new(&compose_cmd[0])
        .args(&str_args)
        .current_dir(&project.workspace_path)
        .env("DOCKER_HOST", &docker_host_val)
        .envs(global_env_pairs.iter().map(|(k, v)| (k.as_str(), v.as_str())))
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn compose up: {}", e))?;
```

Also add the env vars to the override YAML if using compose override approach. For compose, the best approach is to add them to the `--env-file` or generate environment entries. Since the compose process inherits env vars, and compose files can reference `${VAR}` syntax, inject them as process environment:

No additional changes needed beyond `.envs()` — compose will inherit them.

But we also need to add `-e VAR_NAME` args for docker run. For compose, process env + `environment:` entries in override is the approach.

Add this to the compose override generation in `env_secrets.rs::prepare_secrets_for_compose` or create a new override. Actually, the simplest approach for compose is to write a `.env` temp file with the global vars.

Replace the `_temp_env_file` logic block with this updated version that includes global env vars:

```rust
    // Inject global env store vars via temp env file
    let _temp_env_file = {
        let global_pairs = resolve_project_env(project)?;
        if !global_pairs.is_empty() {
            let lines: Vec<String> = global_pairs.iter()
                .map(|(k, v)| format!("{}={}", k, v))
                .collect();
            let temp_dir = tempfile::tempdir()
                .map_err(|e| format!("Failed to create temp dir: {}", e))?;
            let temp_path = temp_dir.path().join(".env.colima-global");
            std::fs::write(&temp_path, lines.join("\n"))
                .map_err(|e| format!("Failed to write temp env file: {}", e))?;
            args.extend(["--env-file".to_string(), temp_path.to_string_lossy().to_string()]);
            Some(temp_dir)
        } else {
            None
        }
    };
```

- [ ] **Step 3: Modify dockerfile_up to inject global env vars**

In `dockerfile_up` (around line 728), after `run_args.extend(collect_env_args(...))`, add:

```rust
    // Add global env store vars
    let global_pairs = resolve_project_env(project)?;
    for (key, value) in &global_pairs {
        run_args.push("-e".to_string());
        run_args.push(format!("{}={}", key, value));
    }
```

- [ ] **Step 4: Modify devcontainer_project_up to inject global env vars**

In `devcontainer_project_up` (around line 795), before `let mut child = Command::new(&cli)`, add `--remote-env` args:

```rust
    // Inject global env store vars as remote env
    let global_pairs = resolve_project_env(project)?;
    let env_strings: Vec<String> = global_pairs.iter()
        .map(|(k, v)| format!("{}={}", k, v))
        .collect();
    for env_str in &env_strings {
        args.push("--remote-env");
        args.push(env_str.as_str());
    }
```

Note: `args` is `Vec<&str>`, so we need to hold the strings. Adjust to use owned strings:

```rust
    // Convert args to owned for lifetime safety
    let mut owned_args: Vec<String> = args.iter().map(|s| s.to_string()).collect();

    // Inject global env store vars as remote env
    let global_pairs = resolve_project_env(project)?;
    for (key, value) in &global_pairs {
        owned_args.push("--remote-env".to_string());
        owned_args.push(format!("{}={}", key, value));
    }

    let str_args: Vec<&str> = owned_args.iter().map(|s| s.as_str()).collect();

    let mut child = Command::new(&cli)
        .args(&str_args)
        .env("DOCKER_HOST", &docker_host_val)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn devcontainer up: {}", e))?;
```

- [ ] **Step 5: Verify it compiles**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/.worktrees/devcontainer && cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -10`
Expected: compilation succeeds

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/commands/project.rs
git commit -m "feat(backend): inject global env store vars into CLI commands"
```

---

## Task 5: Frontend — TypeScript Types & API Bindings

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Add new types to types/index.ts**

Add after the existing `InfisicalConfig` interface:

```typescript
// ─── Global Environment Store ────────────────────────────────────────────────

export interface GlobalEnvVar {
  key: string;
  value: string;
  source: "manual" | "dotenv" | "infisical";
  secret: boolean;
  source_file: string | null;
  enabled: boolean;
}

export interface EnvProfile {
  id: string;
  name: string;
  env_vars: GlobalEnvVar[];
  infisical_config: InfisicalConfig | null;
}

export interface ProjectEnvBinding {
  profile_id: string | null;
  select_all: boolean;
  selected_keys: string[];
  excluded_keys: string[];
}
```

Add `env_binding` to the `Project` interface:

```typescript
export interface Project {
  // ... existing fields ...
  env_binding: ProjectEnvBinding;
}
```

- [ ] **Step 2: Add API bindings to tauri.ts**

Add to the `api` object in `src/lib/tauri.ts`:

```typescript
  // Global Env Store
  listEnvProfiles: () =>
    invoke<EnvProfile[]>("list_env_profiles"),
  createEnvProfile: (name: string) =>
    invoke<EnvProfile>("create_env_profile", { name }),
  deleteEnvProfile: (profileId: string) =>
    invoke<void>("delete_env_profile", { profileId }),
  renameEnvProfile: (profileId: string, newName: string) =>
    invoke<EnvProfile>("rename_env_profile", { profileId, newName }),
  addGlobalEnvVar: (profileId: string, entry: GlobalEnvVar) =>
    invoke<EnvProfile>("add_global_env_var", { profileId, entry }),
  removeGlobalEnvVar: (profileId: string, key: string, source: string) =>
    invoke<EnvProfile>("remove_global_env_var", { profileId, key, source }),
  toggleGlobalEnvVar: (profileId: string, key: string, source: string, enabled: boolean) =>
    invoke<EnvProfile>("toggle_global_env_var", { profileId, key, source, enabled }),
  importDotenvToProfile: (profileId: string, filePath: string) =>
    invoke<EnvProfile>("import_dotenv_to_profile", { profileId, filePath }),
  reimportDotenv: (profileId: string, filePath: string) =>
    invoke<EnvProfile>("reimport_dotenv", { profileId, filePath }),
  configureProfileInfisical: (profileId: string, config: InfisicalConfig) =>
    invoke<EnvProfile>("configure_profile_infisical", { profileId, config }),
  syncProfileInfisical: (profileId: string) =>
    invoke<EnvProfile>("sync_profile_infisical", { profileId }),
  testProfileInfisical: (profileId: string) =>
    invoke<boolean>("test_profile_infisical", { profileId }),
  getResolvedEnvVars: (profileId: string) =>
    invoke<GlobalEnvVar[]>("get_resolved_env_vars", { profileId }),
```

Update the import at the top to include new types:

```typescript
import type { ..., GlobalEnvVar, EnvProfile, ProjectEnvBinding } from "../types";
```

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts src/lib/tauri.ts
git commit -m "feat(frontend): add global env store types and API bindings"
```

---

## Task 6: Frontend — React Query Hooks for Global Env Store

**Files:**
- Create: `src/hooks/useEnvStore.ts`

- [ ] **Step 1: Create useEnvStore.ts with all hooks**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";
import type { GlobalEnvVar, InfisicalConfig } from "../types";

const PROFILES_KEY = ["env-profiles"];

// ── Profile CRUD ──

export function useEnvProfiles() {
  return useQuery({
    queryKey: PROFILES_KEY,
    queryFn: api.listEnvProfiles,
  });
}

export function useCreateEnvProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.createEnvProfile(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILES_KEY });
    },
  });
}

export function useDeleteEnvProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profileId: string) => api.deleteEnvProfile(profileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILES_KEY });
    },
  });
}

export function useRenameEnvProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, newName }: { profileId: string; newName: string }) =>
      api.renameEnvProfile(profileId, newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILES_KEY });
    },
  });
}

// ── Env Var CRUD ──

export function useAddGlobalEnvVar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, entry }: { profileId: string; entry: GlobalEnvVar }) =>
      api.addGlobalEnvVar(profileId, entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILES_KEY });
    },
  });
}

export function useRemoveGlobalEnvVar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, key, source }: { profileId: string; key: string; source: string }) =>
      api.removeGlobalEnvVar(profileId, key, source),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILES_KEY });
    },
  });
}

export function useToggleGlobalEnvVar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, key, source, enabled }: { profileId: string; key: string; source: string; enabled: boolean }) =>
      api.toggleGlobalEnvVar(profileId, key, source, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILES_KEY });
    },
  });
}

// ── Dotenv Import ──

export function useImportDotenvToProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, filePath }: { profileId: string; filePath: string }) =>
      api.importDotenvToProfile(profileId, filePath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILES_KEY });
    },
  });
}

export function useReimportDotenv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, filePath }: { profileId: string; filePath: string }) =>
      api.reimportDotenv(profileId, filePath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILES_KEY });
    },
  });
}

// ── Infisical ──

export function useConfigureProfileInfisical() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, config }: { profileId: string; config: InfisicalConfig }) =>
      api.configureProfileInfisical(profileId, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILES_KEY });
    },
  });
}

export function useSyncProfileInfisical() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profileId: string) => api.syncProfileInfisical(profileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILES_KEY });
    },
  });
}

export function useTestProfileInfisical() {
  return useMutation({
    mutationFn: (profileId: string) => api.testProfileInfisical(profileId),
  });
}

// ── Resolved Vars ──

export function useResolvedEnvVars(profileId: string | null) {
  return useQuery({
    queryKey: ["resolved-env-vars", profileId],
    queryFn: () => api.getResolvedEnvVars(profileId!),
    enabled: !!profileId,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useEnvStore.ts
git commit -m "feat(frontend): add React Query hooks for global env store"
```

---

## Task 7: Frontend — Sidebar & Routing

**Files:**
- Modify: `src/components/layout/Sidebar.tsx`
- Modify: `src/components/layout/MainLayout.tsx`

- [ ] **Step 1: Add "Environment" to Page type in Sidebar.tsx**

Change the `Page` type (line 6):

```typescript
type Page = "containers" | "images" | "volumes" | "networks" | "environment" | "settings";
```

Add a nav button after "Networks" and before "Settings" (after line 101):

```tsx
        <button
          onClick={() => onPageChange("environment")}
          data-active={activePage === "environment"}
          className={cn("glass-nav-item rounded-lg px-3 py-2 text-left text-sm",
            activePage === "environment" ? "text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Environment
        </button>
```

- [ ] **Step 2: Add routing in MainLayout.tsx**

Change the `Page` type (line 15):

```typescript
type Page = "containers" | "images" | "volumes" | "networks" | "environment" | "settings";
```

Add import at top:

```typescript
import { EnvironmentPage } from "../environment/EnvironmentPage";
```

Add the page render after `{activePage === "networks" && <NetworkList />}`:

```tsx
        {activePage === "environment" && <EnvironmentPage />}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/layout/Sidebar.tsx src/components/layout/MainLayout.tsx
git commit -m "feat(ui): add Environment page to sidebar navigation"
```

---

## Task 8: Frontend — Global Profile Selector Component

**Files:**
- Create: `src/components/environment/GlobalProfileSelector.tsx`

- [ ] **Step 1: Create GlobalProfileSelector component**

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ChevronDown, Pencil } from "lucide-react";
import type { EnvProfile } from "../../types";
import {
  useCreateEnvProfile,
  useDeleteEnvProfile,
  useRenameEnvProfile,
} from "../../hooks/useEnvStore";

interface GlobalProfileSelectorProps {
  profiles: EnvProfile[];
  activeProfileId: string;
  onProfileChange: (profileId: string) => void;
}

export function GlobalProfileSelector({
  profiles,
  activeProfileId,
  onProfileChange,
}: GlobalProfileSelectorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const createProfile = useCreateEnvProfile();
  const deleteProfile = useDeleteEnvProfile();
  const renameProfile = useRenameEnvProfile();

  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  const handleCreate = () => {
    if (!newName.trim()) return;
    createProfile.mutate(newName.trim(), {
      onSuccess: (profile) => {
        setNewName("");
        setIsAdding(false);
        onProfileChange(profile.id);
      },
    });
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteProfile.mutate(id, {
      onSuccess: () => {
        if (activeProfileId === id && profiles.length > 1) {
          const fallback = profiles.find((p) => p.id !== id);
          if (fallback) onProfileChange(fallback.id);
        }
      },
    });
  };

  const handleRename = (id: string) => {
    if (!editName.trim()) return;
    renameProfile.mutate(
      { profileId: id, newName: editName.trim() },
      { onSuccess: () => setEditingId(null) }
    );
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Profile:</span>
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs min-w-[120px] justify-between"
          onClick={() => setOpen(!open)}
        >
          {activeProfile?.name ?? "Select..."}
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
        {open && (
          <div className="absolute top-full left-0 mt-1 z-50 w-56 rounded-md border bg-popover p-1 shadow-md">
            {profiles.map((p) => (
              <div
                key={p.id}
                className={`flex items-center justify-between rounded-sm px-2 py-1.5 text-xs cursor-pointer hover:bg-accent ${
                  p.id === activeProfileId ? "bg-accent" : ""
                }`}
                onClick={() => {
                  onProfileChange(p.id);
                  setOpen(false);
                }}
              >
                {editingId === p.id ? (
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-5 text-xs w-28"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(p.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <span className="flex items-center gap-1.5">
                    {p.name}
                    <Badge variant="outline" className="text-[9px] px-1">
                      {p.env_vars.length}
                    </Badge>
                  </span>
                )}
                <div className="flex items-center gap-0.5">
                  {p.name !== "default" && editingId !== p.id && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(p.id);
                          setEditName(p.name);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 shrink-0"
                        onClick={(e) => handleDelete(p.id, e)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {isAdding ? (
        <div className="flex items-center gap-1">
          <Input
            placeholder="Profile name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-7 text-xs w-28"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") setIsAdding(false);
            }}
            autoFocus
          />
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleCreate}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsAdding(true)}>
          <Plus className="h-3 w-3 mr-1" />
          New
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/environment/GlobalProfileSelector.tsx
git commit -m "feat(ui): add GlobalProfileSelector component"
```

---

## Task 9: Frontend — Global Env Var Table Component

**Files:**
- Create: `src/components/environment/GlobalEnvVarTable.tsx`

- [ ] **Step 1: Create GlobalEnvVarTable component**

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Eye, EyeOff, Lock, Search, ToggleLeft, ToggleRight, RefreshCw } from "lucide-react";
import type { GlobalEnvVar, EnvProfile } from "../../types";
import {
  useAddGlobalEnvVar,
  useRemoveGlobalEnvVar,
  useToggleGlobalEnvVar,
  useReimportDotenv,
} from "../../hooks/useEnvStore";

interface GlobalEnvVarTableProps {
  profile: EnvProfile;
}

export function GlobalEnvVarTable({ profile }: GlobalEnvVarTableProps) {
  const [search, setSearch] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newSecret, setNewSecret] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const addEnvVar = useAddGlobalEnvVar();
  const removeEnvVar = useRemoveGlobalEnvVar();
  const toggleEnvVar = useToggleGlobalEnvVar();
  const reimportDotenv = useReimportDotenv();

  const filteredVars = profile.env_vars
    .filter((v) =>
      !search || v.key.toLowerCase().includes(search.toLowerCase()) || v.value.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => a.key.localeCompare(b.key));

  // Group vars by key to show conflicts
  const keyGroups = new Map<string, GlobalEnvVar[]>();
  for (const v of filteredVars) {
    const existing = keyGroups.get(v.key) || [];
    existing.push(v);
    keyGroups.set(v.key, existing);
  }

  const handleAdd = () => {
    if (!newKey.trim()) return;
    addEnvVar.mutate({
      profileId: profile.id,
      entry: {
        key: newKey.trim(),
        value: newValue,
        source: "manual",
        secret: newSecret,
        source_file: null,
        enabled: true,
      },
    });
    setNewKey("");
    setNewValue("");
    setNewSecret(false);
  };

  const handleRemove = (key: string, source: string) => {
    removeEnvVar.mutate({ profileId: profile.id, key, source });
  };

  const handleToggle = (key: string, source: string, enabled: boolean) => {
    toggleEnvVar.mutate({ profileId: profile.id, key, source, enabled });
  };

  const toggleReveal = (key: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Collect unique dotenv source files for reimport
  const dotenvSources = [...new Set(
    profile.env_vars
      .filter((v) => v.source === "dotenv" && v.source_file)
      .map((v) => v.source_file!)
  )];

  const sourceColor = (source: string) => {
    switch (source) {
      case "infisical":
        return "bg-green-500/10 text-green-400 border-green-500/20";
      case "dotenv":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-2">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search variables..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs pl-7"
        />
      </div>

      {/* Dotenv reimport buttons */}
      {dotenvSources.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {dotenvSources.map((src) => (
            <Button
              key={src}
              variant="outline"
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => reimportDotenv.mutate({ profileId: profile.id, filePath: src })}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Reload {src.split("/").pop()}
            </Button>
          ))}
        </div>
      )}

      {/* Env var list */}
      {filteredVars.length > 0 && (
        <div className="space-y-1 max-h-[calc(100vh-360px)] overflow-y-auto">
          {filteredVars.map((v) => {
            const siblings = keyGroups.get(v.key) || [];
            const hasConflict = siblings.length > 1;

            return (
              <div
                key={`${v.key}-${v.source}`}
                className={`flex items-center gap-2 rounded-md px-2 py-1 ${
                  !v.enabled
                    ? "opacity-40 bg-muted/10"
                    : v.secret
                    ? "bg-amber-500/5 border border-amber-500/10"
                    : "bg-muted/20"
                }`}
              >
                {/* Conflict toggle */}
                {hasConflict && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={() => handleToggle(v.key, v.source, !v.enabled)}
                    title={v.enabled ? "Disable (use another source)" : "Enable (use this source)"}
                  >
                    {v.enabled ? (
                      <ToggleRight className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <ToggleLeft className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}

                {v.secret && <Lock className="h-3 w-3 text-amber-400 shrink-0" />}
                <Badge
                  variant="outline"
                  className={`text-[9px] px-1 shrink-0 ${sourceColor(v.source)}`}
                >
                  {v.source}
                </Badge>
                <code className="text-[11px] font-mono truncate w-32 shrink-0">
                  {v.key}
                </code>
                <code className="text-[11px] font-mono truncate flex-1 text-muted-foreground">
                  {v.secret && !revealedKeys.has(v.key) ? "••••••••" : v.value}
                </code>
                {v.secret && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={() => toggleReveal(v.key)}
                  >
                    {revealedKeys.has(v.key) ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                  </Button>
                )}
                {/* Only manual entries can be deleted; imported entries are read-only */}
                {v.source === "manual" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={() => handleRemove(v.key, v.source)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {filteredVars.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          No environment variables. Add manually or import from .env / Infisical.
        </p>
      )}

      {/* Add new manual env var */}
      <div className="flex items-center gap-2 pt-1 border-t">
        <Input
          placeholder="KEY"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          className="h-7 text-xs font-mono flex-1"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Input
          placeholder="VALUE"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          className="h-7 text-xs font-mono flex-1"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button
          variant={newSecret ? "default" : "outline"}
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={() => setNewSecret(!newSecret)}
          title={newSecret ? "Secret" : "Not a secret"}
        >
          <Lock className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={handleAdd}
          disabled={!newKey.trim()}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/environment/GlobalEnvVarTable.tsx
git commit -m "feat(ui): add GlobalEnvVarTable with search, conflicts, read-only imports"
```

---

## Task 10: Frontend — Dotenv Import & Infisical Config Components

**Files:**
- Create: `src/components/environment/DotenvImport.tsx`
- Create: `src/components/environment/GlobalInfisicalConfig.tsx`

- [ ] **Step 1: Create DotenvImport component**

```tsx
import { Button } from "@/components/ui/button";
import { FileText } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { useImportDotenvToProfile } from "../../hooks/useEnvStore";

interface DotenvImportProps {
  profileId: string;
}

export function DotenvImport({ profileId }: DotenvImportProps) {
  const importDotenv = useImportDotenvToProfile();

  const handleImport = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Env Files", extensions: ["env", "*"] }],
    });
    if (!selected) return;
    const path = typeof selected === "string" ? selected : selected[0];
    if (!path) return;

    importDotenv.mutate({ profileId, filePath: path });
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-7 text-xs"
      onClick={handleImport}
      disabled={importDotenv.isPending}
    >
      <FileText className="h-3.5 w-3.5 mr-1" />
      Import .env
    </Button>
  );
}
```

- [ ] **Step 2: Create GlobalInfisicalConfig component**

```tsx
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import type { InfisicalConfig as InfisicalConfigType } from "../../types";
import {
  useCheckInfisicalInstalled,
} from "../../hooks/useEnvSecrets";
import {
  useConfigureProfileInfisical,
  useSyncProfileInfisical,
  useTestProfileInfisical,
} from "../../hooks/useEnvStore";

interface GlobalInfisicalConfigProps {
  profileId: string;
  config: InfisicalConfigType | null;
}

export function GlobalInfisicalConfig({ profileId, config }: GlobalInfisicalConfigProps) {
  const { data: isInstalled } = useCheckInfisicalInstalled();
  const configureInfisical = useConfigureProfileInfisical();
  const syncInfisical = useSyncProfileInfisical();
  const testConnection = useTestProfileInfisical();

  const [projectIdInput, setProjectIdInput] = useState(config?.project_id ?? "");
  const [environment, setEnvironment] = useState(config?.environment ?? "dev");
  const [secretPath, setSecretPath] = useState(config?.secret_path ?? "/");
  const [autoSync, setAutoSync] = useState(config?.auto_sync ?? false);
  const [token, setToken] = useState(config?.token ?? "");

  useEffect(() => {
    setProjectIdInput(config?.project_id ?? "");
    setEnvironment(config?.environment ?? "dev");
    setSecretPath(config?.secret_path ?? "/");
    setAutoSync(config?.auto_sync ?? false);
    setToken(config?.token ?? "");
  }, [config]);

  const buildConfig = (): InfisicalConfigType => ({
    project_id: projectIdInput,
    environment,
    secret_path: secretPath,
    auto_sync: autoSync,
    profile_mapping: {},
    token: token || null,
  });

  const handleSave = () => {
    configureInfisical.mutate({ profileId, config: buildConfig() });
  };

  const saveAndThen = (action: () => void) => {
    configureInfisical.mutate(
      { profileId, config: buildConfig() },
      { onSuccess: () => action() }
    );
  };

  const handleSync = () => {
    saveAndThen(() => syncInfisical.mutate(profileId));
  };

  const handleTest = () => {
    saveAndThen(() => testConnection.mutate(profileId));
  };

  if (isInstalled === false) {
    return (
      <div className="rounded-md bg-muted/20 px-3 py-2">
        <p className="text-xs text-muted-foreground">
          Infisical CLI not found. Install it to enable secret syncing.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold">Infisical</h4>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px]"
            onClick={handleTest}
            disabled={testConnection.isPending || !projectIdInput}
          >
            {testConnection.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : testConnection.data === true ? (
              <CheckCircle className="h-3 w-3 text-green-500 mr-1" />
            ) : testConnection.data === false ? (
              <XCircle className="h-3 w-3 text-destructive mr-1" />
            ) : null}
            Test
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px]"
            onClick={handleSync}
            disabled={syncInfisical.isPending || !projectIdInput}
          >
            {syncInfisical.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            Sync Now
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground">Project ID</label>
          <Input
            value={projectIdInput}
            onChange={(e) => setProjectIdInput(e.target.value)}
            className="h-7 text-xs font-mono"
            placeholder="infisical project id"
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Environment</label>
          <Input
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
            className="h-7 text-xs font-mono"
            placeholder="dev"
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Secret Path</label>
          <Input
            value={secretPath}
            onChange={(e) => setSecretPath(e.target.value)}
            className="h-7 text-xs font-mono"
            placeholder="/"
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
              className="rounded"
            />
            Auto-sync on start
          </label>
        </div>
      </div>

      <div>
        <label className="text-[10px] text-muted-foreground">Service Token</label>
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="h-7 text-xs font-mono"
          placeholder="st.xxx... (Service Token or Machine Identity Access Token)"
        />
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full h-7 text-xs"
        onClick={handleSave}
        disabled={configureInfisical.isPending || !projectIdInput}
      >
        Save Infisical Config
      </Button>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/environment/DotenvImport.tsx src/components/environment/GlobalInfisicalConfig.tsx
git commit -m "feat(ui): add DotenvImport and GlobalInfisicalConfig components"
```

---

## Task 11: Frontend — Environment Page (Main)

**Files:**
- Create: `src/components/environment/EnvironmentPage.tsx`

- [ ] **Step 1: Create EnvironmentPage component**

```tsx
import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { useEnvProfiles } from "../../hooks/useEnvStore";
import { GlobalProfileSelector } from "./GlobalProfileSelector";
import { GlobalEnvVarTable } from "./GlobalEnvVarTable";
import { DotenvImport } from "./DotenvImport";
import { GlobalInfisicalConfig } from "./GlobalInfisicalConfig";

export function EnvironmentPage() {
  const { data: profiles, isLoading } = useEnvProfiles();
  const [activeProfileId, setActiveProfileId] = useState<string>("");

  // Set default profile on first load
  useEffect(() => {
    if (profiles && profiles.length > 0 && !activeProfileId) {
      setActiveProfileId(profiles[0].id);
    }
  }, [profiles, activeProfileId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!profiles || profiles.length === 0) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-sm text-muted-foreground">No profiles found.</p>
      </div>
    );
  }

  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  if (!activeProfile) {
    return null;
  }

  const envCount = activeProfile.env_vars.filter((v) => !v.secret && v.enabled).length;
  const secretCount = activeProfile.env_vars.filter((v) => v.secret && v.enabled).length;
  const conflictCount = (() => {
    const keyCounts = new Map<string, number>();
    for (const v of activeProfile.env_vars) {
      keyCounts.set(v.key, (keyCounts.get(v.key) || 0) + 1);
    }
    return [...keyCounts.values()].filter((c) => c > 1).length;
  })();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <GlobalProfileSelector
          profiles={profiles}
          activeProfileId={activeProfileId}
          onProfileChange={setActiveProfileId}
        />
        <DotenvImport profileId={activeProfile.id} />
      </div>

      <div className="flex gap-2 text-[10px] text-muted-foreground">
        <span>{envCount} env vars</span>
        {secretCount > 0 && <span>· {secretCount} secrets</span>}
        {conflictCount > 0 && (
          <Badge variant="outline" className="text-[9px] px-1 bg-amber-500/10 text-amber-400 border-amber-500/20">
            {conflictCount} conflicts
          </Badge>
        )}
      </div>

      <GlobalEnvVarTable profile={activeProfile} />

      <GlobalInfisicalConfig
        profileId={activeProfile.id}
        config={activeProfile.infisical_config}
      />
    </div>
  );
}
```

- [ ] **Step 2: Verify frontend builds**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/.worktrees/devcontainer && npx tsc --noEmit 2>&1 | tail -10`
Expected: no errors (or only pre-existing ones)

- [ ] **Step 3: Commit**

```bash
git add src/components/environment/EnvironmentPage.tsx
git commit -m "feat(ui): add EnvironmentPage with profile selector, env table, infisical"
```

---

## Task 12: Frontend — Project Env Selector Component

**Files:**
- Create: `src/components/environment/ProjectEnvSelector.tsx`

- [ ] **Step 1: Create ProjectEnvSelector component**

This component is used in `ProjectDetail` to let users select which global profile and which env vars to use for a project.

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Check, Lock } from "lucide-react";
import type { Project, ProjectEnvBinding, EnvProfile, GlobalEnvVar } from "../../types";
import { useEnvProfiles, useResolvedEnvVars } from "../../hooks/useEnvStore";
import { api } from "../../lib/tauri";
import { useQueryClient } from "@tanstack/react-query";

interface ProjectEnvSelectorProps {
  project: Project;
}

export function ProjectEnvSelector({ project }: ProjectEnvSelectorProps) {
  const { data: profiles } = useEnvProfiles();
  const queryClient = useQueryClient();
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  const binding = project.env_binding;
  const selectedProfile = profiles?.find((p) => p.id === binding.profile_id);
  const { data: resolvedVars } = useResolvedEnvVars(binding.profile_id ?? null);

  const updateBinding = async (newBinding: Partial<ProjectEnvBinding>) => {
    const updated = {
      ...project,
      env_binding: { ...binding, ...newBinding },
    };
    // Remove status and container_ids before sending to backend
    const { status, container_ids, ...projectData } = updated;
    await api.updateProject(projectData);
    queryClient.invalidateQueries({ queryKey: ["projects"] });
  };

  const isKeySelected = (key: string) => {
    if (binding.select_all) {
      return !binding.excluded_keys.includes(key);
    }
    return binding.selected_keys.includes(key);
  };

  const toggleKey = (key: string) => {
    if (binding.select_all) {
      const excluded = binding.excluded_keys.includes(key)
        ? binding.excluded_keys.filter((k) => k !== key)
        : [...binding.excluded_keys, key];
      updateBinding({ excluded_keys: excluded });
    } else {
      const selected = binding.selected_keys.includes(key)
        ? binding.selected_keys.filter((k) => k !== key)
        : [...binding.selected_keys, key];
      updateBinding({ selected_keys: selected });
    }
  };

  const toggleSelectAll = () => {
    updateBinding({
      select_all: !binding.select_all,
      selected_keys: [],
      excluded_keys: [],
    });
  };

  const selectedCount = resolvedVars
    ? resolvedVars.filter((v) => isKeySelected(v.key)).length
    : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold">Environment Variables</h4>
        {selectedProfile && (
          <Badge variant="outline" className="text-[9px]">
            {selectedCount} / {resolvedVars?.length ?? 0} selected
          </Badge>
        )}
      </div>

      {/* Profile selector */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">Global Profile:</span>
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs min-w-[120px] justify-between"
            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
          >
            {selectedProfile?.name ?? "None"}
            <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
          {profileDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 w-48 rounded-md border bg-popover p-1 shadow-md">
              <div
                className="rounded-sm px-2 py-1.5 text-xs cursor-pointer hover:bg-accent"
                onClick={() => {
                  updateBinding({ profile_id: null, selected_keys: [], excluded_keys: [] });
                  setProfileDropdownOpen(false);
                }}
              >
                None
              </div>
              {profiles?.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between rounded-sm px-2 py-1.5 text-xs cursor-pointer hover:bg-accent ${
                    p.id === binding.profile_id ? "bg-accent" : ""
                  }`}
                  onClick={() => {
                    updateBinding({ profile_id: p.id, selected_keys: [], excluded_keys: [] });
                    setProfileDropdownOpen(false);
                  }}
                >
                  <span>{p.name}</span>
                  <Badge variant="outline" className="text-[9px] px-1">
                    {p.env_vars.filter((v) => v.enabled).length}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Select all toggle + var list */}
      {selectedProfile && resolvedVars && resolvedVars.length > 0 && (
        <>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={binding.select_all}
                onChange={toggleSelectAll}
                className="rounded"
              />
              Select all
            </label>
          </div>

          <div className="space-y-1 max-h-48 overflow-y-auto">
            {resolvedVars.map((v) => (
              <div
                key={v.key}
                className={`flex items-center gap-2 rounded-md px-2 py-1 cursor-pointer hover:bg-muted/30 ${
                  isKeySelected(v.key)
                    ? "bg-muted/20"
                    : "opacity-40"
                }`}
                onClick={() => toggleKey(v.key)}
              >
                <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                  isKeySelected(v.key)
                    ? "bg-primary border-primary"
                    : "border-muted-foreground"
                }`}>
                  {isKeySelected(v.key) && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                {v.secret && <Lock className="h-3 w-3 text-amber-400 shrink-0" />}
                <code className="text-[11px] font-mono truncate">
                  {v.key}
                </code>
                <Badge variant="outline" className="text-[9px] px-1 ml-auto shrink-0">
                  {v.source}
                </Badge>
              </div>
            ))}
          </div>
        </>
      )}

      {binding.profile_id && resolvedVars && resolvedVars.length === 0 && (
        <p className="text-[10px] text-muted-foreground">
          No enabled env vars in this profile. Go to Environment page to add some.
        </p>
      )}

      {!binding.profile_id && (
        <p className="text-[10px] text-muted-foreground">
          Select a global profile to inject environment variables into this project's containers.
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/environment/ProjectEnvSelector.tsx
git commit -m "feat(ui): add ProjectEnvSelector for per-project env var selection"
```

---

## Task 13: Frontend — Integrate ProjectEnvSelector into ProjectDetail

**Files:**
- Modify: `src/components/containers/ProjectDetail.tsx`

- [ ] **Step 1: Read the current ProjectDetail.tsx to understand its structure**

Read the file to find where the existing EnvironmentTab is used and replace/augment it with ProjectEnvSelector.

- [ ] **Step 2: Add ProjectEnvSelector import and render**

Add at the top:

```typescript
import { ProjectEnvSelector } from "../environment/ProjectEnvSelector";
```

Find where `EnvironmentTab` is rendered (in the tabs section). Add `ProjectEnvSelector` as a section within the environment tab area, or as a separate section in the project detail. Place it before or alongside the existing env tab:

The `ProjectEnvSelector` should be added to the project detail view, in the section where environment configuration is managed. The exact placement depends on the current layout of `ProjectDetail.tsx`, but it should appear as a panel/section where users can select which global profile vars to use.

If the environment tab exists, replace its content with ProjectEnvSelector:

```tsx
{activeTab === "environment" && (
  <ProjectEnvSelector project={project} />
)}
```

- [ ] **Step 3: Verify frontend builds**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/.worktrees/devcontainer && npx tsc --noEmit 2>&1 | tail -10`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/components/containers/ProjectDetail.tsx
git commit -m "feat(ui): integrate ProjectEnvSelector into project detail view"
```

---

## Task 14: Full Integration Test

- [ ] **Step 1: Verify Rust backend compiles**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/.worktrees/devcontainer && cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -10`
Expected: compilation succeeds

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/.worktrees/devcontainer && npx tsc --noEmit 2>&1 | tail -10`
Expected: no errors

- [ ] **Step 3: Verify dev server starts**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/.worktrees/devcontainer && npm run build 2>&1 | tail -10`
Expected: build succeeds

- [ ] **Step 4: Fix any compilation issues found**

Address errors and commit fixes.

- [ ] **Step 5: Final commit**

```bash
git add -A
git commit -m "fix: resolve compilation issues from env management integration"
```

---

## Summary of Changes

| Area | What Changed | Why |
|------|-------------|-----|
| `cli/types.rs` | Added `GlobalEnvVar`, `EnvProfile`, `EnvStoreConfig`, `ProjectEnvBinding` | Data model for global env store |
| `commands/env_store.rs` | New module: profile CRUD, env var CRUD, dotenv import, infisical sync | Backend API for global env management |
| `commands/project.rs` | Added `resolve_project_env()`, modified `compose_up`, `dockerfile_up`, `devcontainer_project_up` | Inject global env vars into CLI commands |
| `lib.rs` | Registered 13 new IPC commands | Expose env store to frontend |
| `types/index.ts` | Added `GlobalEnvVar`, `EnvProfile`, `ProjectEnvBinding` interfaces | Frontend type definitions |
| `lib/tauri.ts` | Added 13 new API bindings | Frontend-to-backend communication |
| `hooks/useEnvStore.ts` | New file: 13 React Query hooks | State management for env store |
| `components/environment/*` | 6 new components | Environment management UI |
| `layout/Sidebar.tsx` | Added "Environment" nav button | Navigation entry point |
| `layout/MainLayout.tsx` | Added EnvironmentPage routing | Page rendering |
| `containers/ProjectDetail.tsx` | Integrated ProjectEnvSelector | Per-project env binding |
