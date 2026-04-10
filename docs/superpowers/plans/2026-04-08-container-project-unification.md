# Container & Project Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify the fragmented containers/compose/devcontainers/projects architecture into a single cohesive system.

**Architecture:** Bottom-up refactoring: Rust types -> backend commands -> frontend types/API/hooks -> UI components. Each phase produces a working app.

**Tech Stack:** Rust (Tauri 2), TypeScript, React 19, TanStack Query

**Spec:** `docs/superpowers/specs/2026-04-08-container-project-unification-design.md`

---

### Task 1: Rename Rust Types and Add Config Migration

**Files:**
- Modify: `src-tauri/src/cli/types.rs:355-475`
- Modify: `src-tauri/src/commands/docker_project.rs:1-50` (config path + load/save)

- [ ] **Step 1: Rename types in `cli/types.rs`**

Remove `DevContainerProject`, `DevContainerProjectWithStatus`, `DevContainerProjectsConfig`, `DevContainerReadConfig` (lines 355-383). Rename `DockerProject` to `Project`, `DockerProjectWithStatus` to `ProjectWithStatus`, `DockerProjectsConfig` to `ProjectsConfig`. Keep all fields identical.

```rust
// DELETE lines 355-383 (DevContainerProject, DevContainerProjectWithStatus,
// DevContainerProjectsConfig, DevContainerReadConfig)

// RENAME at line 393:
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub workspace_path: String,
    pub project_type: String, // "dockerfile" | "compose" | "devcontainer"
    #[serde(default)]
    pub env_vars: Vec<EnvVarEntry>,
    #[serde(default)]
    pub dotenv_path: Option<String>,
    #[serde(default)]
    pub watch_mode: bool,
    #[serde(default)]
    pub remote_debug: bool,
    #[serde(default = "default_debug_port")]
    pub debug_port: u16,
    #[serde(default)]
    pub compose_file: Option<String>,
    #[serde(default)]
    pub dockerfile: Option<String>,
    #[serde(default)]
    pub service_name: Option<String>,
    #[serde(default)]
    pub env_command: Option<String>,
    #[serde(default)]
    pub ports: Vec<String>,
    #[serde(default)]
    pub startup_command: Option<String>,
}

// RENAME at line 427:
#[derive(Debug, Serialize, Clone)]
pub struct ProjectWithStatus {
    pub id: String,
    pub name: String,
    pub workspace_path: String,
    pub project_type: String,
    pub env_vars: Vec<EnvVarEntry>,
    pub dotenv_path: Option<String>,
    pub watch_mode: bool,
    pub remote_debug: bool,
    pub debug_port: u16,
    pub compose_file: Option<String>,
    pub dockerfile: Option<String>,
    pub service_name: Option<String>,
    pub env_command: Option<String>,
    pub ports: Vec<String>,
    pub startup_command: Option<String>,
    pub status: String,
    pub container_ids: Vec<String>,
}

// RENAME impl at line 448:
impl Project {
    pub fn with_status(self, status: String, container_ids: Vec<String>) -> ProjectWithStatus {
        ProjectWithStatus {
            id: self.id,
            name: self.name,
            workspace_path: self.workspace_path,
            project_type: self.project_type,
            env_vars: self.env_vars,
            dotenv_path: self.dotenv_path,
            watch_mode: self.watch_mode,
            remote_debug: self.remote_debug,
            debug_port: self.debug_port,
            compose_file: self.compose_file,
            dockerfile: self.dockerfile,
            service_name: self.service_name,
            env_command: self.env_command,
            ports: self.ports,
            startup_command: self.startup_command,
            status,
            container_ids,
        }
    }
}

// RENAME at line 472:
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectsConfig {
    pub projects: Vec<Project>,
}
```

- [ ] **Step 2: Add config migration to `docker_project.rs`**

Change `config_path()` to return `projects.json`. Add `migrate_config()` that merges old files.

