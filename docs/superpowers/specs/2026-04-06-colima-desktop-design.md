# Colima Desktop - Design Spec

## Overview

Colima를 GUI로 사용할 수 있게 해주는 macOS 데스크탑 앱. Docker Desktop의 팀 내 대체재로 사용.

## Target Users

- 팀원들에게 배포하는 Docker Desktop 대체 도구
- macOS 사용자 (Colima가 macOS 전용)

## Tech Stack

| Layer | Technology | Role |
|-------|-----------|------|
| Frontend | React 19 + TypeScript | UI rendering |
| UI Library | Shadcn/ui + Tailwind CSS | Components, styling |
| State Management | TanStack Query | CLI result caching, periodic polling |
| Desktop Shell | Tauri v2 | Window, system tray, IPC |
| Backend | Rust (Tauri commands) | CLI execution, JSON parsing, state management |
| Build | Vite | Frontend bundling |

## Architecture

```
┌─────────────────────────────────────┐
│         System Tray (항상 상주)        │
│   상태 표시 / Quick Actions / 메뉴     │
└──────────────┬──────────────────────┘
               │
┌──────────────▼──────────────────────┐
│          Main Window (React)         │
│  ┌───────────┬───────────────────┐  │
│  │ Sidebar   │   Content Area    │  │
│  │           │                   │  │
│  │ Containers│  컨테이너 목록/상세  │  │
│  │ Images    │  이미지 목록/관리    │  │
│  │ (Settings)│  (설정 - 추후)     │  │
│  └───────────┴───────────────────┘  │
└──────────────────────────────────────┘
               │ Tauri Command (invoke)
┌──────────────▼──────────────────────┐
│        Rust Backend (Tauri)          │
│  ┌────────────┐  ┌───────────────┐  │
│  │ CLI Runner │  │ State Manager │  │
│  │ colima ... │  │ polling/cache │  │
│  │ docker ... │  │               │  │
│  └────────────┘  └───────────────┘  │
└──────────────────────────────────────┘
```

## Communication Strategy

CLI 래핑 방식으로 colima/docker CLI를 child process로 실행하고 출력을 파싱한다.

- Colima 관리: `colima start/stop/status/list`
- 컨테이너: `docker ps -a --format json`, `docker start/stop/rm`, `docker logs -f`
- 이미지: `docker images --format json`, `docker pull`, `docker rmi`

JSON format 출력을 사용하여 파싱 안정성을 확보한다.

## Features (Priority Order)

### Phase 1 (MVP)

#### 1. System Tray

- Colima VM 상태 아이콘 (running: green, stopped: gray)
- Quick Actions 메뉴: Start / Stop / Restart
- 메인 윈도우 열기/닫기
- 로그인 시 자동 시작 옵션 (macOS launch agent)

#### 2. Container Management

- 컨테이너 목록 조회 (`docker ps -a --format json`, 3초 polling)
- 상태별 필터링 (running / stopped / all)
- 컨테이너 액션: Start / Stop / Restart / Remove
- 로그 보기: `docker logs -f` 스트리밍 (Tauri event system 활용)
- 컨테이너 기본 정보 표시: name, image, status, ports, created

#### 3. Image Management

- 이미지 목록 조회 (`docker images --format json`)
- 이미지 Pull: 이미지명 입력 → `docker pull` (진행 상태 표시)
- 이미지 Remove: `docker rmi`
- 용량 표시, 총 디스크 사용량 요약
- 사용/미사용(dangling) 이미지 구분

### Phase 2 (Future)

#### 4. VM Management

- Colima start/stop/restart with custom options
- CPU/Memory/Disk 설정 UI
- 프로필(profile) 관리: 생성, 전환, 삭제

#### 5. Kubernetes

- k8s 클러스터 on/off
- 상태 모니터링

## Backend Structure (Rust)

