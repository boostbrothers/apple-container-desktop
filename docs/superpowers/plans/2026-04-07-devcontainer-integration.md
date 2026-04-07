# Dev Container Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add devcontainer lifecycle management (build/start/stop/remove) to Colima Desktop's Containers page via a new "Dev Containers" tab.

**Architecture:** Rust backend exposes 7 Tauri commands that wrap `@devcontainers/cli` and Docker CLI. Project registrations are persisted to a JSON config file in the app data directory. React frontend adds a tab to ContainerList with project-based accordion groups (reusing ComposeGroup pattern). The `devcontainer` CLI handles all devcontainer.json parsing and container orchestration.

**Tech Stack:** Tauri 2 (Rust), React 19, TypeScript, TanStack React Query, shadcn/ui, Tailwind CSS 4, `@devcontainers/cli`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src-tauri/src/commands/devcontainer.rs` | Tauri commands: list, add, remove, build, up, stop, read-config |
| `src/components/containers/DevContainerTab.tsx` | Dev Containers tab content: project list, add button, CLI check banner |
| `src/components/containers/DevContainerGroup.tsx` | Per-project accordion with status, actions, config info, connection info |
| `src/components/containers/AddProjectDialog.tsx` | Folder picker dialog for registering projects |
| `src/hooks/useDevcontainers.ts` | React Query hooks for devcontainer data and mutations |

### Modified Files

| File | Changes |
|------|---------|
| `src-tauri/src/commands/mod.rs` | Add `pub mod devcontainer;` |
| `src-tauri/src/cli/types.rs` | Add `DevContainerProject`, `DevContainerConfig` structs |
| `src-tauri/src/lib.rs` | Register devcontainer commands in `invoke_handler` |
| `src-tauri/Cargo.toml` | Add `uuid` and `dirs` dependencies |
| `src/types/index.ts` | Add `DevContainerProject`, `DevContainerConfig` interfaces |
| `src/lib/tauri.ts` | Add devcontainer API functions |
| `src/components/containers/ContainerList.tsx` | Add tab switching between Containers and Dev Containers |

---

## Task 1: Rust types and config persistence

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/cli/types.rs`

- [ ] **Step 1: Add dependencies to Cargo.toml**

In `src-tauri/Cargo.toml`, add `uuid` and `dirs` under `[dependencies]`:

```toml
uuid = { version = "1", features = ["v4"] }
dirs = "6"
```

- [ ] **Step 2: Add Rust types to `src-tauri/src/cli/types.rs`**

