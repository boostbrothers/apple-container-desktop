# Environment Variables & Secrets Management — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add multi-profile environment variable management with Docker Compose secrets injection and Infisical CLI integration to Colima Desktop.

**Architecture:** Extend existing `EnvVarEntry` and `Project` types with `secret`, `profile` fields and new `InfisicalConfig` struct. New Rust module `commands/env_secrets.rs` handles profile CRUD, Infisical sync, and Compose secrets file generation. Frontend gets a new `EnvironmentTab` component and profile dropdown on `ProjectCard`. `compose_up` is modified to use generated `docker-compose.override.yml` for secrets injection.

**Tech Stack:** Rust (Tauri 2 commands), React 19, TypeScript, TanStack React Query, shadcn/ui, Infisical CLI, Docker Compose secrets

**Spec:** `docs/superpowers/specs/2026-04-09-env-secrets-design.md`

---

## File Map

### New Files
| File | Responsibility |
|------|---------------|
| `src-tauri/src/commands/env_secrets.rs` | Profile CRUD, env var CRUD, Infisical CLI integration, Compose secrets preparation |
| `src/components/env/EnvironmentTab.tsx` | Main environment tab container with profile selector, env table, Infisical config |
| `src/components/env/ProfileSelector.tsx` | Profile dropdown, create/delete profile |
| `src/components/env/EnvVarTable.tsx` | Environment variable table with inline edit, secret masking |
| `src/components/env/InfisicalConfig.tsx` | Infisical connection settings UI |
| `src/hooks/useEnvSecrets.ts` | React Query hooks for env/secrets/profile/infisical operations |

### Modified Files
| File | Changes |
|------|---------|
| `src-tauri/src/cli/types.rs:357-446` | Add `secret`, `profile` to `EnvVarEntry`; add `active_profile`, `profiles`, `infisical_config` to `Project`/`ProjectWithStatus`; add `InfisicalConfig` struct |
| `src-tauri/src/commands/mod.rs:1-14` | Add `pub mod env_secrets;` |
| `src-tauri/src/lib.rs:12-72` | Register new commands in `generate_handler!` |
| `src-tauri/src/commands/project.rs:340-356` | Update `add_project` defaults for new fields |
| `src-tauri/src/commands/project.rs:432-503` | Update `collect_env_args` to filter by `active_profile` |
| `src-tauri/src/commands/project.rs:505-518` | Update `project_up` to run Infisical sync + secrets prep |
| `src-tauri/src/commands/project.rs:520-612` | Update `compose_up` to use override file for secrets |
| `src/types/index.ts:163-189` | Add fields to `EnvVarEntry`, `Project`; add `InfisicalConfig` interface |
| `src/lib/tauri.ts:59-97` | Add new API methods |
| `src/hooks/useProjects.ts` | No changes (existing hooks still work due to backward-compatible type extension) |
| `src/components/containers/ProjectCard.tsx:114-221` | Add profile dropdown badge |
| `src/components/containers/ProjectDetail.tsx:413-557` | Replace inline env var section with `EnvironmentTab` |

---

## Task 1: Extend Rust Types

**Files:**
- Modify: `src-tauri/src/cli/types.rs:357-446`

- [ ] **Step 1: Add `secret` and `profile` to `EnvVarEntry`**

In `src-tauri/src/cli/types.rs`, replace lines 357-362:

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EnvVarEntry {
    pub key: String,
    pub value: String,
    pub source: String, // "manual" | "dotenv" | "api"
}
```

With:

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EnvVarEntry {
    pub key: String,
    pub value: String,
    pub source: String, // "manual" | "dotenv" | "command" | "api" | "infisical"
    #[serde(default)]
    pub secret: bool,
    #[serde(default = "default_profile")]
    pub profile: String,
}

fn default_profile() -> String {
    "default".to_string()
}
```

- [ ] **Step 2: Add `InfisicalConfig` struct**

After the `default_profile` function, add:

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InfisicalConfig {
    pub project_id: String,
    pub environment: String,
    #[serde(default = "default_secret_path")]
    pub secret_path: String,
    #[serde(default)]
    pub auto_sync: bool,
    #[serde(default)]
    pub profile_mapping: std::collections::HashMap<String, String>,
}

fn default_secret_path() -> String {
    "/".to_string()
}
```

- [ ] **Step 3: Add new fields to `Project` struct**

In the `Project` struct (lines 364-392), add after the `startup_command` field (line 391):

```rust
    #[serde(default = "default_profile")]
    pub active_profile: String,
    #[serde(default = "default_profiles")]
    pub profiles: Vec<String>,
    #[serde(default)]
    pub infisical_config: Option<InfisicalConfig>,
```

And add the default function:

```rust
fn default_profiles() -> Vec<String> {
    vec!["default".to_string()]
}
```

- [ ] **Step 4: Update `ProjectWithStatus` to match**

In the `ProjectWithStatus` struct (lines 398-417), add after `startup_command`:

```rust
    pub active_profile: String,
    pub profiles: Vec<String>,
    pub infisical_config: Option<InfisicalConfig>,
```

- [ ] **Step 5: Update `Project::with_status` method**

In `impl Project` (lines 419-441), add the new fields to the `with_status` method body:

```rust
            startup_command: self.startup_command,
            active_profile: self.active_profile,
            profiles: self.profiles,
            infisical_config: self.infisical_config,
            status,
            container_ids,
```

- [ ] **Step 6: Verify it compiles**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/.worktrees/devcontainer && cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | head -30`

Expected: Compilation errors in `project.rs` (missing new fields in `add_project`). This is expected and will be fixed in Task 2.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/cli/types.rs
git commit -m "feat(types): extend EnvVarEntry and Project with profile, secret, infisical fields"
```

---

## Task 2: Update `project.rs` for New Fields

**Files:**
- Modify: `src-tauri/src/commands/project.rs:322-362` (add_project)
- Modify: `src-tauri/src/commands/project.rs:432-503` (collect_env_args)
- Modify: `src-tauri/src/commands/project.rs:505-518` (project_up)
- Modify: `src-tauri/src/commands/project.rs:520-612` (compose_up)

- [ ] **Step 1: Update `add_project` default values**

In `src-tauri/src/commands/project.rs`, find the `Project` construction in `add_project` (around line 340-356). Replace:

```rust
    let project = Project {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        workspace_path,
        project_type,
        env_vars: Vec::new(),
        dotenv_path: None,
        watch_mode: false,
        remote_debug: false,
        debug_port: 9229,
        compose_file,
        dockerfile,
        service_name: None,
        env_command: None,
        ports: Vec::new(),
        startup_command: None,
    };
