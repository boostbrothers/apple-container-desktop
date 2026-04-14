# Project Settings Expansion Design

## Summary

기존 `ProjectDetail` UI에 6가지 설정 섹션을 추가하여 프로젝트 실행 환경을 세밀하게 제어할 수 있게 한다.

## New Fields on `Project`

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `image` | `string \| null` | `null` | 기존 이미지 이름 (설정 시 Dockerfile 빌드 건너뜀) |
| `network` | `string \| null` | `null` | `--network` 옵션으로 전달할 네트워크 이름 |
| `init_commands` | `string[]` | `[]` | 컨테이너 빌드/시작 **전에** 호스트에서 순차 실행되는 커맨드 목록 |
| `volumes` | `VolumeMount[]` | `[]` | 추가 볼륨 마운트 (호스트 경로 또는 named volume) |
| `watch_mode` | `bool` | `true` | workspace → `/app` 자동 볼륨 마운트 on/off |

기존 `remote_debug` / `debug_port`는 그대로 유지.

### VolumeMount Type

```typescript
interface VolumeMount {
  type: "bind" | "volume";        // bind = 호스트 경로, volume = named volume
  source: string;                 // 호스트 경로 또는 볼륨 이름
  target: string;                 // 컨테이너 내 경로
  readonly: boolean;              // :ro 옵션
}
```

Rust 측:

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VolumeMount {
    pub mount_type: String,  // "bind" | "volume"
    pub source: String,
    pub target: String,
    #[serde(default)]
    pub readonly: bool,
}
```

## Backend Changes

### `src-tauri/src/cli/types.rs`

- `Project` struct에 `image`, `network`, `init_commands`, `volumes`, `watch_mode` 필드 추가 (모두 `#[serde(default)]`)
- `ProjectWithStatus`에 동일 필드 추가
- `Project::with_status()`에 매핑 추가
- `VolumeMount` struct 추가

### `src-tauri/src/commands/project.rs`

#### `add_project` — 새 필드 기본값 설정

```rust
image: None,
network: None,
init_commands: Vec::new(),
volumes: Vec::new(),
watch_mode: true,
```

#### `project_up` / `dockerfile_up` — 실행 플로우 변경

**현재 플로우:**
1. Build image from Dockerfile
2. `container run` with workspace mount + env + ports

**새 플로우:**
1. **Init commands** — `init_commands`를 순차 실행 (`sh -c` in `workspace_path`). 실패 시 중단 + 로그 출력
2. **Image resolution** — `project.image`가 있으면 해당 이미지 사용, 없으면 Dockerfile 빌드
3. **Container run** 인자 구성:
   - `watch_mode == true`이면 기존처럼 `-v {workspace}:/app -w /app` 추가
   - `watch_mode == false`이면 workspace 마운트 생략
   - `volumes` 배열 순회: bind → `-v source:target[:ro]`, volume → `-v name:target[:ro]`
   - `network`이 있으면 `--network {name}` 추가
   - 기존 env, ports, debug, startup_command 로직 그대로

#### 새 Tauri command: `list_networks_for_project`

프로젝트 설정 UI에서 네트워크 드롭다운을 채우기 위해 기존 `list_networks`를 재사용하면 충분함. 별도 커맨드 불필요.

#### 새 Tauri command: `create_network_for_project`

기존 `create_network` 재사용. 별도 커맨드 불필요.

## Frontend Changes

### `src/types/index.ts`

- `VolumeMount` interface 추가
- `Project` interface에 `image`, `network`, `init_commands`, `volumes`, `watch_mode` 추가

### `src/components/containers/ProjectDetail.tsx`

기존 섹션 구조에 새 섹션을 추가. 순서:

1. **Domain** (기존)
2. **Image Source** (신규) — Dockerfile / 기존 이미지 선택 라디오
3. **Network** (신규) — 네트워크 선택 드롭다운 + 새 네트워크 생성
4. **Initialize Commands** (신규) — 순서 있는 커맨드 목록
5. **Volumes** (신규) — Watch Mode 토글 + 추가 볼륨 목록
6. **Execution Options** (기존, Remote Debug + Ports + Startup Command 포함)
7. **Environment Variables** (기존)

#### Image Source 섹션

- 라디오 버튼: "Build from Dockerfile" / "Use existing image"
- Dockerfile 선택 시: 기존 dockerfile 입력 필드
- 기존 이미지 선택 시: 이미지 이름 입력 (자동완성은 향후)

#### Network 섹션

- 드롭다운: "None (default)" + 네트워크 목록 (useNetworks hook)
- "+ Create Network" 버튼 → 인라인 이름 입력 + 생성

#### Initialize Commands 섹션

- 커맨드 목록 (Add/Remove)
- 각 항목은 텍스트 입력
- 호스트에서 실행됨을 안내하는 설명 텍스트
- 드래그 정렬은 향후 고려, 우선 위/아래 순서로

#### Volumes 섹션

- **Watch Mode** 토글 (workspace ↔ /app 마운트)
- 추가 볼륨 목록:
  - Type 선택: Bind Mount / Named Volume
  - Source: 호스트 경로 또는 볼륨 이름 (named volume은 드롭다운)
  - Target: 컨테이너 경로
  - Readonly 체크박스
  - Add/Remove 버튼

### `src/lib/tauri.ts`

- `updateProject` 호출 시 새 필드 포함 (기존 `Omit<Project, "status" | "container_ids">` 그대로)

### `src/hooks/useProjects.ts`

- 변경 없음 (기존 hooks로 충분)

### 네트워크/볼륨 데이터용 기존 hooks 활용

- `useNetworks()` — 네트워크 목록
- `useVolumes()` — named volume 목록
- `useCreateNetwork()` — 네트워크 생성

## Data Migration

`serde(default)` 사용으로 기존 `projects.json` 파일과 호환. 새 필드 미존재 시:
- `image` → `None`
- `network` → `None`
- `init_commands` → `[]`
- `volumes` → `[]`
- `watch_mode` → `true` (기존 동작 유지)

## Scope Out

- 이미지 자동완성/검색 (향후)
- 볼륨 마운트 드래그 정렬 (향후)
- Init command 드래그 정렬 (향후)
- Init command 실행 결과 개별 로그 표시 (단순 성공/실패만)
