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

## Project Structure

```
src/                    # React frontend
├── components/         # UI components (containers, images, settings, layout, ui)
├── hooks/              # React Query hooks
├── lib/                # Tauri API wrapper, utilities
└── types/              # TypeScript type definitions

src-tauri/              # Rust backend
├── src/
│   ├── cli/            # CLI executor (colima, docker commands)
│   ├── commands/       # Tauri IPC command handlers
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
- Auto-updater configured via `tauri-plugin-updater` with GitHub Releases endpoint
- Liquid Glass UI via `tauri-plugin-liquid-glass` (macOS 26+ native, vibrancy fallback on older macOS, no-op on other platforms)
- App icon derived from official Colima SVG logo vector (white llama silhouette + green Docker containers on dark background)
- CI/CD: GitHub Actions with `tauri-action` for cross-platform builds

## Release Process

1. Tag: `git tag v0.x.x && git push origin v0.x.x`
2. GitHub Actions builds macOS (aarch64, x86_64), Linux, Windows
3. Draft release is created, assets uploaded, then published automatically
4. `latest.json` is generated for auto-updater
5. Users install via: `curl -fsSL https://raw.githubusercontent.com/yoonhoGo/colima-desktop/main/install.sh | sh`

## Signing Keys

- Updater public key is in `tauri.conf.json` → `plugins.updater.pubkey`
- Private key must be set as GitHub Secret: `TAURI_SIGNING_PRIVATE_KEY`