```

With:

```rust
    let project = Project {
        id: uuid::Uuid::new_v4().to_string(),
        name,
        workspace_path,
        project_type,
        env_vars: Vec::new(),
        dotenv_path: None,
        watch_mode: false,
        remote_debug: false,
        debug_port: 9229,
        compose_file,
        dockerfile,
        service_name: None,
        env_command: None,
        ports: Vec::new(),
        startup_command: None,
        active_profile: "default".to_string(),
        profiles: vec!["default".to_string()],
        infisical_config: None,
    };
```

- [ ] **Step 2: Update `collect_env_args` to filter by active profile**

In `collect_env_args` (line 432), replace the manual env vars section (lines 496-500):

```rust
    // Add manual env vars (these override dotenv and command)
    for var in &project.env_vars {
        env_args.push("-e".to_string());
        env_args.push(format!("{}={}", var.key, var.value));
    }
```

With:

```rust
    // Add manual env vars for active profile (these override dotenv and command)
    for var in &project.env_vars {
        if var.profile == project.active_profile && !var.secret {
            env_args.push("-e".to_string());
            env_args.push(format!("{}={}", var.key, var.value));
        }
    }
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/.worktrees/devcontainer && cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | head -30`

Expected: Success (or warnings only)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/project.rs
git commit -m "feat(project): add profile/secret defaults and filter env vars by active profile"
```

---

## Task 3: Create `env_secrets.rs` — Profile & Env Var CRUD

**Files:**
- Create: `src-tauri/src/commands/env_secrets.rs`
- Modify: `src-tauri/src/commands/mod.rs`

- [ ] **Step 1: Create `env_secrets.rs` with profile management commands**

Create `src-tauri/src/commands/env_secrets.rs`:

```rust
use crate::cli::types::{EnvVarEntry, InfisicalConfig, Project, ProjectWithStatus};
use crate::commands::project::{load_projects, save_projects, find_project, get_project_status};

// ── Profile Management ──

#[tauri::command]
pub async fn create_profile(project_id: String, profile_name: String) -> Result<ProjectWithStatus, String> {
    let mut projects = load_projects()?;
    let project = projects.iter_mut().find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    let name = profile_name.trim().to_lowercase();
    if name.is_empty() {
        return Err("Profile name cannot be empty".to_string());
    }
    if project.profiles.contains(&name) {
        return Err(format!("Profile '{}' already exists", name));
    }

    project.profiles.push(name);
    let result = project.clone();
    save_projects(&projects)?;
    Ok(get_project_status(result).await)
}

#[tauri::command]
pub async fn delete_profile(project_id: String, profile_name: String) -> Result<ProjectWithStatus, String> {
    if profile_name == "default" {
        return Err("Cannot delete the default profile".to_string());
    }

    let mut projects = load_projects()?;
    let project = projects.iter_mut().find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    project.profiles.retain(|p| p != &profile_name);
    project.env_vars.retain(|v| v.profile != profile_name);
    if project.active_profile == profile_name {
        project.active_profile = "default".to_string();
    }

    let result = project.clone();
    save_projects(&projects)?;
    Ok(get_project_status(result).await)
}

#[tauri::command]
pub async fn switch_profile(project_id: String, profile_name: String) -> Result<ProjectWithStatus, String> {
    let mut projects = load_projects()?;
    let project = projects.iter_mut().find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    if !project.profiles.contains(&profile_name) {
        return Err(format!("Profile '{}' does not exist", profile_name));
    }

    project.active_profile = profile_name;
    let result = project.clone();
    save_projects(&projects)?;
    Ok(get_project_status(result).await)
}

// ── Env Var CRUD ──

#[tauri::command]
pub async fn set_env_var(project_id: String, entry: EnvVarEntry) -> Result<ProjectWithStatus, String> {
    let mut projects = load_projects()?;
    let project = projects.iter_mut().find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    // Upsert: replace if same key+profile exists
    if let Some(existing) = project.env_vars.iter_mut().find(|v| v.key == entry.key && v.profile == entry.profile) {
        *existing = entry;
    } else {
        project.env_vars.push(entry);
    }

    let result = project.clone();
    save_projects(&projects)?;
    Ok(get_project_status(result).await)
}

#[tauri::command]
pub async fn remove_env_var(project_id: String, key: String, profile: String) -> Result<ProjectWithStatus, String> {
    let mut projects = load_projects()?;
    let project = projects.iter_mut().find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    project.env_vars.retain(|v| !(v.key == key && v.profile == profile));

    let result = project.clone();
    save_projects(&projects)?;
    Ok(get_project_status(result).await)
}

#[tauri::command]
pub async fn bulk_import_env(
    project_id: String,
    profile: String,
    entries: Vec<EnvVarEntry>,
) -> Result<ProjectWithStatus, String> {
    let mut projects = load_projects()?;
    let project = projects.iter_mut().find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    for entry in entries {
        let e = EnvVarEntry {
            profile: profile.clone(),
            ..entry
        };
        if let Some(existing) = project.env_vars.iter_mut().find(|v| v.key == e.key && v.profile == e.profile) {
            *existing = e;
        } else {
            project.env_vars.push(e);
        }
    }

    let result = project.clone();
    save_projects(&projects)?;
    Ok(get_project_status(result).await)
}

// ── .env Import/Export for Profile ──

#[tauri::command]
pub async fn load_dotenv_for_profile(
    project_id: String,
    file_path: String,
    profile: String,
) -> Result<ProjectWithStatus, String> {
    let content = std::fs::read_to_string(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let mut new_entries = Vec::new();
    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some(eq_pos) = line.find('=') {
            let key = line[..eq_pos].trim().to_string();
            let mut value = line[eq_pos + 1..].trim().to_string();
            if (value.starts_with('"') && value.ends_with('"'))
                || (value.starts_with('\'') && value.ends_with('\''))
            {
                value = value[1..value.len() - 1].to_string();
            }
            new_entries.push(EnvVarEntry {
                key,
                value,
                source: "dotenv".to_string(),
                secret: false,
                profile: profile.clone(),
            });
        }
    }

    let mut projects = load_projects()?;
    let project = projects.iter_mut().find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    // Remove old dotenv entries for this profile, keep manual/command/infisical
    project.env_vars.retain(|v| !(v.profile == profile && v.source == "dotenv"));
    project.env_vars.extend(new_entries);

    let result = project.clone();
    save_projects(&projects)?;
    Ok(get_project_status(result).await)
}

#[tauri::command]
pub async fn export_profile_to_dotenv(
    project_id: String,
    profile: String,
    file_path: String,
) -> Result<(), String> {
    let projects = load_projects()?;
    let project = find_project(&projects, &project_id)?;

    let lines: Vec<String> = project.env_vars.iter()
        .filter(|v| v.profile == profile)
        .map(|v| format!("{}={}", v.key, v.value))
        .collect();

    std::fs::write(&file_path, lines.join("\n"))
        .map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}
```