```rust
fn config_path() -> Result<std::path::PathBuf, String> {
    let config_dir = dirs::config_dir().ok_or("Cannot find config directory")?;
    let app_dir = config_dir.join("colima-desktop");
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create config dir: {}", e))?;
    Ok(app_dir.join("projects.json"))
}

fn migrate_config_if_needed() -> Result<(), String> {
    let new_path = config_path()?;
    if new_path.exists() {
        return Ok(());
    }

    let config_dir = new_path.parent().unwrap();
    let old_docker = config_dir.join("docker-projects.json");
    let old_devcontainer = config_dir.join("devcontainer-projects.json");

    let mut projects: Vec<Project> = Vec::new();

    // Migrate docker-projects.json
    if old_docker.exists() {
        if let Ok(content) = std::fs::read_to_string(&old_docker) {
            if let Ok(config) = serde_json::from_str::<ProjectsConfig>(&content) {
                projects.extend(config.projects);
            }
        }
    }

    // Migrate devcontainer-projects.json
    if old_devcontainer.exists() {
        if let Ok(content) = std::fs::read_to_string(&old_devcontainer) {
            // Old format: { projects: [{ id, workspace_path, name }] }
            #[derive(serde::Deserialize)]
            struct OldDevContainerProject {
                id: String,
                workspace_path: String,
                name: String,
            }
            #[derive(serde::Deserialize)]
            struct OldConfig {
                projects: Vec<OldDevContainerProject>,
            }
            if let Ok(old_config) = serde_json::from_str::<OldConfig>(&content) {
                for old in old_config.projects {
                    // Skip if already exists (added via docker-projects.json)
                    if projects.iter().any(|p| p.workspace_path == old.workspace_path) {
                        continue;
                    }
                    projects.push(Project {
                        id: old.id,
                        name: old.name,
                        workspace_path: old.workspace_path,
                        project_type: "devcontainer".to_string(),
                        env_vars: Vec::new(),
                        dotenv_path: None,
                        watch_mode: false,
                        remote_debug: false,
                        debug_port: 9229,
                        compose_file: None,
                        dockerfile: None,
                        service_name: None,
                        env_command: None,
                        ports: Vec::new(),
                        startup_command: None,
                    });
                }
            }
        }
    }

    if !projects.is_empty() || old_docker.exists() || old_devcontainer.exists() {
        save_projects(&projects)?;
        // Backup old files
        if old_docker.exists() {
            let _ = std::fs::rename(&old_docker, config_dir.join("docker-projects.json.bak"));
        }
        if old_devcontainer.exists() {
            let _ = std::fs::rename(&old_devcontainer, config_dir.join("devcontainer-projects.json.bak"));
        }
    }

    Ok(())
}
```

Update `load_projects()` to call migration first:

```rust
fn load_projects() -> Result<Vec<Project>, String> {
    migrate_config_if_needed()?;
    let path = config_path()?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    let content =
        std::fs::read_to_string(&path).map_err(|e| format!("Failed to read config: {}", e))?;
    let config: ProjectsConfig =
        serde_json::from_str(&content).map_err(|e| format!("Failed to parse config: {}", e))?;
    Ok(config.projects)
}
```

- [ ] **Step 3: Update all type references in `docker_project.rs`**

Replace all `DockerProject` with `Project`, `DockerProjectWithStatus` with `ProjectWithStatus`, `DockerProjectsConfig` with `ProjectsConfig` throughout the file. Also update the imports from `cli::types`.

- [ ] **Step 4: Verify Rust compiles**

Run: `cd src-tauri && cargo check 2>&1 | head -30`
Expected: Compilation succeeds (warnings OK, errors not)

- [ ] **Step 5: Commit**

```
git add -A && git commit -m "refactor: rename DockerProject to Project, add config migration"
```

---

### Task 2: Absorb devcontainer.rs into project.rs

