# Multi-Service Project Design

## Summary

하나의 프로젝트에서 여러 컨테이너(서비스)를 실행할 수 있도록 한다. Docker Compose와 유사한 멀티 서비스 오케스트레이션을 프로젝트 설정 UI에서 지원하며, Compose YAML import/export도 가능하게 한다.

## 동작 모드

- `services.length === 0` → **단일 모드**: 기존 방식대로 최상위 설정으로 컨테이너 1개 실행
- `services.length > 0` → **멀티 서비스 모드**: 각 서비스를 별도 컨테이너로 실행. 최상위 설정은 서비스 기본값(템플릿) 역할

## 데이터 모델

### Service (신규)

```rust
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Service {
    pub id: String,
    pub name: String,                    // 서비스명 (필수, 고유)
    pub image: Option<String>,           // 기존 이미지 (null이면 프로젝트 image 상속 안함 - dockerfile 사용)
    pub dockerfile: Option<String>,      // Dockerfile 경로 (null이면 프로젝트 dockerfile 상속)
    pub ports: Vec<String>,              // 서비스 고유 포트 (상속 없음)
    pub volumes: Option<Vec<VolumeMount>>, // null이면 프로젝트 volumes 상속
    pub watch_mode: Option<bool>,        // null이면 프로젝트 watch_mode 상속
    pub startup_command: Option<String>, // 서비스 고유 (상속 없음)
    pub remote_debug: Option<bool>,      // null이면 프로젝트 remote_debug 상속
    pub debug_port: Option<u16>,         // null이면 프로젝트 debug_port 상속
    pub env_vars: Vec<EnvVarEntry>,      // 프로젝트 env_vars와 병합 (서비스가 우선)
    pub network: Option<String>,         // null이면 프로젝트 network 상속
}
```

TypeScript:
```typescript
interface Service {
  id: string;
  name: string;
  image: string | null;
  dockerfile: string | null;
  ports: string[];
  volumes: VolumeMount[] | null;     // null = 프로젝트 기본값 상속
  watch_mode: boolean | null;        // null = 상속
  startup_command: string | null;
  remote_debug: boolean | null;      // null = 상속
  debug_port: number | null;         // null = 상속
  env_vars: EnvVarEntry[];
  network: string | null;            // null = 상속
}
```

### Project 확장

```rust
// Project struct에 추가
#[serde(default)]
pub services: Vec<Service>,
```

### ProjectWithStatus 확장

```rust
pub services: Vec<Service>,
// container_ids를 서비스별로 추적
pub service_statuses: Vec<ServiceStatus>,
```

```rust
#[derive(Debug, Serialize, Clone)]
pub struct ServiceStatus {
    pub service_id: String,
    pub service_name: String,
    pub status: String,          // "running" | "stopped" | "not_created"
    pub container_id: Option<String>,
}
```

TypeScript:
```typescript
interface ServiceStatus {
  service_id: string;
  service_name: string;
  status: "running" | "stopped" | "not_created";
  container_id: string | null;
}

// Project에 추가
services: Service[];
service_statuses: ServiceStatus[];
```

## 상속 규칙

| 필드 | 상속 방식 |
|------|----------|
| `network` | 서비스 값이 null이면 프로젝트 network 사용 |
| `watch_mode` | 서비스 값이 null이면 프로젝트 watch_mode 사용 |
| `volumes` | 서비스 값이 null이면 프로젝트 volumes 사용, 아니면 서비스 것만 |
| `remote_debug` | 서비스 값이 null이면 프로젝트 remote_debug 사용 |
| `debug_port` | 서비스 값이 null이면 프로젝트 debug_port 사용 |
| `env_vars` | **병합**: 프로젝트 env_vars + 서비스 env_vars (같은 key는 서비스가 우선) |
| `image` | 상속 없음 — 서비스 자체에서 image 또는 dockerfile 중 하나 필수 |
| `dockerfile` | 서비스 값이 null이면 프로젝트 dockerfile 상속 |
| `ports` | 상속 없음 — 서비스 고유 |
| `startup_command` | 상속 없음 — 서비스 고유 |
| `init_commands` | 프로젝트 레벨에서만 — 모든 서비스 시작 전 호스트에서 1회 실행 |

## 컨테이너 네이밍

- 단일 모드: `acd-project-{id_8자}` (기존)
- 멀티 모드: `acd-project-{id_8자}-{service_name}`

## 백엔드 실행 플로우

### `project_up` (멀티 서비스 모드)