- [ ] **Step 2: Register module in `mod.rs`**

In `src-tauri/src/commands/mod.rs`, add after line 4 (`pub mod project;`):

```rust
pub mod env_secrets;
```

- [ ] **Step 3: Make `load_projects`, `save_projects`, `find_project` public in `project.rs`**

In `src-tauri/src/commands/project.rs`, change the visibility of these functions:

- Line 111: `fn load_projects()` → `pub fn load_projects()`
- Line 124: `fn save_projects(` → `pub fn save_projects(`
- Line 135: `fn find_project(` → `pub fn find_project(`

Also add a public helper for getting project status. Add after `find_project`:

```rust
pub async fn get_project_status(project: Project) -> ProjectWithStatus {
    let status = match project.project_type.as_str() {
        "compose" => get_compose_status(&project).await,
        "dockerfile" => get_dockerfile_status(&project).await,
        "devcontainer" => get_devcontainer_status(&project).await,
        _ => ("unknown".to_string(), vec![]),
    };
    project.with_status(status.0, status.1)
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/.worktrees/devcontainer && cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | head -30`

Expected: Success

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/env_secrets.rs src-tauri/src/commands/mod.rs src-tauri/src/commands/project.rs
git commit -m "feat(env_secrets): add profile CRUD, env var CRUD, dotenv import/export commands"
```

---

## Task 4: Add Infisical CLI Integration to `env_secrets.rs`

**Files:**
- Modify: `src-tauri/src/commands/env_secrets.rs`

- [ ] **Step 1: Add Infisical commands**

Append to `src-tauri/src/commands/env_secrets.rs`:

```rust
use crate::cli::executor::docker_host;
use tokio::process::Command;

// ── Infisical Integration ──

#[tauri::command]
pub async fn check_infisical_installed() -> Result<bool, String> {
    match Command::new("infisical").arg("--version").output().await {
        Ok(output) => Ok(output.status.success()),
        Err(_) => Ok(false),
    }
}

#[tauri::command]
pub async fn configure_infisical(
    project_id: String,
    config: InfisicalConfig,
) -> Result<ProjectWithStatus, String> {
    let mut projects = load_projects()?;
    let project = projects.iter_mut().find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    project.infisical_config = Some(config);
    let result = project.clone();
    save_projects(&projects)?;
    Ok(get_project_status(result).await)
}