**Files:**
- Modify: `src-tauri/src/commands/docker_project.rs` (absorb devcontainer functions)
- Delete: `src-tauri/src/commands/devcontainer.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Move `find_devcontainer_cli()` to `docker_project.rs`**

Copy the function from `devcontainer.rs` lines 43-65 into `docker_project.rs`. This is a helper used by the devcontainer lifecycle commands already present in `docker_project.rs`.

```rust
fn find_devcontainer_cli() -> Option<String> {
    let candidates = [
        "/opt/homebrew/bin/devcontainer",
        "/usr/local/bin/devcontainer",
    ];
    for path in candidates {
        if std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }
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
```

- [ ] **Step 2: Add `check_devcontainer_cli` command to `docker_project.rs`**

```rust
#[tauri::command]
pub async fn check_devcontainer_cli() -> Result<bool, String> {
    Ok(find_devcontainer_cli().is_some())
}
```

- [ ] **Step 3: Delete `devcontainer.rs`**

Remove the file entirely: `src-tauri/src/commands/devcontainer.rs`

- [ ] **Step 4: Update `mod.rs` — remove devcontainer module**

Change `src-tauri/src/commands/mod.rs`:

```rust
pub mod app_settings;
pub mod colima;
pub mod container;
pub mod docker_project;
pub mod docker_settings;
pub mod image;
pub mod mounts;
pub mod network;
pub mod network_settings;
pub mod vm_settings;
pub mod devcontainer_config;
pub mod onboarding;
pub mod update;
pub mod volume;
```

(Remove `pub mod devcontainer;` line)

- [ ] **Step 5: Update `lib.rs` — replace devcontainer commands with docker_project equivalents**

Replace lines 51-58 (the `commands::devcontainer::*` block) with a single entry pointing to the new location:

```rust
commands::docker_project::check_devcontainer_cli,
```

Remove these lines (the old devcontainer commands that are now redundant):
- `commands::devcontainer::list_devcontainer_projects`
- `commands::devcontainer::add_devcontainer_project`
- `commands::devcontainer::remove_devcontainer_project`
- `commands::devcontainer::devcontainer_up`
- `commands::devcontainer::devcontainer_build`
- `commands::devcontainer::devcontainer_stop`
- `commands::devcontainer::devcontainer_read_config`

The existing `docker_project` commands already handle devcontainer lifecycle via `project_type` branching.

Also rename the docker_project commands to use the new names. Replace lines 65-76:

```rust
commands::docker_project::detect_project_type,
commands::docker_project::list_projects,
commands::docker_project::add_project,
commands::docker_project::update_project,
commands::docker_project::remove_project,
commands::docker_project::project_up,
commands::docker_project::project_stop,
commands::docker_project::project_logs,
commands::docker_project::project_rebuild,
commands::docker_project::load_dotenv_file,
commands::docker_project::run_env_command,
commands::docker_project::open_terminal_exec,
```

- [ ] **Step 6: Rename command functions in `docker_project.rs`**

Rename all `#[tauri::command]` functions:
- `list_docker_projects` -> `list_projects`
- `add_docker_project` -> `add_project`
- `update_docker_project` -> `update_project`
- `remove_docker_project` -> `remove_project`
- `docker_project_up` -> `project_up`
- `docker_project_stop` -> `project_stop`
- `docker_project_logs` -> `project_logs`
- `docker_project_rebuild` -> `project_rebuild`

- [ ] **Step 7: Verify Rust compiles**

Run: `cd src-tauri && cargo check 2>&1 | head -30`
Expected: Compilation succeeds

- [ ] **Step 8: Commit**

```
git add -A && git commit -m "refactor: absorb devcontainer.rs into project.rs, rename commands"
```

---

### Task 3: Rename devcontainer_config.rs to project_config.rs

**Files:**
- Rename: `src-tauri/src/commands/devcontainer_config.rs` -> `src-tauri/src/commands/project_config.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Rename the file**

```bash
mv src-tauri/src/commands/devcontainer_config.rs src-tauri/src/commands/project_config.rs
```

- [ ] **Step 2: Update `mod.rs`**

Replace `pub mod devcontainer_config;` with `pub mod project_config;`

- [ ] **Step 3: Update `lib.rs`**

Replace `commands::devcontainer_config::` with `commands::project_config::` for all three commands.

- [ ] **Step 4: Rename `docker_project.rs` to `project.rs`**

```bash
mv src-tauri/src/commands/docker_project.rs src-tauri/src/commands/project.rs
```

Update `mod.rs`: replace `pub mod docker_project;` with `pub mod project;`
Update `lib.rs`: replace all `commands::docker_project::` with `commands::project::`

- [ ] **Step 5: Verify Rust compiles**

Run: `cd src-tauri && cargo check 2>&1 | head -30`
Expected: Compilation succeeds

- [ ] **Step 6: Commit**

```
git add -A && git commit -m "refactor: rename command modules (project.rs, project_config.rs)"
```

---

### Task 4: Update Frontend Types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Replace type definitions**

Remove `DevContainerProject` (lines 156-162), `DevContainerConfig` (lines 164-169), and `DockerProject` (lines 186-204). Replace with unified `Project`:

```typescript
export interface Project {
  id: string;
  name: string;
  workspace_path: string;
  project_type: ProjectType;
  env_vars: EnvVarEntry[];
  dotenv_path: string | null;
  env_command: string | null;
  ports: string[];
  watch_mode: boolean;
  remote_debug: boolean;
  debug_port: number;
  compose_file: string | null;
  dockerfile: string | null;
  service_name: string | null;
  startup_command: string | null;
  // Runtime (from backend, not persisted)
  status: "running" | "stopped" | "not_created" | "path_missing" | "unknown";
  container_ids: string[];
}
```

Keep `ProjectType`, `EnvVarEntry`, `ProjectTypeDetection`, `DevcontainerConfigResponse`, `DevcontainerValidationError`, `ConfigTab`, `DevcontainerSourceType` unchanged.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: Type errors in files that still import `DockerProject` or `DevContainerProject` (this is expected — we fix them next)

- [ ] **Step 3: Commit**

```
git add src/types/index.ts && git commit -m "refactor: unify frontend types (Project replaces DockerProject + DevContainerProject)"
```

---

### Task 5: Update Frontend API Layer

**Files:**
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: Replace API functions**

Remove the separate devcontainer API block (lines 55-68: `checkDevcontainerCli` through `devcontainerReadConfig`). Remove docker project block (lines 73-97). Replace with unified project API:

```typescript
// Projects (unified)
checkDevcontainerCli: () => invoke<boolean>("check_devcontainer_cli"),
detectProjectType: (workspacePath: string) =>
  invoke<ProjectTypeDetection>("detect_project_type", { workspacePath }),
listProjects: () =>
  invoke<Project[]>("list_projects"),
addProject: (params: { name: string; workspacePath: string; projectType: string; composeFile?: string; dockerfile?: string }) =>
  invoke<Project>("add_project", params),
updateProject: (project: Omit<Project, "status" | "container_ids">) =>
  invoke<void>("update_project", { project }),
removeProject: (id: string, stopContainers: boolean) =>
  invoke<void>("remove_project", { id, stopContainers }),
projectUp: (id: string) =>
  invoke<void>("project_up", { id }),
projectStop: (id: string) =>
  invoke<void>("project_stop", { id }),
projectLogs: (id: string) =>
  invoke<void>("project_logs", { id }),
projectRebuild: (id: string) =>
  invoke<void>("project_rebuild", { id }),
loadDotenvFile: (filePath: string) =>
  invoke<EnvVarEntry[]>("load_dotenv_file", { filePath }),
runEnvCommand: (command: string, workspacePath: string) =>
  invoke<EnvVarEntry[]>("run_env_command", { command, workspacePath }),
openTerminalExec: (containerId: string) =>
  invoke<void>("open_terminal_exec", { containerId }),
```

Update the import line at top to import `Project` instead of `DockerProject` and remove `DevContainerProject`, `DevContainerConfig`.

- [ ] **Step 2: Commit**

```
git add src/lib/tauri.ts && git commit -m "refactor: unify frontend API layer"
```

---

### Task 6: Unify Frontend Hooks

**Files:**
- Create: `src/hooks/useProjects.ts`
- Rename: `src/hooks/useDevcontainerConfig.ts` -> `src/hooks/useProjectConfig.ts`
- Delete: `src/hooks/useDockerProjects.ts`
- Delete: `src/hooks/useDevcontainers.ts`

- [ ] **Step 1: Create `useProjects.ts`**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";
import type { Project, EnvVarEntry } from "../types";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects,
    refetchInterval: 3000,
  });
}

export function useDevcontainerCliCheck() {
  return useQuery({
    queryKey: ["devcontainer-cli-check"],
    queryFn: api.checkDevcontainerCli,
    staleTime: 60_000,
  });
}

export function useDetectProjectType(workspacePath: string) {
  return useQuery({
    queryKey: ["detect-project-type", workspacePath],
    queryFn: () => api.detectProjectType(workspacePath),
    enabled: !!workspacePath,
  });
}

export function useAddProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      name: string;
      workspacePath: string;
      projectType: string;
      composeFile?: string;
      dockerfile?: string;
    }) => api.addProject(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (project: Omit<Project, "status" | "container_ids">) =>
      api.updateProject(project),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useRemoveProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stopContainers }: { id: string; stopContainers: boolean }) =>
      api.removeProject(id, stopContainers),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useProjectAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "up" | "stop" | "rebuild" }) => {
      switch (action) {
        case "up":
          return api.projectUp(id);
        case "stop":
          return api.projectStop(id);
        case "rebuild":
          return api.projectRebuild(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["containers"] });
    },
  });
}

export function useProjectLogs() {
  return useMutation({
    mutationFn: (id: string) => api.projectLogs(id),
  });
}

export function useOpenTerminalExec() {
  return useMutation({
    mutationFn: (containerId: string) => api.openTerminalExec(containerId),
  });
}

export function useLoadDotenvFile() {
  return useMutation({
    mutationFn: (filePath: string) => api.loadDotenvFile(filePath),
  });
}

export function useRunEnvCommand() {
  return useMutation({
    mutationFn: ({ command, workspacePath }: { command: string; workspacePath: string }) =>
      api.runEnvCommand(command, workspacePath),
  });
}
```

- [ ] **Step 2: Rename `useDevcontainerConfig.ts` to `useProjectConfig.ts`**

```bash
mv src/hooks/useDevcontainerConfig.ts src/hooks/useProjectConfig.ts
```

Update internal imports if needed (none expected -- it imports from `../lib/tauri` which stays the same). The hook names (`useDevcontainerJsonConfig`, `useSaveDevcontainerConfig`, etc.) stay unchanged since they specifically operate on devcontainer.json files.

- [ ] **Step 3: Delete old hooks**

```bash
rm src/hooks/useDockerProjects.ts
rm src/hooks/useDevcontainers.ts
```

- [ ] **Step 4: Commit**

```
git add -A && git commit -m "refactor: unify hooks into useProjects.ts"
```

---

### Task 7: Update Sidebar and MainLayout

**Files:**
- Modify: `src/components/layout/Sidebar.tsx:6,76-84`
- Modify: `src/components/layout/MainLayout.tsx:4,16,28`

- [ ] **Step 1: Remove "Projects" from Sidebar**

In `Sidebar.tsx`, remove the Page type's "projects" option (line 6) and the Projects button (lines 76-84):

Change line 6:
```typescript
type Page = "containers" | "images" | "volumes" | "networks" | "settings";
```

Delete lines 76-84 (the Projects button block).

- [ ] **Step 2: Remove "projects" page from MainLayout**

In `MainLayout.tsx`:

Remove the `ProjectList` import (line 4):
```typescript
// DELETE: import { ProjectList } from "../projects/ProjectList";
```

Change the Page type (line 16):
```typescript
type Page = "containers" | "images" | "volumes" | "networks" | "settings";
```

Delete line 28:
```typescript
// DELETE: {activePage === "projects" && <ProjectList />}
```

- [ ] **Step 3: Commit**

```
git add -A && git commit -m "refactor: remove Projects page from sidebar and routing"
```

---

### Task 8: Create ProjectsTab and ProjectCard Components

**Files:**
- Create: `src/components/containers/ProjectsTab.tsx`
- Create: `src/components/containers/ProjectCard.tsx`

- [ ] **Step 1: Create `ProjectCard.tsx`**

```tsx
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Play, Square, RotateCw, Trash2 } from "lucide-react";
import type { Project } from "../../types";

interface ProjectCardProps {
  project: Project;
  onSelect: (project: Project) => void;
  onAction: (id: string, action: "up" | "stop" | "rebuild") => void;
  onRemove: (id: string) => void;
  disabled?: boolean;
}

const typeLabels: Record<string, string> = {
  compose: "Compose",
  dockerfile: "Dockerfile",
  devcontainer: "DevContainer",
};

export function ProjectCard({ project, onSelect, onAction, onRemove, disabled }: ProjectCardProps) {
  const isRunning = project.status === "running";

  return (
    <div
      className="glass-panel rounded-lg p-3 hover:bg-muted/30 cursor-pointer transition-colors"
      onClick={() => onSelect(project)}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className={`h-2 w-2 rounded-full shrink-0 ${
              isRunning ? "bg-[var(--status-running-text)]" : "bg-gray-400"
            }`}
            style={isRunning ? { boxShadow: "var(--status-running-glow)" } : undefined}
          />
          <span className="text-sm font-medium truncate">{project.name}</span>
          <Badge variant="outline" className="text-[10px] shrink-0">
            {typeLabels[project.project_type] ?? project.project_type}
          </Badge>
          {isRunning && (
            <Badge
              variant="default"
              className="text-[10px] bg-[var(--status-running-bg)] text-[var(--status-running-text)] border border-[var(--status-running-border)]"
            >
              Running
            </Badge>
          )}
        </div>
        <div className="flex gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {isRunning ? (
            <>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onAction(project.id, "rebuild")}
                disabled={disabled}
                title="Rebuild"
              >
                <RotateCw className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => onAction(project.id, "stop")}
                disabled={disabled}
                title="Stop"
              >
                <Square className="h-3.5 w-3.5" />
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => onAction(project.id, "up")}
              disabled={disabled}
              title="Start"
            >
              <Play className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={() => onRemove(project.id)}
            disabled={disabled}
            title="Remove"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1 truncate pl-4">
        {project.workspace_path}
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Create `ProjectsTab.tsx`**

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { useProjects, useProjectAction, useRemoveProject } from "../../hooks/useProjects";
import { ProjectCard } from "./ProjectCard";
import { AddProjectWizard } from "./AddProjectWizard";
import type { Project } from "../../types";

interface ProjectsTabProps {
  onSelectProject: (project: Project) => void;
}

export function ProjectsTab({ onSelectProject }: ProjectsTabProps) {
  const { data: projects, isLoading } = useProjects();
  const action = useProjectAction();
  const remove = useRemoveProject();
  const [showWizard, setShowWizard] = useState(false);

  if (showWizard) {
    return <AddProjectWizard onClose={() => setShowWizard(false)} />;
  }

  const disabled = action.isPending || remove.isPending;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Projects</h1>
        <Button size="sm" onClick={() => setShowWizard(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Add Project
        </Button>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}

      <div className="flex flex-col gap-2">
        {projects?.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onSelect={onSelectProject}
            onAction={(id, act) => action.mutate({ id, action: act })}
            onRemove={(id) => remove.mutate({ id, stopContainers: true })}
            disabled={disabled}
          />
        ))}
        {projects?.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground">
            No projects registered. Click "Add Project" to get started.
          </p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```
git add -A && git commit -m "feat: add ProjectsTab and ProjectCard components"
```

---

### Task 9: Create Unified ProjectDetail Component

**Files:**
- Create: `src/components/containers/ProjectDetail.tsx`

This component replaces both `projects/ProjectDetail.tsx` (env vars, ports, watch mode) and `containers/DevContainerGroup.tsx` (devcontainer config editor, build logs). It conditionally renders sections based on `project.project_type`.

- [ ] **Step 1: Create `ProjectDetail.tsx`**

Port the existing `projects/ProjectDetail.tsx` logic (env vars, ports, watch mode, action buttons, build logs) and add conditional devcontainer config editor. The feature matrix:

- All types: Start/Stop/Rebuild, env vars (manual), build logs, container terminal
- DevContainer: env script (env_command), watch mode, config editor (devcontainer.json), port mappings, remote debug
- Compose: watch mode (--watch)
- Dockerfile: port mappings, startup command, remote debug

The component should follow the same structure as the existing `projects/ProjectDetail.tsx` but with:
1. Import from `useProjects` instead of `useDockerProjects`
2. Type-conditional sections (e.g., `project.project_type === "devcontainer" && <EnvCommandSection />`)
3. DevcontainerConfigEditor integration for devcontainer type
4. Auto-save before start (already implemented in prior fix)

Use `projects/ProjectDetail.tsx` as the base template. Key changes:
- Replace `useUpdateDockerProject` with `useUpdateProject`
- Replace `useDockerProjectAction` with `useProjectAction`
- Replace `useLoadDotenvFile` and `useRunEnvCommand` imports from `useProjects`
- Replace `useOpenTerminalExec` import from `useProjects`
- Add a "Config" button that toggles the `DevcontainerConfigEditor` for devcontainer type
- Wrap env_command section in `{project.project_type === "devcontainer" && ...}`
- Wrap startup_command in `{project.project_type === "dockerfile" && ...}`
- Wrap compose-specific notes in `{project.project_type === "compose" && ...}`

- [ ] **Step 2: Commit**

```
git add -A && git commit -m "feat: add unified ProjectDetail component"
```

---

### Task 10: Update ContainerList and Clean Up Dead Components

**Files:**
- Modify: `src/components/containers/ContainerList.tsx`
- Move: `src/components/projects/AddProjectWizard.tsx` -> `src/components/containers/AddProjectWizard.tsx`
- Delete: `src/components/containers/DevContainerTab.tsx`
- Delete: `src/components/containers/DevContainerGroup.tsx`
- Delete: `src/components/projects/ProjectList.tsx`
- Delete: `src/components/projects/ProjectCard.tsx`
- Delete: `src/components/projects/ProjectDetail.tsx`

- [ ] **Step 1: Move AddProjectWizard**

```bash
mv src/components/projects/AddProjectWizard.tsx src/components/containers/AddProjectWizard.tsx
```

Update internal imports in AddProjectWizard.tsx:
- Change `useAddDockerProject`, `useDetectProjectType` to import from `../../hooks/useProjects`
- Change `useAddProject` (renamed) usage
- Replace `DockerProject` type references with `Project`

- [ ] **Step 2: Update ContainerList.tsx**

Replace the "containers" / "devcontainers" tab with "Running" / "Projects":

```tsx
import { useState, useMemo } from "react";
import { useContainers, usePruneContainers } from "../../hooks/useContainers";
import { ContainerRow } from "./ContainerRow";
import { ComposeGroup } from "./ComposeGroup";
import { ContainerLogs } from "./ContainerLogs";
import { ContainerRun } from "./ContainerRun";
import { ContainerDetail } from "./ContainerDetail";
import { ProjectsTab } from "./ProjectsTab";
import { ProjectDetail } from "./ProjectDetail";
import { Button } from "@/components/ui/button";
import type { Container, Project } from "../../types";

type Filter = "all" | "running" | "stopped";
type Tab = "running" | "projects";

interface ComposeGroupData {
  project: string;
  containers: Container[];
}

export function ContainerList() {
  const { data: containers, isLoading, error } = useContainers();
  const prune = usePruneContainers();
  const [filter, setFilter] = useState<Filter>("all");
  const [tab, setTab] = useState<Tab>("running");
  const [logsContainerId, setLogsContainerId] = useState<string | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project | null>(null);

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

  if (selectedProject) {
    return <ProjectDetail project={selectedProject} onBack={() => setSelectedProject(null)} />;
  }

  return (
    <div>
      {/* Tab Bar */}
      <div className="flex border-b border-[var(--glass-border)] mb-4">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "running"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setTab("running")}
        >
          Running
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "projects"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setTab("projects")}
        >
          Projects
        </button>
      </div>

      {/* Running Tab */}
      {tab === "running" && (
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

      {/* Projects Tab */}
      {tab === "projects" && <ProjectsTab onSelectProject={setSelectedProject} />}
    </div>
  );
}
```

- [ ] **Step 3: Delete dead components**

```bash
rm src/components/containers/DevContainerTab.tsx
rm src/components/containers/DevContainerGroup.tsx
rm src/components/projects/ProjectList.tsx
rm src/components/projects/ProjectCard.tsx
rm src/components/projects/ProjectDetail.tsx
```

If `src/components/projects/` directory is now empty, remove it:
```bash
rmdir src/components/projects/ 2>/dev/null || true
```

- [ ] **Step 4: Fix any remaining import references**

Search for any remaining imports of deleted files or old hook/type names:
```bash
grep -r "useDockerProjects\|useDevcontainers\|DevContainerTab\|DevContainerGroup\|ProjectList\|DockerProject\|DevContainerProject" src/ --include="*.ts" --include="*.tsx" -l
```

Fix each file found.

- [ ] **Step 5: Verify TypeScript compiles**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: No errors

- [ ] **Step 6: Verify Rust compiles**

Run: `cd src-tauri && cargo check 2>&1 | head -30`
Expected: No errors

- [ ] **Step 7: Commit**

```
git add -A && git commit -m "refactor: unify UI — Running/Projects tabs, remove dead components"
```

---

## Post-Implementation Verification

After all tasks are complete:

1. `cd src-tauri && cargo check` — Rust compiles clean
2. `npx tsc --noEmit` — TypeScript compiles clean
3. Manual test: `npm run tauri dev`
   - Sidebar has no "Projects" entry
   - Containers page has "Running" and "Projects" tabs
   - Projects tab lists all registered projects (compose, dockerfile, devcontainer)
   - Clicking a project opens ProjectDetail with type-appropriate sections
   - Start/Stop/Rebuild works for all project types
   - Config editor works for devcontainer projects
   - Running tab shows all containers as before
4. Config migration: check that `~/.config/colima-desktop/projects.json` exists and old files are `.bak`