```
src-tauri/src/
├── main.rs              # Tauri app entry point, plugin registration
├── tray.rs              # System tray setup and event handling
├── commands/
│   ├── mod.rs
│   ├── colima.rs        # colima start/stop/status/list
│   ├── container.rs     # docker ps, logs, start/stop/rm
│   └── image.rs         # docker images, pull, rmi
└── cli/
    ├── mod.rs
    ├── executor.rs      # Command execution + output parsing
    └── types.rs         # CLI output type definitions (serde)
```

### Key Rust Types

```rust
#[derive(Serialize, Deserialize)]
pub struct Container {
    pub id: String,
    pub name: String,
    pub image: String,
    pub status: String,
    pub state: String,       // running, exited, etc.
    pub ports: String,
    pub created: String,
}

#[derive(Serialize, Deserialize)]
pub struct Image {
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
    pub created: String,
}

#[derive(Serialize, Deserialize)]
pub struct ColimaStatus {
    pub running: bool,
    pub runtime: String,
    pub arch: String,
    pub cpus: u32,
    pub memory: u64,
    pub disk: u64,
}
```

### Tauri Commands

```rust
#[tauri::command]
async fn list_containers() -> Result<Vec<Container>, String>;

#[tauri::command]
async fn container_action(id: String, action: String) -> Result<(), String>;

#[tauri::command]
async fn stream_container_logs(app: AppHandle, id: String) -> Result<(), String>;

#[tauri::command]
async fn list_images() -> Result<Vec<Image>, String>;

#[tauri::command]
async fn pull_image(app: AppHandle, name: String) -> Result<(), String>;

#[tauri::command]
async fn remove_image(id: String) -> Result<(), String>;

#[tauri::command]
async fn colima_status() -> Result<ColimaStatus, String>;

#[tauri::command]
async fn colima_action(action: String) -> Result<(), String>;
```

## Frontend Structure

```
src/
├── App.tsx
├── main.tsx
├── components/
│   ├── layout/
│   │   ├── Sidebar.tsx
│   │   └── MainLayout.tsx
│   ├── containers/
│   │   ├── ContainerList.tsx
│   │   ├── ContainerRow.tsx
│   │   └── ContainerLogs.tsx
│   └── images/
│       ├── ImageList.tsx
│       ├── ImageRow.tsx
│       └── ImagePull.tsx
├── hooks/
│   ├── useContainers.ts     # TanStack Query + tauri invoke
│   ├── useImages.ts
│   └── useColimaStatus.ts
├── lib/
│   └── tauri.ts             # Tauri command wrappers
└── types/
    └── index.ts             # Shared TypeScript types
```

### Data Flow

```
React Component
  → useContainers() hook (TanStack Query, 3s polling)
    → invoke("list_containers")
      → Rust: Command::new("docker").args(["ps", "-a", "--format", "json"])
        → Parse JSON → Vec<Container>
          → Return to React → Render
```

### Log Streaming Flow

```
ContainerLogs component
  → invoke("stream_container_logs", { id })
    → Rust: spawn `docker logs -f <id>`
      → Tauri event emit per line → "container-log-{id}"
        → React: listen(event) → append to log buffer → render
```

## Distribution

- Tauri built-in bundler로 `.dmg` 생성
- GitHub Releases에 업로드
- Tauri updater plugin으로 인앱 자동 업데이트 지원
- macOS 코드 서명은 팀 내부 배포이므로 초기에는 생략 가능 (ad-hoc signing)

## Error Handling

- Colima가 설치되지 않은 경우: 설치 안내 화면 표시
- Colima가 stopped 상태에서 docker 명령 실행 시: "Colima를 먼저 시작하세요" 안내
- CLI 실행 타임아웃: 30초 기본, pull 등 장시간 작업은 별도 처리
- CLI 실행 실패 시: stderr 내용을 토스트 알림으로 표시

## Testing Strategy

- Rust 백엔드: CLI executor에 대한 unit test (mock command output)
- Frontend: React Testing Library로 컴포넌트 테스트
- E2E: 실제 Colima 환경에서 수동 테스트 (초기 단계)
