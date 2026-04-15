# CLAUDE.md

## Project Overview

Colima Desktop — Colima(Docker container runtime on macOS)를 위한 네이티브 데스크톱 GUI 앱.

## Tech Stack

- **Desktop Framework**: Tauri 2 (Rust backend)
- **Frontend**: React 19 + TypeScript + Vite 7
- **UI**: shadcn/ui + Base UI + Tailwind CSS 4
- **State**: TanStack React Query
- **Icons**: Lucide React
- **Theme**: tauri-plugin-liquid-glass (macOS Liquid Glass / vibrancy)
- **Encryption**: AES-GCM (Rust) for secret storage

## Project Structure

```
src/                    # React frontend
├── components/
│   ├── containers/     # Container list, rows, compose groups, logs, project management
│   ├── images/         # Image list, rows, pull dialog
│   ├── volumes/        # Volume list, rows, create dialog
│   ├── networks/       # Network list, rows, create dialog
│   ├── environment/    # Global env profiles, env var table, Infisical config
│   ├── env/            # Project-level env management
│   ├── devcontainer-config/  # DevContainer JSON editor (general, features, ports, lifecycle)
│   ├── settings/       # VM, mount, network, Docker, domain, terminal, appearance, update
│   ├── onboarding/     # Guided setup flow
│   ├── layout/         # Sidebar, main layout
│   └── ui/             # shadcn/ui primitives
├── hooks/              # React Query hooks (19 hooks)
├── lib/                # Tauri API wrapper, utilities
└── types/              # TypeScript type definitions

src-tauri/              # Rust backend
├── src/
│   ├── cli/            # CLI executor (colima, docker commands)
│   ├── commands/       # Tauri IPC command handlers (98 commands)
│   │   ├── colima.rs           # Colima status/start/stop/restart
│   │   ├── container.rs        # Container ops + stats + log streaming
│   │   ├── image.rs            # Docker image ops
│   │   ├── volume.rs           # Docker volume ops
│   │   ├── network.rs          # Docker network ops
│   │   ├── vm_settings.rs      # VM resource settings
│   │   ├── mounts.rs           # Mount point settings
│   │   ├── network_settings.rs # Network settings
│   │   ├── docker_settings.rs  # Docker daemon config
│   │   ├── project.rs          # Project management (Dockerfile/Compose/DevContainer)
│   │   ├── project_config.rs   # DevContainer config read/write/validate
│   │   ├── env_secrets.rs      # Project env + Infisical integration
│   │   ├── env_store.rs        # Global env store + encryption
│   │   ├── proxy.rs            # DNS + Traefik gateway commands
│   │   ├── app_settings.rs     # App settings (terminal, shell)
│   │   ├── update.rs           # Version checks + runtime update
│   │   └── onboarding.rs       # Onboarding state
│   ├── proxy/          # DNS server (A + AAAA) + Traefik gateway
│   │   ├── dns.rs              # UDP DNS server with A/AAAA record support
│   │   ├── gateway.rs          # Traefik container management
│   │   ├── config.rs           # DNS/proxy configuration
│   │   └── sync.rs             # Container → DNS/proxy route sync
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

- App communicates with Colima/Docker via CLI subprocess execution (not Docker API)
- Rust backend runs `colima status`, `docker ps`, etc. and returns structured JSON via Tauri IPC
- Auto-updater configured via `tauri-plugin-updater` with GitHub Releases endpoint (stable + beta channels)
- **Liquid Glass UI는 반드시 항상 적용**: `tauri-plugin-liquid-glass` (macOS 26+ native, vibrancy fallback on older macOS, CSS gradient fallback on unsupported platforms). 프론트엔드 디자인/UI 수정 시 liquid glass 효과가 유지되는지 반드시 확인할 것
- **Container Domains**: 내장 DNS 서버(A + AAAA 레코드) + Traefik 리버스 프록시를 통한 컨테이너 도메인 라우팅. macOS `/etc/resolver/` 연동으로 커스텀 도메인 접미사 지원
- **Environment Management**: 글로벌/프로젝트별 환경변수 프로파일, Infisical 연동, AES-GCM 암호화
- **Project Types**: Dockerfile, Docker Compose, DevContainer 3가지 프로젝트 타입 지원 (자동 감지)
- App icon derived from official Colima SVG logo vector (white llama silhouette + green Docker containers on dark background)
- CI/CD: GitHub Actions with `tauri-action` for macOS builds (aarch64 Apple Silicon only)

## Frontend Design Guidelines

- **DESIGN.md( @DESIGN.md ) 참고 필수**: UI 컴포넌트 디자인, 색상, 타이포그래피, 레이아웃 등 모든 프론트엔드 디자인 관련 작업 시 반드시 `DESIGN.md`를 참조할 것
- **Liquid Glass 우선**: 모든 UI 요소는 `tauri-plugin-liquid-glass`의 glass 효과와 조화를 이루도록 구현. `body`는 `transparent`를 유지하고, 컴포넌트는 반투명 배경 + `backdrop-filter`를 사용
- **Glass 클래스 활용**: `glass-panel`, `glass-card`, `glass-sidebar`, `glass-group`, `glass-section` 등 `App.css`에 정의된 glass utility 클래스 사용
- **Fixed 모달/다이얼로그**: `backdrop-filter`를 사용하는 부모 안에서 `position: fixed` 모달이 클리핑되므로, 반드시 `createPortal(... , document.body)`로 렌더링할 것

## Release Process

1. Tag: `git tag v0.x.x && git push origin v0.x.x`
2. GitHub Actions builds macOS (aarch64 Apple Silicon only)
3. Draft release is created, assets uploaded, then published automatically
4. `latest.json` is generated for auto-updater
5. Pre-release tags (`-alpha`, `-beta`, `-rc`) skip Windows build and update beta channel
6. Users install via: `curl -fsSL https://raw.githubusercontent.com/yoonhoGo/colima-desktop/main/install.sh | sh`

## Signing Keys

- Updater public key is in `tauri.conf.json` → `plugins.updater.pubkey`
- Private key must be set as GitHub Secret: `TAURI_SIGNING_PRIVATE_KEY`
