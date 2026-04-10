# Container & Project Unification Design

## Problem

Containers, Compose, DevContainers, Projects가 유기적으로 통합되어 있지 않다.

- `docker-projects.json`과 `devcontainer-projects.json` 두 config 파일이 별도 존재
- `docker_project.rs`와 `devcontainer.rs`가 같은 devcontainer CLI를 호출하면서 별개 config 사용
- `DockerProject`, `DevContainerProject`, `Container` 세 타입이 같은 개념을 다르게 표현
- DevContainers가 3곳(Containers 탭, Dev Containers 서브탭, Projects 페이지)에서 중복 노출
- `["docker-projects"]`와 `["devcontainer-projects"]` 쿼리키가 독립적으로 캐싱

## Solution

Bottom-Up 통합: 데이터 모델 -> 백엔드 -> Hook -> UI 순으로 정리.

- Projects 페이지를 제거
- Containers 탭을 "Running" / "Projects" 서브탭으로 재구성
- DevContainer 프로젝트에 env script, watch/rebuild 등 기존 Projects의 기능을 흡수
- Compose/Dockerfile 프로젝트는 lightweight 관리 (start/stop/rebuild)

---

## Phase 1: Data Model Unification

### Single Config File

Before:
- `~/.config/colima-desktop/docker-projects.json` (DockerProject array)
- `~/.config/colima-desktop/devcontainer-projects.json` (DevContainerProject array)

After:
- `~/.config/colima-desktop/projects.json` (Project array)

### Rust Type: Project

All projects share a common struct. Type-specific fields are optional and only used by the relevant project type.

Fields:
- id, name, workspace_path, project_type (enum: Compose, Dockerfile, DevContainer)
- Common: env_vars, dotenv_path, env_command, ports, watch_mode
- Compose-specific: compose_file, service_name
- Dockerfile-specific: dockerfile, startup_command
- Dockerfile + DevContainer: remote_debug, debug_port

Removed types:
- `DockerProject` (replaced by `Project`)
- `DevContainerProject` (replaced by `Project` with project_type=DevContainer)

### TypeScript Type: Project

Single `Project` interface replaces `DockerProject`, `DevContainerProject`, and `DevContainerConfig`.

Runtime-only fields (not persisted): status, container_ids.

### Config Migration

On `load_projects()`:
1. If `projects.json` exists, use it
2. If not, read `docker-projects.json` + `devcontainer-projects.json`, merge into `projects.json`
3. DevContainerProject entries converted: `{ workspace_path, name }` becomes `Project { project_type: "devcontainer", ... }`
4. Old files renamed to `.bak`

---

## Phase 2: Backend Command Consolidation

### File Changes

- `docker_project.rs` renamed to `project.rs`, absorbs `devcontainer.rs` logic
- `devcontainer_config.rs` renamed to `project_config.rs`
- `devcontainer.rs` deleted entirely
- `container.rs` unchanged (raw container queries)
- All other command modules unchanged

### project.rs Unified Command Set

CRUD: list_projects, add_project, update_project, remove_project

Lifecycle (branches on project_type):
- project_up -> compose_up | dockerfile_up | devcontainer_up
- project_stop -> compose_stop | dockerfile_stop | devcontainer_stop
- project_rebuild -> compose_rebuild | dockerfile_rebuild | devcontainer_rebuild
- project_logs

Env: load_dotenv_file, run_env_command

Utility: detect_project_type, open_terminal_exec, check_devcontainer_cli (moved from devcontainer.rs)

### project_config.rs (Renamed Only)

read_devcontainer_json, write_devcontainer_json, validate_devcontainer_json -- no logic change.

### Removed

- `devcontainer.rs` entire file
- `lib.rs` IPC registrations updated: old command names removed, new names registered

### CLI Types (cli/types.rs)

- `DockerProject` renamed to `Project`
- `DockerProjectWithStatus` renamed to `ProjectWithStatus`
- `DockerProjectsConfig` renamed to `ProjectsConfig`
- `DevContainerProject` struct removed