#[tauri::command]
pub async fn sync_infisical(project_id: String) -> Result<Vec<EnvVarEntry>, String> {
    let mut projects = load_projects()?;
    let project = projects.iter_mut().find(|p| p.id == project_id)
        .ok_or("Project not found")?;

    let config = project.infisical_config.as_ref()
        .ok_or("Infisical not configured for this project")?;

    // Determine which infisical environment to use based on profile mapping
    let infisical_env = config.profile_mapping
        .get(&project.active_profile)
        .cloned()
        .unwrap_or_else(|| config.environment.clone());

    let output = Command::new("infisical")
        .args([
            "export",
            "--projectId", &config.project_id,
            "--env", &infisical_env,
            "--path", &config.secret_path,
            "--format", "dotenv",
        ])
        .current_dir(&project.workspace_path)
        .output()
        .await
        .map_err(|e| format!("Failed to run infisical: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("infisical export failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut new_entries = Vec::new();

    for line in stdout.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        if let Some(eq_pos) = line.find('=') {
            let key = line[..eq_pos].trim().to_string();
            let mut value = line[eq_pos + 1..].trim().to_string();
            if (value.starts_with('"') && value.ends_with('"'))
                || (value.starts_with('\'') && value.ends_with('\''))
            {
                value = value[1..value.len() - 1].to_string();
            }
            if !key.is_empty() {
                new_entries.push(EnvVarEntry {
                    key,
                    value,
                    source: "infisical".to_string(),
                    secret: true,
                    profile: project.active_profile.clone(),
                });
            }
        }
    }

    // Replace old infisical entries for this profile
    let profile = project.active_profile.clone();
    project.env_vars.retain(|v| !(v.profile == profile && v.source == "infisical"));
    project.env_vars.extend(new_entries.clone());

    save_projects(&projects)?;
    Ok(new_entries)
}

#[tauri::command]
pub async fn test_infisical_connection(project_id: String) -> Result<bool, String> {
    // Reuse sync logic but just check if it succeeds
    let projects = load_projects()?;
    let project = find_project(&projects, &project_id)?;

    let config = project.infisical_config.as_ref()
        .ok_or("Infisical not configured for this project")?;

    let infisical_env = config.profile_mapping
        .get(&project.active_profile)
        .cloned()
        .unwrap_or_else(|| config.environment.clone());

    let output = Command::new("infisical")
        .args([
            "export",
            "--projectId", &config.project_id,
            "--env", &infisical_env,
            "--path", &config.secret_path,
            "--format", "dotenv",
        ])
        .current_dir(&project.workspace_path)
        .output()
        .await
        .map_err(|e| format!("Failed to run infisical: {}", e))?;

    Ok(output.status.success())
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/.worktrees/devcontainer && cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | head -30`

Expected: Success

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands/env_secrets.rs
git commit -m "feat(infisical): add CLI integration commands (sync, test, configure)"
```

---

## Task 5: Add Compose Secrets Preparation to `env_secrets.rs`

**Files:**
- Modify: `src-tauri/src/commands/env_secrets.rs`

- [ ] **Step 1: Add `prepare_secrets_for_compose` function**

Append to `src-tauri/src/commands/env_secrets.rs`:

```rust
// ── Compose Secrets Preparation ──

/// Generate .secrets/ files and docker-compose.override.yml for the active profile.
/// Called internally before compose_up.
pub fn prepare_secrets_for_compose(project: &Project) -> Result<Option<String>, String> {
    let secrets: Vec<&EnvVarEntry> = project.env_vars.iter()
        .filter(|v| v.profile == project.active_profile && v.secret)
        .collect();

    let env_vars: Vec<&EnvVarEntry> = project.env_vars.iter()
        .filter(|v| v.profile == project.active_profile && !v.secret)
        .collect();

    if secrets.is_empty() && env_vars.is_empty() {
        return Ok(None);
    }

    let workspace = std::path::Path::new(&project.workspace_path);

    // Create .secrets directory
    if !secrets.is_empty() {
        let secrets_dir = workspace.join(".secrets");
        std::fs::create_dir_all(&secrets_dir)
            .map_err(|e| format!("Failed to create .secrets dir: {}", e))?;

        // Write each secret to its own file
        for s in &secrets {
            let file_path = secrets_dir.join(&s.key);
            std::fs::write(&file_path, &s.value)
                .map_err(|e| format!("Failed to write secret {}: {}", s.key, e))?;
        }

        // Ensure .secrets/ is in .gitignore
        let gitignore_path = workspace.join(".gitignore");
        let needs_entry = if gitignore_path.exists() {
            let content = std::fs::read_to_string(&gitignore_path).unwrap_or_default();
            !content.lines().any(|l| l.trim() == ".secrets/" || l.trim() == ".secrets")
        } else {
            true
        };
        if needs_entry {
            let mut file = std::fs::OpenOptions::new()
                .create(true)
                .append(true)
                .open(&gitignore_path)
                .map_err(|e| format!("Failed to open .gitignore: {}", e))?;
            use std::io::Write;
            writeln!(file, "\n# Colima Desktop secrets\n.secrets/")
                .map_err(|e| format!("Failed to write .gitignore: {}", e))?;
        }
    }

    // Generate docker-compose.override.yml
    let override_path = workspace.join("docker-compose.override.yml");
    let service_name = project.service_name.as_deref().unwrap_or("app");

    let mut yaml = String::new();
    yaml.push_str("# Auto-generated by Colima Desktop — do not edit manually\n");
    yaml.push_str("services:\n");
    yaml.push_str(&format!("  {}:\n", service_name));

    if !secrets.is_empty() {
        yaml.push_str("    secrets:\n");
        for s in &secrets {
            yaml.push_str(&format!("      - {}\n", s.key));
        }
    }

    if !env_vars.is_empty() {
        yaml.push_str("    environment:\n");
        for v in &env_vars {
            yaml.push_str(&format!("      - {}={}\n", v.key, v.value));
        }
    }

    if !secrets.is_empty() {
        yaml.push_str("secrets:\n");
        for s in &secrets {
            yaml.push_str(&format!("  {}:\n", s.key));
            yaml.push_str(&format!("    file: ./.secrets/{}\n", s.key));
        }
    }

    std::fs::write(&override_path, &yaml)
        .map_err(|e| format!("Failed to write override file: {}", e))?;

    Ok(Some(override_path.to_string_lossy().to_string()))
}
```

- [ ] **Step 2: Verify it compiles**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/.worktrees/devcontainer && cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | head -30`

Expected: Success

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/commands/env_secrets.rs
git commit -m "feat(secrets): add Compose secrets file generation (override.yml + .secrets/)"
```

---

## Task 6: Integrate Secrets into `project_up` / `compose_up`

**Files:**
- Modify: `src-tauri/src/commands/project.rs:505-612`

- [ ] **Step 1: Update `project_up` to sync Infisical and prepare secrets**

In `src-tauri/src/commands/project.rs`, replace `project_up` (lines 505-518):

```rust
#[tauri::command]
pub async fn project_up(app: AppHandle, id: String) -> Result<(), String> {
    let projects = load_projects()?;
    let project = find_project(&projects, &id)?;

    let event_name = format!("docker-project-log-{}", project.id);

    match project.project_type.as_str() {
        "compose" => compose_up(&app, &project, &event_name).await,
        "dockerfile" => dockerfile_up(&app, &project, &event_name).await,
        "devcontainer" => devcontainer_project_up(&app, &project, &event_name).await,
        _ => Err(format!("Unknown project type: {}", project.project_type)),
    }
}
```

With:

```rust
#[tauri::command]
pub async fn project_up(app: AppHandle, id: String) -> Result<(), String> {
    let mut projects = load_projects()?;
    let project = projects.iter_mut().find(|p| p.id == id)
        .ok_or("Project not found")?.clone();

    let event_name = format!("docker-project-log-{}", project.id);

    // Auto-sync Infisical if configured
    if let Some(ref config) = project.infisical_config {
        if config.auto_sync {
            let _ = app.emit(&event_name, "Syncing secrets from Infisical...");
            match crate::commands::env_secrets::sync_infisical(id.clone()).await {
                Ok(entries) => {
                    let _ = app.emit(&event_name, format!("Synced {} secrets from Infisical", entries.len()));
                    // Reload project after sync updated it
                    let projects = load_projects()?;
                    let project = find_project(&projects, &id)?;
                    return run_project_up(&app, &project, &event_name).await;
                }
                Err(e) => {
                    let _ = app.emit(&event_name, format!("Infisical sync warning: {}", e));
                    // Continue with existing values
                }
            }
        }
    }

    run_project_up(&app, &project, &event_name).await
}

async fn run_project_up(app: &AppHandle, project: &Project, event_name: &str) -> Result<(), String> {
    match project.project_type.as_str() {
        "compose" => compose_up(app, project, event_name).await,
        "dockerfile" => dockerfile_up(app, project, event_name).await,
        "devcontainer" => devcontainer_project_up(app, project, event_name).await,
        _ => Err(format!("Unknown project type: {}", project.project_type)),
    }
}
```

- [ ] **Step 2: Update `compose_up` to use override file for secrets**

In `compose_up` (around lines 536-574), replace the env file and collect_env_args section. Find:

```rust
    // Add env file if specified
    if let Some(ref dotenv_path) = project.dotenv_path {
```

And replace everything from that line through the `_temp_env_file` block (up to line 574) with:

```rust
    // Prepare secrets and override file
    let has_override = match crate::commands::env_secrets::prepare_secrets_for_compose(project) {
        Ok(Some(_path)) => {
            args.extend(["-f".to_string(), "docker-compose.override.yml".to_string()]);
            true
        }
        Ok(None) => false,
        Err(e) => {
            let _ = app.emit(event_name, format!("Warning: secrets prep failed: {}", e));
            false
        }
    };

    // Add env file if specified (and no override handles env vars)
    if !has_override {
        if let Some(ref dotenv_path) = project.dotenv_path {
            let full_path = if std::path::Path::new(dotenv_path).is_absolute() {
                dotenv_path.clone()
            } else {
                format!("{}/{}", project.workspace_path, dotenv_path)
            };
            if std::path::Path::new(&full_path).exists() {
                args.extend(["--env-file".to_string(), full_path]);
            }
        }

        // Collect env vars (from env_command + manual) into a temp env file for compose
        let collected = collect_env_args(project, app, event_name).await?;
        let _temp_env_file = if !collected.is_empty() {
            let mut lines = Vec::new();
            let mut iter = collected.iter();
            while let Some(flag) = iter.next() {
                if flag == "-e" {
                    if let Some(kv) = iter.next() {
                        lines.push(kv.clone());
                    }
                }
            }
            if !lines.is_empty() {
                let temp_dir = tempfile::tempdir()
                    .map_err(|e| format!("Failed to create temp dir: {}", e))?;
                let temp_path = temp_dir.path().join(".env.colima-project");
                std::fs::write(&temp_path, lines.join("\n"))
                    .map_err(|e| format!("Failed to write temp env file: {}", e))?;
                args.extend(["--env-file".to_string(), temp_path.to_string_lossy().to_string()]);
                Some(temp_dir)
            } else {
                None
            }
        } else {
            None
        };
    }
```

- [ ] **Step 3: Verify it compiles**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/.worktrees/devcontainer && cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | head -30`

Expected: Success

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/project.rs
git commit -m "feat(compose): integrate secrets prep and Infisical auto-sync into project_up"
```

---

## Task 7: Register All New Commands in `lib.rs`

**Files:**
- Modify: `src-tauri/src/lib.rs:12-72`

- [ ] **Step 1: Add new commands to `generate_handler!`**

In `src-tauri/src/lib.rs`, add before the closing `]` of `generate_handler!` (before line 72):

```rust
            commands::env_secrets::create_profile,
            commands::env_secrets::delete_profile,
            commands::env_secrets::switch_profile,
            commands::env_secrets::set_env_var,
            commands::env_secrets::remove_env_var,
            commands::env_secrets::bulk_import_env,
            commands::env_secrets::load_dotenv_for_profile,
            commands::env_secrets::export_profile_to_dotenv,
            commands::env_secrets::check_infisical_installed,
            commands::env_secrets::configure_infisical,
            commands::env_secrets::sync_infisical,
            commands::env_secrets::test_infisical_connection,
```

- [ ] **Step 2: Verify full build**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/.worktrees/devcontainer && cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | head -30`

Expected: Success

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/lib.rs
git commit -m "feat(lib): register env_secrets commands in Tauri handler"
```

---

## Task 8: Extend Frontend Types

**Files:**
- Modify: `src/types/index.ts:163-189`

- [ ] **Step 1: Update `EnvVarEntry` interface**

In `src/types/index.ts`, replace lines 163-167:

```typescript
export interface EnvVarEntry {
  key: string;
  value: string;
  source: "manual" | "dotenv" | "command" | "api";
}
```

With:

```typescript
export interface EnvVarEntry {
  key: string;
  value: string;
  source: "manual" | "dotenv" | "command" | "api" | "infisical";
  secret: boolean;
  profile: string;
}
```

- [ ] **Step 2: Add `InfisicalConfig` interface**

After `EnvVarEntry`, add:

```typescript
export interface InfisicalConfig {
  project_id: string;
  environment: string;
  secret_path: string;
  auto_sync: boolean;
  profile_mapping: Record<string, string>;
}
```

- [ ] **Step 3: Update `Project` interface**

In the `Project` interface (lines 171-189), add after `startup_command`:

```typescript
  active_profile: string;
  profiles: string[];
  infisical_config: InfisicalConfig | null;
```

- [ ] **Step 4: Verify frontend builds**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/.worktrees/devcontainer && npx tsc --noEmit 2>&1 | head -30`

Expected: Type errors in `ProjectDetail.tsx` where `EnvVarEntry` is constructed without new fields. These will be fixed in Task 11.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(types): extend EnvVarEntry and Project with profile, secret, infisical fields"
```

---

## Task 9: Add Frontend API Methods

**Files:**
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Add import for `InfisicalConfig`**

In `src/lib/tauri.ts` line 2, add `InfisicalConfig` to the type import:

```typescript
import type { Container, Image, ColimaStatus, VmSettings, HostInfo, Volume, Network, MountSettings, MountEntry, NetworkSettings, DnsHostEntry, DockerDaemonSettings, ContainerDetail, ContainerStats, ColimaVersion, VersionCheck, ColimaInstallCheck, Project, ProjectTypeDetection, EnvVarEntry, AppSettings, DevcontainerConfigResponse, DevcontainerValidationError, InfisicalConfig } from "../types";
```

- [ ] **Step 2: Add new API methods**

In `src/lib/tauri.ts`, add before the `// DevContainer Config` comment (before line 90):

```typescript
  // Environment & Secrets
  createProfile: (projectId: string, profileName: string) =>
    invoke<Project>("create_profile", { projectId, profileName }),
  deleteProfile: (projectId: string, profileName: string) =>
    invoke<Project>("delete_profile", { projectId, profileName }),
  switchProfile: (projectId: string, profileName: string) =>
    invoke<Project>("switch_profile", { projectId, profileName }),
  setEnvVar: (projectId: string, entry: EnvVarEntry) =>
    invoke<Project>("set_env_var", { projectId, entry }),
  removeEnvVar: (projectId: string, key: string, profile: string) =>
    invoke<Project>("remove_env_var", { projectId, key, profile }),
  bulkImportEnv: (projectId: string, profile: string, entries: EnvVarEntry[]) =>
    invoke<Project>("bulk_import_env", { projectId, profile, entries }),
  loadDotenvForProfile: (projectId: string, filePath: string, profile: string) =>
    invoke<Project>("load_dotenv_for_profile", { projectId, filePath, profile }),
  exportProfileToDotenv: (projectId: string, profile: string, filePath: string) =>
    invoke<void>("export_profile_to_dotenv", { projectId, profile, filePath }),
  checkInfisicalInstalled: () =>
    invoke<boolean>("check_infisical_installed"),
  configureInfisical: (projectId: string, config: InfisicalConfig) =>
    invoke<Project>("configure_infisical", { projectId, config }),
  syncInfisical: (projectId: string) =>
    invoke<EnvVarEntry[]>("sync_infisical", { projectId }),
  testInfisicalConnection: (projectId: string) =>
    invoke<boolean>("test_infisical_connection", { projectId }),
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/tauri.ts
git commit -m "feat(api): add env secrets, profile, and infisical API methods"
```

---

## Task 10: Create React Query Hooks

**Files:**
- Create: `src/hooks/useEnvSecrets.ts`

- [ ] **Step 1: Create hooks file**

Create `src/hooks/useEnvSecrets.ts`:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";
import type { EnvVarEntry, InfisicalConfig } from "../types";

// ── Profile Management ──

export function useCreateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, profileName }: { projectId: string; profileName: string }) =>
      api.createProfile(projectId, profileName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useDeleteProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, profileName }: { projectId: string; profileName: string }) =>
      api.deleteProfile(projectId, profileName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useSwitchProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, profileName }: { projectId: string; profileName: string }) =>
      api.switchProfile(projectId, profileName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

// ── Env Var CRUD ──

export function useSetEnvVar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, entry }: { projectId: string; entry: EnvVarEntry }) =>
      api.setEnvVar(projectId, entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useRemoveEnvVar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, key, profile }: { projectId: string; key: string; profile: string }) =>
      api.removeEnvVar(projectId, key, profile),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useBulkImportEnv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, profile, entries }: { projectId: string; profile: string; entries: EnvVarEntry[] }) =>
      api.bulkImportEnv(projectId, profile, entries),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

