# CLAUDE.md

## Project Overview

Apple Container Desktop — [Apple Container](https://github.com/apple/container)(macOS 네이티브 Linux 컨테이너 런타임)를 위한 네이티브 데스크톱 GUI 앱.

## Tech Stack

- **Desktop Framework**: Tauri 2 (Rust backend)
- **Frontend**: React 19 + TypeScript + Vite 7
- **UI**: shadcn/ui + Base UI + Tailwind CSS 4
- **State**: TanStack React Query
- **Icons**: Lucide React
- **Theme**: tauri-plugin-liquid-glass (macOS Liquid Glass / vibrancy)
- **Encryption**: AES-GCM (Rust) for secret storage
- **Container Runtime**: Apple Container CLI (`/usr/local/bin/container`)

## Project Structure

```
src/                    # React frontend
├── components/
│   ├── containers/     # Container list, rows, logs, project management
│   ├── images/         # Image list, rows, pull dialog
│   ├── volumes/        # Volume list, rows, create dialog
│   ├── networks/       # Network list, rows, create dialog
│   ├── environment/    # Global env profiles, env var table, Infisical config
│   ├── env/            # Project-level env management
│   ├── settings/       # Resource, registry, domain, terminal, appearance, update
│   ├── onboarding/     # Guided setup flow
│   ├── layout/         # Sidebar, main layout
│   └── ui/             # shadcn/ui primitives
├── hooks/              # React Query hooks
├── lib/                # Tauri API wrapper, utilities
└── types/              # TypeScript type definitions

src-tauri/              # Rust backend
├── src/
│   ├── cli/            # CLI executor (Apple Container commands)
│   ├── commands/       # Tauri IPC command handlers
│   │   ├── system.rs           # Container service status/start/stop/restart
│   │   ├── container.rs        # Container ops + stats + log streaming
│   │   ├── image.rs            # Image ops
│   │   ├── volume.rs           # Volume ops
│   │   ├── network.rs          # Network ops
│   │   ├── resource_settings.rs # Default container/builder resource settings
│   │   ├── registry_settings.rs # Registry login/logout/config
│   │   ├── project.rs          # Project management (Dockerfile)
│   │   ├── env_secrets.rs      # Project env + Infisical integration
│   │   ├── env_store.rs        # Global env store + encryption
│   │   ├── proxy.rs            # Domain DNS commands
│   │   ├── app_settings.rs     # App settings (terminal, shell)
│   │   ├── update.rs           # Version info
│   │   └── onboarding.rs       # Onboarding state
│   ├── proxy/          # Domain DNS configuration
│   │   └── config.rs           # Domain config management
│   ├── crypto.rs       # AES-GCM encryption for secrets
│   ├── tray.rs         # System tray menu
│   └── lib.rs          # App setup + plugin registration
└── tauri.conf.json     # Tauri configuration
```

## Development Commands

```bash
npm run tauri dev       # Development mode with hot reload
npm run tauri build     # Production build
npm run build           # Frontend-only build (tsc + vite)
```

## Architecture Notes

- App communicates with Apple Container via CLI subprocess execution (`/usr/local/bin/container`)
- Apple Container uses per-container lightweight VM architecture with XPC-based daemon communication (no Docker socket)
- Rust backend runs `container system status`, `container list`, `container run`, etc. and returns structured JSON via Tauri IPC
- Auto-updater configured via `tauri-plugin-updater` with GitHub Releases endpoint (stable + beta channels)
- **Liquid Glass UI는 반드시 항상 적용**: `tauri-plugin-liquid-glass` (macOS 26+ native, vibrancy fallback on older macOS, CSS gradient fallback on unsupported platforms). 프론트엔드 디자인/UI 수정 시 liquid glass 효과가 유지되는지 반드시 확인할 것
- **Container Domains**: Apple Container 내장 DNS(`container system dns create/delete/list`)를 통한 컨테이너 도메인 라우팅. 커스텀 도메인 접미사 지원
- **Environment Management**: 글로벌/프로젝트별 환경변수 프로파일, Infisical 연동, AES-GCM 암호화
- **Project Types**: Dockerfile 프로젝트 타입 지원 (자동 감지)
- **Resource Settings**: `container system property get/set`으로 기본 컨테이너/빌더 CPU/메모리 설정
- **Registry Management**: `container registry login/logout/list`로 레지스트리 관리
- CI/CD: GitHub Actions with `tauri-action` for macOS builds (aarch64)

## Apple Container CLI Reference

```bash
# System management
container system start/stop/status/version
container system property get/set <key> [value]
container system dns create/delete/list

# Container management
container run/list/start/stop/delete/inspect/logs/stats/exec/prune

# Image management
container image list/pull/push/delete/tag/save/load/prune
container build

# Volume management
container volume list/create/delete/inspect/prune

# Network management (macOS 26+)
container network list/create/delete/inspect/prune

# Registry
container registry login/logout/list

# Builder
container builder start/stop/delete/status
```

## Frontend Design Guidelines

- **DESIGN.md( @DESIGN.md ) 참고 필수**: UI 컴포넌트 디자인, 색상, 타이포그래피, 레이아웃 등 모든 프론트엔드 디자인 관련 작업 시 반드시 `DESIGN.md`를 참조할 것
- **Liquid Glass 우선**: 모든 UI 요소는 `tauri-plugin-liquid-glass`의 glass 효과와 조화를 이루도록 구현. `body`는 `transparent`를 유지하고, 컴포넌트는 반투명 배경 + `backdrop-filter`를 사용
- **Glass 클래스 활용**: `glass-panel`, `glass-card`, `glass-sidebar`, `glass-group`, `glass-section` 등 `App.css`에 정의된 glass utility 클래스 사용
- **Fixed 모달/다이얼로그**: `backdrop-filter`를 사용하는 부모 안에서 `position: fixed` 모달이 클리핑되므로, 반드시 `createPortal(... , document.body)`로 렌더링할 것

## Release Process

1. Tag: `git tag v0.x.x && git push origin v0.x.x`
2. GitHub Actions builds macOS (aarch64)
3. Draft release is created, assets uploaded, then published automatically
4. `latest.json` is generated for auto-updater
5. Pre-release tags (`-alpha`, `-beta`, `-rc`) update beta channel

## Signing Keys

- Updater public key is in `tauri.conf.json` → `plugins.updater.pubkey`
- Private key must be set as GitHub Secret: `TAURI_SIGNING_PRIVATE_KEY`