1. **Init commands** — 프로젝트 `init_commands` 순차 실행 (1회)
2. **각 서비스에 대해** (동시 시작, 의존성 없음):
   a. 서비스 설정 resolve (상속 적용)
   b. 이미지 결정: service.image → build from service.dockerfile (or project.dockerfile)
   c. 컨테이너 실행: resolved 설정으로 `container run`
3. **로그 이벤트**: `docker-project-log-{project_id}` (전체) + `docker-service-log-{project_id}-{service_id}` (서비스별)

### `project_stop` (멀티 서비스 모드)

모든 서비스 컨테이너 stop/rm.

### `project_rebuild` (멀티 서비스 모드)

전체 stop → 전체 up.

### 상태 조회

`get_dockerfile_status` 확장: 멀티 모드에서는 각 서비스별 컨테이너 이름으로 상태 조회 → `service_statuses` 배열 반환. 프로젝트 전체 status는:
- 하나라도 running이면 "running"
- 모두 stopped이면 "stopped"
- 모두 not_created이면 "not_created"

## Tauri Commands 변경

### 기존 커맨드 수정

- `project_up` — services 여부에 따라 단일/멀티 분기
- `project_stop` — 멀티 모드 시 모든 서비스 stop
- `project_rebuild` — 멀티 모드 시 모든 서비스 rebuild
- `list_projects` — `service_statuses` 포함하여 반환

### 신규 커맨드

- `add_service(project_id, service)` → `Project` 반환
- `update_service(project_id, service)` → `Project` 반환
- `remove_service(project_id, service_id)` → `Project` 반환
- `import_compose(project_id, file_path)` → `Project` 반환 (YAML 파싱 → services 생성)
- `export_compose(project_id, file_path)` → void (services → YAML 변환 → 파일 쓰기)

## Compose Import/Export

### Import 지원 필드

`docker-compose.yml` 파싱 시 변환하는 필드:

| Compose 필드 | Service 필드 |
|-------------|-------------|
| `services.*.image` | `image` |
| `services.*.build` (string) | `dockerfile` (경로) |
| `services.*.build.dockerfile` | `dockerfile` |
| `services.*.ports` | `ports` |
| `services.*.volumes` (short syntax) | `volumes` |
| `services.*.environment` (map/list) | `env_vars` (source: "manual") |
| `services.*.networks` (첫 번째) | `network` |
| `services.*.command` | `startup_command` |

미지원 필드는 무시하고 로그에 경고 출력.

### Export

services 배열 → compose YAML `version: "3"` 형식으로 변환. 프로젝트 레벨 network이 있으면 `networks:` 섹션 포함.

### YAML 파싱

Rust: `serde_yaml` crate 사용.

## 프론트엔드 변경

### ProjectDetail.tsx

기존 섹션 구조 위에:

1. **Services 섹션** (신규) — Environment Variables 위, Volumes 아래에 배치
   - 서비스 목록 (카드 형태)
   - 각 서비스 카드: 이름, 이미지/Dockerfile, 상태 뱃지, expand/collapse
   - "Add Service" 버튼
   - "Import from Compose" 버튼
   - "Export to Compose" 버튼
   - 서비스가 있으면 최상위 설정 섹션에 "(defaults)" 라벨 표시

2. **서비스 편집** — 카드 확장 시 인라인 편집
   - Image Source (Dockerfile / 기존 이미지)
   - Ports
   - Volumes (null = "Inherit from project" 체크박스)
   - Startup Command
   - Remote Debug
   - Network (null = "Inherit from project")
   - 서비스별 환경변수

3. **Running Containers** — 멀티 모드 시 서비스별로 그룹화
   - 서비스명 + 상태 뱃지 + 컨테이너 ID + 터미널 버튼

### hooks/useProjects.ts

신규 mutation hooks:
- `useAddService()`
- `useUpdateService()`
- `useRemoveService()`
- `useImportCompose()`
- `useExportCompose()`

### types/index.ts

- `Service` interface 추가
- `ServiceStatus` interface 추가
- `Project`에 `services`, `service_statuses` 추가

## 데이터 마이그레이션

`serde(default)` 사용:
- `services` → `[]` (기존 프로젝트는 단일 모드로 유지)
- `service_statuses` → `[]`

기존 projects.json과 완전 호환. 마이그레이션 불필요.

## Scope Out

- 서비스 간 의존성/시작 순서 (향후)
- 헬스체크 기반 대기 (향후)
- 서비스 개별 start/stop (향후 — 현재는 프로젝트 단위만)
- Compose 확장 필드 (`restart`, `healthcheck`, `depends_on` 등)
- 서비스별 로그 탭 분리 UI (향후 — 현재는 통합 로그)