// ── Dotenv Import/Export ──

export function useLoadDotenvForProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, filePath, profile }: { projectId: string; filePath: string; profile: string }) =>
      api.loadDotenvForProfile(projectId, filePath, profile),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useExportProfileToDotenv() {
  return useMutation({
    mutationFn: ({ projectId, profile, filePath }: { projectId: string; profile: string; filePath: string }) =>
      api.exportProfileToDotenv(projectId, profile, filePath),
  });
}

// ── Infisical ──

export function useCheckInfisicalInstalled() {
  return useQuery({
    queryKey: ["infisical-installed"],
    queryFn: api.checkInfisicalInstalled,
    staleTime: 60_000,
  });
}

export function useConfigureInfisical() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, config }: { projectId: string; config: InfisicalConfig }) =>
      api.configureInfisical(projectId, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useSyncInfisical() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => api.syncInfisical(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useTestInfisicalConnection() {
  return useMutation({
    mutationFn: (projectId: string) => api.testInfisicalConnection(projectId),
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useEnvSecrets.ts
git commit -m "feat(hooks): add React Query hooks for env secrets, profiles, infisical"
```

---

## Task 11: Create `ProfileSelector` Component

**Files:**
- Create: `src/components/env/ProfileSelector.tsx`

- [ ] **Step 1: Create the component**

First create the directory:

```bash
mkdir -p src/components/env
```

Create `src/components/env/ProfileSelector.tsx`:

```typescript
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { useCreateProfile, useDeleteProfile, useSwitchProfile } from "../../hooks/useEnvSecrets";

interface ProfileSelectorProps {
  projectId: string;
  activeProfile: string;
  profiles: string[];
}

export function ProfileSelector({ projectId, activeProfile, profiles }: ProfileSelectorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [open, setOpen] = useState(false);
  const createProfile = useCreateProfile();
  const deleteProfile = useDeleteProfile();
  const switchProfile = useSwitchProfile();

  const handleCreate = () => {
    if (!newName.trim()) return;
    createProfile.mutate(
      { projectId, profileName: newName.trim() },
      {
        onSuccess: () => {
          setNewName("");
          setIsAdding(false);
        },
      }
    );
  };

  const handleSwitch = (name: string) => {
    if (name === activeProfile) return;
    switchProfile.mutate({ projectId, profileName: name });
    setOpen(false);
  };

  const handleDelete = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteProfile.mutate({ projectId, profileName: name });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Profile:</span>
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs min-w-[100px] justify-between"
          onClick={() => setOpen(!open)}
        >
          {activeProfile}
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
        {open && (
          <div className="absolute top-full left-0 mt-1 z-50 w-48 rounded-md border bg-popover p-1 shadow-md">
            {profiles.map((p) => (
              <div
                key={p}
                className={`flex items-center justify-between rounded-sm px-2 py-1.5 text-xs cursor-pointer hover:bg-accent ${
                  p === activeProfile ? "bg-accent" : ""
                }`}
                onClick={() => handleSwitch(p)}
              >
                <span>{p}</span>
                {p !== "default" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={(e) => handleDelete(p, e)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
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
git add src/components/env/ProfileSelector.tsx
git commit -m "feat(ui): add ProfileSelector component with create/delete/switch"
```

---

## Task 12: Create `EnvVarTable` Component

**Files:**
- Create: `src/components/env/EnvVarTable.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/env/EnvVarTable.tsx`:

```typescript
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Eye, EyeOff, Lock } from "lucide-react";
import type { EnvVarEntry } from "../../types";
import { useSetEnvVar, useRemoveEnvVar } from "../../hooks/useEnvSecrets";

interface EnvVarTableProps {
  projectId: string;
  envVars: EnvVarEntry[];
  activeProfile: string;
}

export function EnvVarTable({ projectId, envVars, activeProfile }: EnvVarTableProps) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newSecret, setNewSecret] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const setEnvVar = useSetEnvVar();
  const removeEnvVar = useRemoveEnvVar();

  const profileVars = envVars
    .filter((v) => v.profile === activeProfile)
    .sort((a, b) => a.key.localeCompare(b.key));

  const handleAdd = () => {
    if (!newKey.trim()) return;
    setEnvVar.mutate({
      projectId,
      entry: {
        key: newKey.trim(),
        value: newValue,
        source: "manual",
        secret: newSecret,
        profile: activeProfile,
      },
    });
    setNewKey("");
    setNewValue("");
    setNewSecret(false);
  };

  const handleRemove = (key: string) => {
    removeEnvVar.mutate({ projectId, key, profile: activeProfile });
  };

  const toggleReveal = (key: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const sourceColor = (source: string) => {
    switch (source) {
      case "infisical":
        return "bg-green-500/10 text-green-400 border-green-500/20";
      case "command":
        return "bg-orange-500/10 text-orange-400 border-orange-500/20";
      case "dotenv":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-1">
      {profileVars.length > 0 && (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {profileVars.map((v) => (
            <div
              key={v.key}
              className={`flex items-center gap-2 rounded-md px-2 py-1 ${
                v.secret
                  ? "bg-amber-500/5 border border-amber-500/10"
                  : "bg-muted/20"
              }`}
            >
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
              {v.source !== "command" && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0"
                  onClick={() => handleRemove(v.key)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {profileVars.some((v) => v.source === "command") && (
        <p className="text-[10px] text-orange-400/80">
          Command-sourced vars are previews only. Fresh values are fetched on each start.
        </p>
      )}

      {/* Add new env var */}
      <div className="flex items-center gap-2">
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
          title={newSecret ? "Secret (will use Compose secrets)" : "Not a secret"}
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
git add src/components/env/EnvVarTable.tsx
git commit -m "feat(ui): add EnvVarTable with secret masking, source badges, inline CRUD"
```

---

## Task 13: Create `InfisicalConfig` Component

**Files:**
- Create: `src/components/env/InfisicalConfig.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/env/InfisicalConfig.tsx`:

```typescript
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import type { InfisicalConfig as InfisicalConfigType } from "../../types";
import {
  useCheckInfisicalInstalled,
  useConfigureInfisical,
  useSyncInfisical,
  useTestInfisicalConnection,
} from "../../hooks/useEnvSecrets";

interface InfisicalConfigProps {
  projectId: string;
  config: InfisicalConfigType | null;
  activeProfile: string;
  profiles: string[];
}

export function InfisicalConfig({ projectId, config, activeProfile, profiles }: InfisicalConfigProps) {
  const { data: isInstalled } = useCheckInfisicalInstalled();
  const configureInfisical = useConfigureInfisical();
  const syncInfisical = useSyncInfisical();
  const testConnection = useTestInfisicalConnection();

  const [projectIdInput, setProjectIdInput] = useState(config?.project_id ?? "");
  const [environment, setEnvironment] = useState(config?.environment ?? "dev");
  const [secretPath, setSecretPath] = useState(config?.secret_path ?? "/");
  const [autoSync, setAutoSync] = useState(config?.auto_sync ?? false);
  const [profileMapping, setProfileMapping] = useState<Record<string, string>>(
    config?.profile_mapping ?? {}
  );

  useEffect(() => {
    setProjectIdInput(config?.project_id ?? "");
    setEnvironment(config?.environment ?? "dev");
    setSecretPath(config?.secret_path ?? "/");
    setAutoSync(config?.auto_sync ?? false);
    setProfileMapping(config?.profile_mapping ?? {});
  }, [config]);

  const handleSave = () => {
    configureInfisical.mutate({
      projectId,
      config: {
        project_id: projectIdInput,
        environment,
        secret_path: secretPath,
        auto_sync: autoSync,
        profile_mapping: profileMapping,
      },
    });
  };

  const handleSync = () => {
    syncInfisical.mutate(projectId);
  };

  const handleTest = () => {
    testConnection.mutate(projectId);
  };

  const handleMappingChange = (profile: string, value: string) => {
    setProfileMapping((prev) => ({ ...prev, [profile]: value }));
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
            disabled={syncInfisical.isPending || !config}
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
          <label className="text-[10px] text-muted-foreground">Default Environment</label>
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

      {/* Profile Mapping */}
      {profiles.length > 1 && (
        <div className="space-y-1">
          <label className="text-[10px] text-muted-foreground">Profile → Infisical Env Mapping</label>
          {profiles.map((p) => (
            <div key={p} className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px] w-20 justify-center shrink-0">
                {p}
              </Badge>
              <span className="text-[10px] text-muted-foreground">→</span>
              <Input
                value={profileMapping[p] ?? ""}
                onChange={(e) => handleMappingChange(p, e.target.value)}
                className="h-6 text-[10px] font-mono flex-1"
                placeholder={environment}
              />
            </div>
          ))}
        </div>
      )}

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

- [ ] **Step 2: Commit**

```bash
git add src/components/env/InfisicalConfig.tsx
git commit -m "feat(ui): add InfisicalConfig component with test/sync/mapping"
```

---

## Task 14: Create `EnvironmentTab` Component

**Files:**
- Create: `src/components/env/EnvironmentTab.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/env/EnvironmentTab.tsx`:

```typescript
import { Button } from "@/components/ui/button";
import { FileText, Download } from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Project } from "../../types";
import { ProfileSelector } from "./ProfileSelector";
import { EnvVarTable } from "./EnvVarTable";
import { InfisicalConfig } from "./InfisicalConfig";
import { useLoadDotenvForProfile, useExportProfileToDotenv } from "../../hooks/useEnvSecrets";

interface EnvironmentTabProps {
  project: Project;
}

export function EnvironmentTab({ project }: EnvironmentTabProps) {
  const loadDotenv = useLoadDotenvForProfile();
  const exportDotenv = useExportProfileToDotenv();

  const handleImportDotenv = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Env Files", extensions: ["env", "*"] }],
      defaultPath: project.workspace_path,
    });
    if (!selected) return;
    const path = typeof selected === "string" ? selected : selected[0];
    if (!path) return;

    loadDotenv.mutate({
      projectId: project.id,
      filePath: path,
      profile: project.active_profile,
    });
  };

  const handleExportDotenv = async () => {
    const path = await save({
      defaultPath: `${project.workspace_path}/.env.${project.active_profile}`,
      filters: [{ name: "Env Files", extensions: ["env"] }],
    });
    if (!path) return;

    exportDotenv.mutate({
      projectId: project.id,
      profile: project.active_profile,
      filePath: path,
    });
  };

  const envCount = project.env_vars.filter(
    (v) => v.profile === project.active_profile && !v.secret
  ).length;
  const secretCount = project.env_vars.filter(
    (v) => v.profile === project.active_profile && v.secret
  ).length;

  return (
    <div className="space-y-4">
      {/* Header: Profile + Import/Export */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <ProfileSelector
          projectId={project.id}
          activeProfile={project.active_profile}
          profiles={project.profiles}
        />
        <div className="flex gap-1">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleImportDotenv}>
            <FileText className="h-3.5 w-3.5 mr-1" />
            Import .env
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleExportDotenv}>
            <Download className="h-3.5 w-3.5 mr-1" />
            Export .env
          </Button>
        </div>
      </div>

      {/* Summary */}
      <div className="flex gap-2 text-[10px] text-muted-foreground">
        <span>{envCount} env vars</span>
        {secretCount > 0 && <span>· {secretCount} secrets</span>}
      </div>

      {/* Env Var Table */}
      <EnvVarTable
        projectId={project.id}
        envVars={project.env_vars}
        activeProfile={project.active_profile}
      />

      {/* Infisical Config (only for compose/devcontainer) */}
      {(project.project_type === "compose" || project.project_type === "devcontainer") && (
        <InfisicalConfig
          projectId={project.id}
          config={project.infisical_config}
          activeProfile={project.active_profile}
          profiles={project.profiles}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/env/EnvironmentTab.tsx
git commit -m "feat(ui): add EnvironmentTab with profile selector, env table, infisical config"
```

---

## Task 15: Integrate EnvironmentTab into ProjectDetail

**Files:**
- Modify: `src/components/containers/ProjectDetail.tsx:413-557`

- [ ] **Step 1: Add import for EnvironmentTab**

In `src/components/containers/ProjectDetail.tsx`, add at the top imports (after line 31):

```typescript
import { EnvironmentTab } from "../env/EnvironmentTab";
```

- [ ] **Step 2: Replace inline environment variables section**

Replace the entire `{/* Environment Variables */}` section (lines 413-557, the `<div className="glass-panel rounded-lg p-4 space-y-3">` block that contains "Environment Variables") with:

```tsx
        {/* Environment Variables */}
        <div className="glass-panel rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold">Environment Variables</h3>
          <EnvironmentTab project={project} />
        </div>
```

- [ ] **Step 3: Remove unused imports and state**

Remove these unused state variables from the component (they're now handled by EnvironmentTab):
- Remove `newKey`, `newValue` state declarations (lines 53-54)
- Remove `handleAddEnvVar`, `handleRemoveEnvVar`, `handleLoadDotenv`, `handleRunEnvCommand` functions
- Remove `useLoadDotenvFile`, `useRunEnvCommand` from the imports
- Remove `loadDotenv`, `runEnvCmd`, `cmdError`, `setCmdError` declarations
- Keep `envVars` and `setEnvVars` — they're still used in `buildSaveData` and `hasChanges`

Note: After this change, `envVars`/`dotenvPath`/`envCommand` local state will be out of sync with server state managed by EnvironmentTab. The buildSaveData and hasChanges tracking should still use the `project` prop's values for env_vars. Update `buildSaveData` to use `project.env_vars` instead of `envVars`:

In `buildSaveData` (line 93-109), change:
```typescript
    env_vars: envVars.filter((v) => v.source !== "command"),
```
to:
```typescript
    env_vars: project.env_vars,
```

And in the `hasChanges` effect, remove the envVars comparison since env vars are now managed server-side.

- [ ] **Step 4: Verify frontend builds**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/.worktrees/devcontainer && npx tsc --noEmit 2>&1 | head -30`

Expected: Success (or only warnings)

- [ ] **Step 5: Commit**

```bash
git add src/components/containers/ProjectDetail.tsx
git commit -m "feat(ui): integrate EnvironmentTab into ProjectDetail, replace inline env management"
```

---

## Task 16: Add Profile Dropdown to ProjectCard

**Files:**
- Modify: `src/components/containers/ProjectCard.tsx:114-221`

- [ ] **Step 1: Add imports**

In `src/components/containers/ProjectCard.tsx`, add to imports:

```typescript
import { Lock, ChevronDown } from "lucide-react";
import { useSwitchProfile } from "../../hooks/useEnvSecrets";
```

- [ ] **Step 2: Add switch profile hook and state**

Inside the `ProjectCard` component (after line 28), add:

```typescript
  const switchProfile = useSwitchProfile();
```

- [ ] **Step 3: Add profile badge and secret count to card**

In the badges section (after line 142, after the remote debug badge), add:

```tsx
            {project.profiles.length > 1 && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 bg-cyan-500/10 text-cyan-400 border-cyan-500/20 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  // Cycle through profiles
                  const idx = project.profiles.indexOf(project.active_profile);
                  const next = project.profiles[(idx + 1) % project.profiles.length];
                  switchProfile.mutate({ projectId: project.id, profileName: next });
                }}
              >
                {project.active_profile}
              </Badge>
            )}
            {project.env_vars.filter((v) => v.secret && v.profile === project.active_profile).length > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 bg-amber-500/10 text-amber-400 border-amber-500/20"
              >
                <Lock className="h-2.5 w-2.5 mr-0.5" />
                {project.env_vars.filter((v) => v.secret && v.profile === project.active_profile).length}
              </Badge>
            )}
```

- [ ] **Step 4: Verify frontend builds**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/.worktrees/devcontainer && npx tsc --noEmit 2>&1 | head -30`

Expected: Success

- [ ] **Step 5: Commit**

```bash
git add src/components/containers/ProjectCard.tsx
git commit -m "feat(ui): add profile badge and secret count to ProjectCard"
```

---

## Task 17: Full Build Verification

**Files:** None (verification only)

- [ ] **Step 1: Rust build**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/.worktrees/devcontainer && cargo build --manifest-path src-tauri/Cargo.toml 2>&1 | tail -10`

Expected: `Finished` with no errors

- [ ] **Step 2: Frontend type check**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/.worktrees/devcontainer && npx tsc --noEmit 2>&1 | head -30`

Expected: No errors

- [ ] **Step 3: Frontend build**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/.worktrees/devcontainer && npm run build 2>&1 | tail -10`

Expected: Build success

- [ ] **Step 4: Tauri dev smoke test**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/.worktrees/devcontainer && npm run tauri dev`

Manual verification:
1. Open app → Projects tab
2. Select a Compose project → Settings
3. See "Environment Variables" section with Profile selector
4. Create a new profile (e.g., "dev")
5. Add env vars (some with secret toggle)
6. Switch profiles → vars change per profile
7. If Infisical installed: configure and test connection

- [ ] **Step 5: Commit any fixes**

If any fixes were needed:
```bash
git add -A
git commit -m "fix: resolve build issues from env secrets integration"
```