Append the following to the end of `src-tauri/src/cli/types.rs`:

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DevContainerProject {
    pub id: String,
    pub workspace_path: String,
    pub name: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct DevContainerProjectWithStatus {
    pub id: String,
    pub workspace_path: String,
    pub name: String,
    pub status: String, // "running", "stopped", "not_built", "building", "path_missing"
    pub container_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DevContainerProjectsConfig {
    pub projects: Vec<DevContainerProject>,
}

#[derive(Debug, Serialize, Clone)]
pub struct DevContainerReadConfig {
    pub image: String,
    pub features: Vec<String>,
    pub forward_ports: Vec<u16>,
    pub remote_user: String,
}
```

- [ ] **Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/src/cli/types.rs
git commit -m "feat(devcontainer): add Rust types and dependencies for devcontainer integration"
```

---

## Task 2: Tauri devcontainer commands

**Files:**
- Create: `src-tauri/src/commands/devcontainer.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `src-tauri/src/commands/devcontainer.rs`**

```rust
use crate::cli::executor::{docker_host, CliExecutor};
use crate::cli::types::{
    DevContainerProject, DevContainerProjectWithStatus, DevContainerProjectsConfig,
    DevContainerReadConfig,
};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

const DOCKER: &str = "/opt/homebrew/bin/docker";

fn config_path() -> Result<std::path::PathBuf, String> {
    let config_dir = dirs::config_dir().ok_or("Cannot find config directory")?;
    let app_dir = config_dir.join("colima-desktop");
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create config dir: {}", e))?;
    Ok(app_dir.join("devcontainer-projects.json"))
}

fn load_projects() -> Result<Vec<DevContainerProject>, String> {
    let path = config_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {}", e))?;
    let config: DevContainerProjectsConfig =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse config: {}", e))?;
    Ok(config.projects)
}

fn save_projects(projects: &[DevContainerProject]) -> Result<(), String> {
    let path = config_path()?;
    let config = DevContainerProjectsConfig {
        projects: projects.to_vec(),
    };
    let content =
        serde_json::to_string_pretty(&config).map_err(|e| format!("Failed to serialize: {}", e))?;
    std::fs::write(&path, content).map_err(|e| format!("Failed to write config: {}", e))?;
    Ok(())
}

fn find_devcontainer_cli() -> Option<String> {
    // Check common locations
    let candidates = [
        "/opt/homebrew/bin/devcontainer",
        "/usr/local/bin/devcontainer",
    ];
    for path in candidates {
        if std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }
    // Try PATH via `which`
    if let Ok(output) = std::process::Command::new("which")
        .arg("devcontainer")
        .output()
    {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
    }
    None
}

#[tauri::command]
pub async fn check_devcontainer_cli() -> Result<bool, String> {
    Ok(find_devcontainer_cli().is_some())
}

#[tauri::command]
pub async fn list_devcontainer_projects() -> Result<Vec<DevContainerProjectWithStatus>, String> {
    let projects = load_projects()?;
    let mut result = Vec::new();

    for project in projects {
        // Check if path still exists
        if !std::path::Path::new(&project.workspace_path).exists() {
            result.push(DevContainerProjectWithStatus {
                id: project.id,
                workspace_path: project.workspace_path,
                name: project.name,
                status: "path_missing".to_string(),
                container_id: None,
            });
            continue;
        }

        // Check container status via docker ps with label filter
        let label_filter = format!(
            "label=devcontainer.local_folder={}",
            project.workspace_path
        );
        let output = CliExecutor::run(
            DOCKER,
            &[
                "ps",
                "-a",
                "--filter",
                &label_filter,
                "--format",
                "{{.ID}}|{{.State}}",
            ],
        )
        .await;

        let (status, container_id) = match output {
            Ok(out) => {
                let line = out.trim();
                if line.is_empty() {
                    ("not_built".to_string(), None)
                } else {
                    let parts: Vec<&str> = line.lines().next().unwrap_or("").split('|').collect();
                    let cid = parts.first().map(|s| s.to_string());
                    let state = parts.get(1).unwrap_or(&"unknown");
                    let status = if *state == "running" {
                        "running".to_string()
                    } else {
                        "stopped".to_string()
                    };
                    (status, cid)
                }
            }
            Err(_) => ("not_built".to_string(), None),
        };

        result.push(DevContainerProjectWithStatus {
            id: project.id,
            workspace_path: project.workspace_path,
            name: project.name,
            status,
            container_id,
        });
    }

    Ok(result)
}

#[tauri::command]
pub async fn add_devcontainer_project(workspace_path: String) -> Result<DevContainerProjectWithStatus, String> {
    let path = std::path::Path::new(&workspace_path);

    // Validate devcontainer.json exists
    let has_config = path.join(".devcontainer").join("devcontainer.json").exists()
        || path.join(".devcontainer.json").exists();

    if !has_config {
        return Err("No devcontainer.json found in this project. Expected .devcontainer/devcontainer.json or .devcontainer.json".to_string());
    }

    let mut projects = load_projects()?;

    // Check for duplicates
    if projects.iter().any(|p| p.workspace_path == workspace_path) {
        return Err("This project is already registered".to_string());
    }

    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let project = DevContainerProject {
        id: uuid::Uuid::new_v4().to_string(),
        workspace_path: workspace_path.clone(),
        name: name.clone(),
    };

    projects.push(project.clone());
    save_projects(&projects)?;

    Ok(DevContainerProjectWithStatus {
        id: project.id,
        workspace_path,
        name,
        status: "not_built".to_string(),
        container_id: None,
    })
}

#[tauri::command]
pub async fn remove_devcontainer_project(id: String, remove_container: bool) -> Result<(), String> {
    let mut projects = load_projects()?;

    let project = projects
        .iter()
        .find(|p| p.id == id)
        .ok_or("Project not found")?
        .clone();

    if remove_container {
        // Find and remove associated containers
        let label_filter = format!(
            "label=devcontainer.local_folder={}",
            project.workspace_path
        );
        let output = CliExecutor::run(
            DOCKER,
            &[
                "ps",
                "-a",
                "--filter",
                &label_filter,
                "--format",
                "{{.ID}}",
            ],
        )
        .await;

        if let Ok(out) = output {
            for cid in out.lines() {
                let cid = cid.trim();
                if !cid.is_empty() {
                    let _ = CliExecutor::run(DOCKER, &["rm", "-f", cid]).await;
                }
            }
        }
    }

    projects.retain(|p| p.id != id);
    save_projects(&projects)?;
    Ok(())
}

#[tauri::command]
pub async fn devcontainer_up(app: AppHandle, workspace_path: String) -> Result<(), String> {
    let cli = find_devcontainer_cli().ok_or(
        "devcontainer CLI not found. Install with: npm install -g @devcontainers/cli",
    )?;

    let event_name = format!("devcontainer-log-{}", workspace_path.replace('/', "_"));
    let docker_host_val = docker_host();

    let mut child = Command::new(&cli)
        .args(["up", "--workspace-folder", &workspace_path])
        .env("DOCKER_HOST", &docker_host_val)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn devcontainer up: {}", e))?;

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let stderr = child.stderr.take().ok_or("No stderr")?;

    let app_clone = app.clone();
    let event_clone = event_name.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_clone.emit(&event_clone, &line);
        }
    });

    let app_clone2 = app.clone();
    let event_clone2 = event_name.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_clone2.emit(&event_clone2, &line);
        }
    });

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait for devcontainer up: {}", e))?;

    if !status.success() {
        return Err("devcontainer up failed. Check the build log for details.".to_string());
    }

    let _ = app.emit(&event_name, "[done]");
    Ok(())
}

