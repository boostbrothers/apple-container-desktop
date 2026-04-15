# Compose 필드를 Project 설정으로 통합

**Date**: 2026-04-15
**Status**: Approved (Approach A)

## Problem

docker-compose.yml을 import하면 networks와 volumes가 `compose_networks`, `compose_volumes`라는 별도 필드에 저장된다. 이 필드들이 프로젝트의 메인 설정과 분리되어 있어, 사용자 입장에서 "compose 전용" 설정처럼 보인다. 실제로는 프로젝트 수준의 네트워크/볼륨 정의이므로 프로젝트 설정에 통합되어야 한다.

## Solution: Rename + Serde Alias Migration

### Data Model Changes

**Rust (`src-tauri/src/cli/types.rs`)**:

```rust
// Before
pub struct ComposeNetwork { pub name: String, pub driver: Option<String> }
pub struct ComposeVolume { pub name: String, pub driver: Option<String> }

// After
pub struct ProjectNetwork { pub name: String, pub driver: Option<String> }
pub struct NamedVolume { pub name: String, pub driver: Option<String> }
```

**Project struct field changes**:

```rust
// Before
pub compose_networks: Vec<ComposeNetwork>,
pub compose_volumes: Vec<ComposeVolume>,

// After
#[serde(alias = "compose_networks")]
pub project_networks: Vec<ProjectNetwork>,
#[serde(alias = "compose_volumes")]
pub named_volumes: Vec<NamedVolume>,
```

`serde(alias)` ensures old `projects.json` files with `compose_networks`/`compose_volumes` keys are read correctly. New saves use the renamed keys only.

**TypeScript (`src/types/index.ts`)**:

```typescript
// Before
export interface ComposeNetwork { name: string; driver: string | null; }
export interface ComposeVolume { name: string; driver: string | null; }

// After
export interface ProjectNetwork { name: string; driver: string | null; }
export interface NamedVolume { name: string; driver: string | null; }
```

Project interface fields:

```typescript
// Before
compose_networks: ComposeNetwork[];
compose_volumes: ComposeVolume[];

// After
project_networks: ProjectNetwork[];
named_volumes: NamedVolume[];
```

### Files to Change

| File | Changes |
|------|---------|
| `src-tauri/src/cli/types.rs` | Rename types `ComposeNetwork` → `ProjectNetwork`, `ComposeVolume` → `NamedVolume`. Rename Project fields with `serde(alias)`. |
| `src-tauri/src/commands/project.rs` | Update all references: imports, `import_compose()`, `export_compose()`, `project_up()`, `create_project()`, save/load paths. |
| `src/types/index.ts` | Rename TS interfaces and Project fields. |
| `src/components/containers/ProjectDetail.tsx` | Rename state variables, update UI labels (remove "Compose" prefix). |
| `src/hooks/useProjects.ts` | Update field references if present. |

### Migration Strategy

- **Automatic via serde alias**: Old JSON with `compose_networks`/`compose_volumes` is deserialized into new field names transparently.
- **First save after upgrade**: Writes new field names (`project_networks`, `named_volumes`), permanently migrating the file.
- **No separate migration script needed**.

### UI Changes

- "Compose Networks" section → "Networks" (프로젝트 설정 내)
- "Compose Volumes" section → "Named Volumes" (프로젝트 설정 내)
- State variables: `composeNetworks` → `projectNetworks`, `composeVolumes` → `namedVolumes`

### Unchanged Behavior

- `project_up()` still creates networks/volumes before starting containers.
- `import_compose()` still parses docker-compose.yml into these fields.
- `export_compose()` still exports from these fields.
- Service-level `network` and `volumes` fields are untouched.
- Single-container `project.network` field is untouched.

### Out of Scope

- Multi-network support per project (remains as `project_networks` list, each service picks one via `service.network`)
- `hostname`, `container_name` compose fields (not currently parsed, separate enhancement)
- UI redesign beyond label changes