---

## Phase 3: Hook Layer Consolidation

### Before -> After

Before (3 files):
- useDockerProjects.ts with query key ["docker-projects"]
- useDevcontainers.ts with query key ["devcontainer-projects"]
- useDevcontainerConfig.ts with query key ["devcontainer-json"]

After (2 files):
- useProjects.ts with query key ["projects"]
- useProjectConfig.ts with query key ["project-config"] (rename only)

### useProjects.ts

Query: useProjects (list, 3s refetch), useProjectsByType (client filter)

Mutations: useAddProject, useUpdateProject, useRemoveProject, useProjectAction (up/stop/rebuild)

useProjectAction invalidates both ["projects"] and ["containers"] so the Running tab updates immediately.

Utility: useDetectProjectType, useLoadDotenvFile, useRunEnvCommand, useOpenTerminalExec

### Removed

- useDockerProjects.ts replaced by useProjects.ts
- useDevcontainers.ts deleted

---

## Phase 4: UI Restructure

### Navigation

Before sidebar: Containers | Projects | Images | Volumes | Networks | Settings
After sidebar: Containers | Images | Volumes | Networks | Settings

Projects sidebar item removed. MainLayout.tsx removes the "projects" page branch.

### Containers Tab Internal Structure

ContainerList.tsx with sub-tabs: "Running" | "Projects"

Running tab:
- All running containers (from useContainers, same as before)
- Compose groups (ComposeGroup.tsx, existing)
- DevContainer containers (grouped by devcontainer.local_folder label)
- Standalone containers

Projects tab:
- Registered projects (from useProjects)
- Project cards with type badge (compose/dockerfile/devcontainer)
- Click -> ProjectDetail view (full-screen transition)
- "+ Add Project" button -> AddProjectWizard

### ProjectDetail Feature Matrix by Type

Start/Stop/Rebuild: all types
Env vars (manual): all types
Env script (env_command): DevContainer only
Watch mode + auto-rebuild: DevContainer and Compose (--watch)
Config editor (devcontainer.json): DevContainer only
Port mappings: DevContainer and Dockerfile
Remote debug: DevContainer and Dockerfile
Startup command override: Dockerfile only
Build logs: all types

### Component File Changes

Modified:
- containers/ContainerList.tsx -- "Running" / "Projects" sub-tabs
- layout/Sidebar.tsx -- remove "Projects" item
- layout/MainLayout.tsx -- remove "projects" page branch

New:
- containers/ProjectsTab.tsx -- project list in Projects sub-tab
- containers/ProjectCard.tsx -- project card with type badge
- containers/ProjectDetail.tsx -- unified detail view, conditional sections by type

Moved:
- projects/AddProjectWizard.tsx -> containers/AddProjectWizard.tsx

Kept (no change):
- devcontainer-config/* -- imported by ProjectDetail for devcontainer type
- containers/ContainerRow.tsx, ContainerDetail.tsx, ContainerLogs.tsx
- containers/ComposeGroup.tsx, ContainerRun.tsx

Deleted:
- containers/DevContainerTab.tsx
- containers/DevContainerGroup.tsx
- projects/ProjectList.tsx
- projects/ProjectCard.tsx
- projects/ProjectDetail.tsx

---

## Implementation Order

Each phase is independently deployable. The app works after each phase.

1. Phase 1: Data model -- new Project type, config migration, both old command sets still work
2. Phase 2: Backend -- consolidate commands, remove devcontainer.rs, update lib.rs
3. Phase 3: Hooks -- useProjects.ts replaces two hooks, update all consumers
4. Phase 4: UI -- restructure Containers tab, remove Projects page, delete dead components

## Risk and Mitigation

- Config migration: Backup old files as .bak. Migration is simple JSON merge with field mapping.
- IPC rename: Frontend and backend must update in lockstep. Phase 2+3 should be sequential commits in one PR.
- Feature parity: ProjectDetail must cover all existing ProjectDetail + DevContainerTab features before deleting old components.