#[tauri::command]
pub async fn devcontainer_build(app: AppHandle, workspace_path: String) -> Result<(), String> {
    let cli = find_devcontainer_cli().ok_or(
        "devcontainer CLI not found. Install with: npm install -g @devcontainers/cli",
    )?;

    let event_name = format!("devcontainer-log-{}", workspace_path.replace('/', "_"));
    let docker_host_val = docker_host();

    let mut child = Command::new(&cli)
        .args(["build", "--workspace-folder", &workspace_path])
        .env("DOCKER_HOST", &docker_host_val)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn devcontainer build: {}", e))?;

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let stderr = child.stderr.take().ok_or("No stderr")?;

    let app_clone = app.clone();
    let event_clone = event_name.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_clone.emit(&event_clone, &line);
        }
    });

    let app_clone2 = app.clone();
    let event_clone2 = event_name.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stderr);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_clone2.emit(&event_clone2, &line);
        }
    });

    let status = child
        .wait()
        .await
        .map_err(|e| format!("Failed to wait for devcontainer build: {}", e))?;

    if !status.success() {
        return Err("devcontainer build failed. Check the build log for details.".to_string());
    }

    let _ = app.emit(&event_name, "[done]");
    Ok(())
}

#[tauri::command]
pub async fn devcontainer_stop(workspace_path: String) -> Result<(), String> {
    let label_filter = format!(
        "label=devcontainer.local_folder={}",
        workspace_path
    );
    let output = CliExecutor::run(
        DOCKER,
        &[
            "ps",
            "-q",
            "--filter",
            &label_filter,
        ],
    )
    .await?;

    for cid in output.lines() {
        let cid = cid.trim();
        if !cid.is_empty() {
            CliExecutor::run(DOCKER, &["stop", cid]).await?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn devcontainer_read_config(workspace_path: String) -> Result<DevContainerReadConfig, String> {
    let cli = find_devcontainer_cli().ok_or(
        "devcontainer CLI not found. Install with: npm install -g @devcontainers/cli",
    )?;

    let docker_host_val = docker_host();
    let output = Command::new(&cli)
        .args(["read-configuration", "--workspace-folder", &workspace_path])
        .env("DOCKER_HOST", &docker_host_val)
        .output()
        .await
        .map_err(|e| format!("Failed to run read-configuration: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("read-configuration failed: {}", stderr.trim()));
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let parsed: serde_json::Value =
        serde_json::from_str(&stdout).map_err(|e| format!("JSON parse error: {}", e))?;

    let config = &parsed["configuration"];

    let image = config["image"]
        .as_str()
        .unwrap_or("")
        .to_string();

    let features = config["features"]
        .as_object()
        .map(|obj| obj.keys().cloned().collect())
        .unwrap_or_default();

    let forward_ports = config["forwardPorts"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|v| v.as_u64().map(|n| n as u16))
                .collect()
        })
        .unwrap_or_default();

    let remote_user = config["remoteUser"]
        .as_str()
        .unwrap_or("root")
        .to_string();

    Ok(DevContainerReadConfig {
        image,
        features,
        forward_ports,
        remote_user,
    })
}
```

- [ ] **Step 2: Register module in `src-tauri/src/commands/mod.rs`**

Add this line:

```rust
pub mod devcontainer;
```

- [ ] **Step 3: Register commands in `src-tauri/src/lib.rs`**

Add the following to the `invoke_handler` macro call, after the last existing command:

```rust
commands::devcontainer::check_devcontainer_cli,
commands::devcontainer::list_devcontainer_projects,
commands::devcontainer::add_devcontainer_project,
commands::devcontainer::remove_devcontainer_project,
commands::devcontainer::devcontainer_up,
commands::devcontainer::devcontainer_build,
commands::devcontainer::devcontainer_stop,
commands::devcontainer::devcontainer_read_config,
```

- [ ] **Step 4: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: Compiles with no errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/devcontainer.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(devcontainer): add Tauri commands for devcontainer lifecycle management"
```

---

## Task 3: TypeScript types and API layer

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Add TypeScript types to `src/types/index.ts`**

Append the following to the end of the file:

```typescript
export interface DevContainerProject {
  id: string;
  workspace_path: string;
  name: string;
  status: "running" | "stopped" | "not_built" | "building" | "path_missing";
  container_id: string | null;
}

export interface DevContainerConfig {
  image: string;
  features: string[];
  forward_ports: number[];
  remote_user: string;
}
```

- [ ] **Step 2: Add API functions to `src/lib/tauri.ts`**

Add the following entries to the `api` object, after the last existing entry:

```typescript
checkDevcontainerCli: () => invoke<boolean>("check_devcontainer_cli"),
listDevcontainerProjects: () => invoke<DevContainerProject[]>("list_devcontainer_projects"),
addDevcontainerProject: (workspacePath: string) =>
  invoke<DevContainerProject>("add_devcontainer_project", { workspacePath }),
removeDevcontainerProject: (id: string, removeContainer: boolean) =>
  invoke<void>("remove_devcontainer_project", { id, removeContainer }),
devcontainerUp: (workspacePath: string) =>
  invoke<void>("devcontainer_up", { workspacePath }),
devcontainerBuild: (workspacePath: string) =>
  invoke<void>("devcontainer_build", { workspacePath }),
devcontainerStop: (workspacePath: string) =>
  invoke<void>("devcontainer_stop", { workspacePath }),
devcontainerReadConfig: (workspacePath: string) =>
  invoke<DevContainerConfig>("devcontainer_read_config", { workspacePath }),
```

Also add the import types at the top of the file:

```typescript
import type { ..., DevContainerProject, DevContainerConfig } from "../types";
```

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts src/lib/tauri.ts
git commit -m "feat(devcontainer): add TypeScript types and Tauri API bindings"
```

---

## Task 4: React Query hooks

**Files:**
- Create: `src/hooks/useDevcontainers.ts`

- [ ] **Step 1: Create `src/hooks/useDevcontainers.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";

export function useDevcontainerCliCheck() {
  return useQuery({
    queryKey: ["devcontainer-cli-check"],
    queryFn: api.checkDevcontainerCli,
    staleTime: 60_000,
  });
}

export function useDevcontainerProjects() {
  return useQuery({
    queryKey: ["devcontainer-projects"],
    queryFn: api.listDevcontainerProjects,
    refetchInterval: 3000,
  });
}

export function useAddDevcontainerProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (workspacePath: string) => api.addDevcontainerProject(workspacePath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devcontainer-projects"] });
    },
  });
}

export function useRemoveDevcontainerProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, removeContainer }: { id: string; removeContainer: boolean }) =>
      api.removeDevcontainerProject(id, removeContainer),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devcontainer-projects"] });
    },
  });
}

export function useDevcontainerAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      workspacePath,
      action,
    }: {
      workspacePath: string;
      action: "up" | "build" | "stop";
    }) => {
      switch (action) {
        case "up":
          return api.devcontainerUp(workspacePath);
        case "build":
          return api.devcontainerBuild(workspacePath);
        case "stop":
          return api.devcontainerStop(workspacePath);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["devcontainer-projects"] });
    },
  });
}

export function useDevcontainerConfig(workspacePath: string) {
  return useQuery({
    queryKey: ["devcontainer-config", workspacePath],
    queryFn: () => api.devcontainerReadConfig(workspacePath),
    enabled: !!workspacePath,
    staleTime: 30_000,
  });
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useDevcontainers.ts
git commit -m "feat(devcontainer): add React Query hooks for devcontainer management"
```

---

## Task 5: AddProjectDialog component

**Files:**
- Create: `src/components/containers/AddProjectDialog.tsx`

- [ ] **Step 1: Create `src/components/containers/AddProjectDialog.tsx`**

```typescript
import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { FolderPlus } from "lucide-react";
import { useAddDevcontainerProject } from "../../hooks/useDevcontainers";

export function AddProjectDialog() {
  const addProject = useAddDevcontainerProject();
  const [error, setError] = useState<string | null>(null);

  const handleAdd = async () => {
    setError(null);
    const selected = await open({ directory: true, multiple: false });
    if (!selected) return;

    const path = typeof selected === "string" ? selected : selected[0];
    if (!path) return;

    addProject.mutate(path, {
      onError: (err) => {
        setError(err instanceof Error ? err.message : String(err));
      },
    });
  };

  return (
    <div className="flex items-center gap-2">
      <Button size="sm" onClick={handleAdd} disabled={addProject.isPending}>
        <FolderPlus className="h-4 w-4 mr-1" />
        {addProject.isPending ? "Adding..." : "Add Project"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </div>
  );
}
```

- [ ] **Step 2: Verify Tauri dialog plugin is available**

Check if `@tauri-apps/plugin-dialog` is already a dependency. If not:

Run: `npm ls @tauri-apps/plugin-dialog`

If missing, install:

```bash
npm install @tauri-apps/plugin-dialog
```

And in `src-tauri/Cargo.toml` add:

```toml
tauri-plugin-dialog = "2"
```

And in `src-tauri/src/lib.rs`, add before `.invoke_handler(...)`:

```rust
.plugin(tauri_plugin_dialog::init())
```

- [ ] **Step 3: Commit**

```bash
git add src/components/containers/AddProjectDialog.tsx
# Also add package.json, Cargo.toml, lib.rs if modified
git commit -m "feat(devcontainer): add AddProjectDialog component with folder picker"
```

---

## Task 6: DevContainerGroup component

**Files:**
- Create: `src/components/containers/DevContainerGroup.tsx`

- [ ] **Step 1: Create `src/components/containers/DevContainerGroup.tsx`**

```typescript
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronDown, Copy, AlertTriangle, Loader2 } from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import type { DevContainerProject } from "../../types";
import { useDevcontainerAction, useRemoveDevcontainerProject, useDevcontainerConfig } from "../../hooks/useDevcontainers";

interface DevContainerGroupProps {
  project: DevContainerProject;
}

export function DevContainerGroup({ project }: DevContainerGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const [buildLog, setBuildLog] = useState<string[]>([]);
  const [isBuilding, setIsBuilding] = useState(false);
  const action = useDevcontainerAction();
  const remove = useRemoveDevcontainerProject();
  const { data: config } = useDevcontainerConfig(
    expanded && project.status !== "path_missing" ? project.workspace_path : ""
  );

  const eventKey = project.workspace_path.replace(/\//g, "_");

  useEffect(() => {
    if (!isBuilding) return;

    const unlisten = listen<string>(`devcontainer-log-${eventKey}`, (event) => {
      if (event.payload === "[done]") {
        setIsBuilding(false);
      } else {
        setBuildLog((prev) => [...prev.slice(-200), event.payload]);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [isBuilding, eventKey]);

  const handleAction = (type: "up" | "build" | "stop") => {
    if (type === "up" || type === "build") {
      setIsBuilding(true);
      setBuildLog([]);
      setExpanded(true);
    }
    action.mutate(
      { workspacePath: project.workspace_path, action: type },
      {
        onError: () => setIsBuilding(false),
      }
    );
  };

  const handleRemove = () => {
    remove.mutate({
      id: project.id,
      removeContainer: project.status !== "not_built",
    });
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const statusBadge = () => {
    switch (project.status) {
      case "running":
        return <Badge variant="default" className="text-xs">Running</Badge>;
      case "stopped":
        return <Badge variant="secondary" className="text-xs">Stopped</Badge>;
      case "not_built":
        return <Badge variant="outline" className="text-xs bg-yellow-500/10 text-yellow-500 border-yellow-500/20">Not Built</Badge>;
      case "path_missing":
        return <Badge variant="destructive" className="text-xs">Path Missing</Badge>;
      default:
        return null;
    }
  };

  const actionButtons = () => {
    if (isBuilding) {
      return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
    }

    const disabled = action.isPending || remove.isPending;

    switch (project.status) {
      case "running":
        return (
          <>
            <Button variant="ghost" size="sm" onClick={() => handleAction("build")} disabled={disabled}>Rebuild</Button>
            <Button variant="ghost" size="sm" onClick={() => handleAction("stop")} disabled={disabled}>Stop</Button>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={handleRemove} disabled={disabled}>Remove</Button>
          </>
        );
      case "stopped":
        return (
          <>
            <Button variant="ghost" size="sm" onClick={() => handleAction("up")} disabled={disabled}>Start</Button>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={handleRemove} disabled={disabled}>Remove</Button>
          </>
        );
      case "not_built":
        return (
          <>
            <Button variant="ghost" size="sm" onClick={() => handleAction("up")} disabled={disabled}>Build & Start</Button>
            <Button variant="ghost" size="sm" className="text-destructive" onClick={handleRemove} disabled={disabled}>Remove</Button>
          </>
        );
      case "path_missing":
        return (
          <Button variant="ghost" size="sm" className="text-destructive" onClick={handleRemove} disabled={disabled}>Remove</Button>
        );
      default:
        return null;
    }
  };

  const dockerExecCmd = project.container_id
    ? `docker exec -it ${project.container_id} /bin/bash`
    : "";
  const vscodeCmd = `code --folder-uri vscode-remote://dev-container+${Buffer.from(project.workspace_path).toString("hex")}/workspaces/${project.name}`;

  return (
    <div className="glass-group overflow-hidden">
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-[var(--glass-bg-hover)] transition-all"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{project.name}</span>
            {statusBadge()}
            {project.status === "path_missing" && (
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            )}
          </div>
          <span className="text-xs text-muted-foreground truncate block">{project.workspace_path}</span>
        </div>
        <div className="ml-auto flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {actionButtons()}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-[var(--glass-border)] px-4 pb-3 pt-2 space-y-3">
          {/* Config Info */}
          {config && (
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-md bg-muted/30 px-3 py-2">
                <div className="text-[10px] uppercase text-muted-foreground mb-1">Image</div>
                <div className="text-xs truncate">{config.image || "Dockerfile-based"}</div>
              </div>
              <div className="rounded-md bg-muted/30 px-3 py-2">
                <div className="text-[10px] uppercase text-muted-foreground mb-1">Features</div>
                <div className="text-xs truncate">
                  {config.features.length > 0
                    ? config.features.map((f) => f.split("/").pop()).join(", ")
                    : "None"}
                </div>
              </div>
            </div>
          )}

          {/* Connection Info */}
          {project.status === "running" && project.container_id && (
            <div className="rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2 space-y-2">
              <div className="text-xs font-semibold text-blue-400">Connection Info</div>
              <div className="flex items-center gap-2">
                <code className="text-[11px] bg-black/30 px-2 py-1 rounded flex-1 truncate">
                  {dockerExecCmd}
                </code>
                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyToClipboard(dockerExecCmd)}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
              <div className="flex items-center gap-2">
                <code className="text-[11px] bg-black/30 px-2 py-1 rounded flex-1 truncate">
                  {vscodeCmd}
                </code>
                <Button variant="ghost" size="sm" className="h-6 px-2" onClick={() => copyToClipboard(vscodeCmd)}>
                  <Copy className="h-3 w-3" />
                </Button>
              </div>
            </div>
          )}

          {/* Build Log */}
          {(isBuilding || buildLog.length > 0) && (
            <div className="rounded-md bg-black/40 p-2 max-h-48 overflow-y-auto font-mono text-[11px] text-muted-foreground">
              {buildLog.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              {isBuilding && <Loader2 className="h-3 w-3 animate-spin inline-block mt-1" />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/containers/DevContainerGroup.tsx
git commit -m "feat(devcontainer): add DevContainerGroup accordion component"
```

---

## Task 7: DevContainerTab component

**Files:**
- Create: `src/components/containers/DevContainerTab.tsx`

- [ ] **Step 1: Create `src/components/containers/DevContainerTab.tsx`**

```typescript
import { useDevcontainerProjects, useDevcontainerCliCheck } from "../../hooks/useDevcontainers";
import { DevContainerGroup } from "./DevContainerGroup";
import { AddProjectDialog } from "./AddProjectDialog";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";

export function DevContainerTab() {
  const { data: cliAvailable, isLoading: cliChecking } = useDevcontainerCliCheck();
  const { data: projects, isLoading, error } = useDevcontainerProjects();

  if (cliChecking) {
    return <p className="text-sm text-muted-foreground">Checking devcontainer CLI...</p>;
  }

  const installCmd = "npm install -g @devcontainers/cli";

  return (
    <div>
      {/* CLI not installed banner */}
      {cliAvailable === false && (
        <div className="mb-4 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
          <p className="text-sm font-medium text-yellow-500 mb-1">devcontainer CLI required</p>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-black/30 px-2 py-1 rounded">{installCmd}</code>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              onClick={() => navigator.clipboard.writeText(installCmd)}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {projects?.length ?? 0} project{(projects?.length ?? 0) !== 1 ? "s" : ""} registered
        </span>
        <AddProjectDialog />
      </div>

      {/* Loading & Error */}
      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {error && <p className="text-sm text-destructive">Failed to load projects.</p>}

      {/* Project List */}
      <div className="flex flex-col gap-2">
        {projects?.map((project) => (
          <DevContainerGroup key={project.id} project={project} />
        ))}
        {projects && projects.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground">
            No dev container projects registered. Click "Add Project" to get started.
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/containers/DevContainerTab.tsx
git commit -m "feat(devcontainer): add DevContainerTab with CLI check and project list"
```

---

## Task 8: Add tab switching to ContainerList

**Files:**
- Modify: `src/components/containers/ContainerList.tsx`

- [ ] **Step 1: Modify `src/components/containers/ContainerList.tsx`**

Add a `tab` state and tab bar UI. The full modified file:

```typescript
import { useState, useMemo } from "react";
import { useContainers, usePruneContainers } from "../../hooks/useContainers";
import { ContainerRow } from "./ContainerRow";
import { ComposeGroup } from "./ComposeGroup";
import { ContainerLogs } from "./ContainerLogs";
import { ContainerRun } from "./ContainerRun";
import { ContainerDetail } from "./ContainerDetail";
import { DevContainerTab } from "./DevContainerTab";
import { Button } from "@/components/ui/button";
import type { Container } from "../../types";

type Filter = "all" | "running" | "stopped";
type Tab = "containers" | "devcontainers";

interface ComposeGroupData {
  project: string;
  containers: Container[];
}

export function ContainerList() {
  const { data: containers, isLoading, error } = useContainers();
  const prune = usePruneContainers();
  const [filter, setFilter] = useState<Filter>("all");
  const [tab, setTab] = useState<Tab>("containers");
  const [logsContainerId, setLogsContainerId] = useState<string | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);

  const stoppedCount = useMemo(() =>
    containers?.filter((c) => c.state !== "running").length ?? 0,
  [containers]);

  const filtered = useMemo(() => {
    if (!containers) return [];
    return containers.filter((c) => {
      if (filter === "running") return c.state === "running";
      if (filter === "stopped") return c.state !== "running";
      return true;
    });
  }, [containers, filter]);

  const { composeGroups, standalone } = useMemo(() => {
    const groupMap = new Map<string, Container[]>();
    const standalone: Container[] = [];

    for (const c of filtered) {
      if (c.compose_project) {
        const group = groupMap.get(c.compose_project) ?? [];
        group.push(c);
        groupMap.set(c.compose_project, group);
      } else {
        standalone.push(c);
      }
    }

    const composeGroups: ComposeGroupData[] = Array.from(groupMap.entries()).map(
      ([project, containers]) => ({ project, containers })
    );

    return { composeGroups, standalone };
  }, [filtered]);

  if (inspectId) {
    return <ContainerDetail containerId={inspectId} onBack={() => setInspectId(null)} />;
  }

  if (logsContainerId) {
    return <ContainerLogs containerId={logsContainerId} onBack={() => setLogsContainerId(null)} />;
  }

  return (
    <div>
      {/* Tab Bar */}
      <div className="flex border-b border-[var(--glass-border)] mb-4">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "containers"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setTab("containers")}
        >
          Containers
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "devcontainers"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setTab("devcontainers")}
        >
          Dev Containers
        </button>
      </div>

      {/* Containers Tab */}
      {tab === "containers" && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-lg font-semibold">Containers</h1>
            <div className="flex gap-1">
              {(["all", "running", "stopped"] as Filter[]).map((f) => (
                <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                onClick={() => prune.mutate()}
                disabled={prune.isPending || stoppedCount === 0}
              >
                {prune.isPending ? "Pruning..." : "Prune"}
              </Button>
            </div>
          </div>
          <div className="mb-4"><ContainerRun /></div>
          {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {error && <p className="text-sm text-destructive">Failed to load containers. Is Colima running?</p>}
          <div className="flex flex-col gap-2">
            {composeGroups.map((group) => (
              <ComposeGroup
                key={group.project}
                project={group.project}
                containers={group.containers}
                onViewLogs={setLogsContainerId}
                onInspect={setInspectId}
              />
            ))}
            {standalone.map((container) => (
              <ContainerRow key={container.id} container={container} onViewLogs={setLogsContainerId} onInspect={setInspectId} />
            ))}
            {composeGroups.length === 0 && standalone.length === 0 && !isLoading && (
              <p className="text-sm text-muted-foreground">No containers found.</p>
            )}
          </div>
        </>
      )}

      {/* Dev Containers Tab */}
      {tab === "devcontainers" && <DevContainerTab />}
    </div>
  );
}
```

- [ ] **Step 2: Verify frontend builds**

Run: `npm run build`
Expected: Builds with no errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/containers/ContainerList.tsx
git commit -m "feat(devcontainer): add tab switching between Containers and Dev Containers"
```

---

## Task 9: Tauri plugin registration and full build verification

**Files:**
- Possibly modify: `src-tauri/tauri.conf.json` (dialog permission)
- Possibly modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Check and add dialog permission**

Check if Tauri dialog plugin needs capabilities. Look at `src-tauri/capabilities/` or `tauri.conf.json` for existing permission patterns.

If using Tauri 2 capabilities, add `"dialog:allow-open"` to the default capability's permissions array.

- [ ] **Step 2: Full build test**

Run: `npm run tauri build -- --debug`

If this is too slow, at minimum verify both compile:

```bash
cd src-tauri && cargo check
cd .. && npm run build
```

Expected: Both compile with no errors.

- [ ] **Step 3: Commit any remaining changes**

```bash
git add -A
git commit -m "feat(devcontainer): add dialog permissions and finalize integration"
```

---

## Task 10: Manual smoke test

- [ ] **Step 1: Run the dev server**

```bash
npm run tauri dev
```

- [ ] **Step 2: Test the following scenarios**

1. Navigate to Containers page → verify "Containers" and "Dev Containers" tabs appear
2. Click "Dev Containers" tab → verify tab switches
3. If devcontainer CLI is not installed → verify warning banner appears
4. Click "Add Project" → verify folder picker opens
5. Select a folder without devcontainer.json → verify error message
6. Select a folder with devcontainer.json → verify project appears in list as "Not Built"
7. Click "Build & Start" → verify build log streams in accordion
8. After build completes → verify status changes to "Running"
9. Verify connection info (docker exec, VS Code commands) appear and copy buttons work
10. Click "Stop" → verify status changes to "Stopped"
11. Click "Remove" → verify project is removed from list

- [ ] **Step 3: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix(devcontainer): address issues found during smoke test"
```
