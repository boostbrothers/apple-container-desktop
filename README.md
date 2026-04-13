# Colima Desktop

[한국어](./README.ko.md)

A lightweight desktop GUI for [Colima](https://github.com/abiosoft/colima) — manage your Docker containers, images, volumes, networks, and VM resources from a native macOS app.

Built with **Tauri 2** (Rust) + **React 19** + **TypeScript**.

## Features

- **Container Management** — View, start, stop, restart, and remove containers with real-time log streaming and detailed stats (CPU, memory, network I/O)
- **Docker Compose Grouping** — Compose projects are automatically grouped with accordion UI and bulk actions (Start All / Stop All / Restart All / Remove All)
- **Project Management** — Unified project framework supporting Dockerfile, Docker Compose, and DevContainer project types with auto-detection
- **DevContainer Support** — Full devcontainer.json editor with tabs for general settings, features/extensions, ports & env, lifecycle hooks, and raw JSON editing
- **Image Management** — List, pull, and remove Docker images with pull progress tracking
- **Volume Management** — List, create, and remove Docker volumes with prune support
- **Network Management** — List, create, and remove Docker networks with prune support
- **Container Domains (DNS + Reverse Proxy)** — Built-in DNS server (A + AAAA records) with Traefik gateway for automatic container domain routing. Custom domain suffix, per-container hostname overrides, and macOS resolver integration
- **Environment Management** — Global and per-project environment variable profiles with .env file import, Infisical secret manager integration, and AES-GCM encryption for sensitive values
- **VM Resource Settings** — Adjust CPU, Memory, Disk, Runtime, and Network Address with one-click apply
- **Mount Settings** — Configure file mount points, mount type, and inotify options
- **Network Settings** — DNS, gateway, network mode, and port forwarder configuration
- **Docker Daemon Settings** — Insecure registries and registry mirrors configuration
- **System Tray** — Quick access to Start / Stop / Restart Colima from the menu bar
- **Live Status** — Colima VM status indicator with auto-refresh
- **Onboarding** — Guided setup flow with Colima installation check and sidebar guide
- **Auto-Update** — Automatic update via GitHub Releases with beta channel support
- **Liquid Glass UI** — Native macOS 26+ Liquid Glass effect with vibrancy fallback on older versions

## Screenshots

> Coming soon

## Installation

### Quick Install (macOS / Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/yoonhoGo/colima-desktop/main/install.sh | sh
```

To install the latest **beta** version:

```bash
curl -fsSL https://raw.githubusercontent.com/yoonhoGo/colima-desktop/main/install.sh | sh -s -- --beta
```

The install script automatically detects your OS and architecture, downloads the latest release from GitHub, and installs it.

- **macOS**: Installs `Colima Desktop.app` to `/Applications`
- **Linux (Debian/Ubuntu)**: Installs via `.deb` package
- **Linux (Other)**: Installs AppImage to `~/.local/bin`

### Download from GitHub Releases

Pre-built binaries for all platforms are available on the [Releases](https://github.com/yoonhoGo/colima-desktop/releases) page.

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `Colima.Desktop_x.x.x_aarch64.dmg` |
| macOS (Intel) | `Colima.Desktop_x.x.x_x86_64.dmg` |
| Linux (Debian/Ubuntu) | `colima-desktop_x.x.x_amd64.deb` |
| Linux (AppImage) | `colima-desktop_x.x.x_amd64.AppImage` |
| Windows | `Colima.Desktop_x.x.x_x64-setup.exe` |

### Prerequisites

- [Colima](https://github.com/abiosoft/colima) installed and configured

## Development

```bash
# Clone the repository
git clone https://github.com/yoonhoGo/colima-desktop.git
cd colima-desktop

# Install dependencies
npm install

# Run in development mode
npm run tauri dev

# Build for production
npm run tauri build
```

### Development Prerequisites

- [Rust](https://rustup.rs/) toolchain
- [Node.js](https://nodejs.org/) 18+

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Framework | [Tauri 2](https://tauri.app/) |
| Backend | Rust + Tokio |
| Frontend | React 19 + TypeScript |
| Build Tool | Vite 7 |
| UI Components | [shadcn/ui](https://ui.shadcn.com/) + Base UI |
| Styling | Tailwind CSS 4 |
| Theme | [tauri-plugin-liquid-glass](https://github.com/hkandala/tauri-plugin-liquid-glass) |
| State Management | TanStack React Query |
| Icons | Lucide React |
| Encryption | AES-GCM (Rust) |

## Architecture

```
src/                    # React frontend
├── components/
│   ├── containers/     # Container list, rows, compose groups, logs, project management
│   ├── images/         # Image list, rows, pull dialog
│   ├── volumes/        # Volume list, rows, create dialog
│   ├── networks/       # Network list, rows, create dialog
│   ├── environment/    # Global environment profiles, env var table, Infisical config
│   ├── env/            # Project-level environment management
│   ├── devcontainer-config/  # DevContainer JSON editor (general, features, ports, lifecycle)
│   ├── settings/       # VM, mount, network, Docker, domain, terminal, appearance, update settings
│   ├── onboarding/     # Guided setup flow
│   ├── layout/         # Sidebar, main layout
│   └── ui/             # shadcn/ui primitives
├── hooks/              # React Query hooks (19 hooks)
├── lib/                # Tauri API wrapper, utilities
└── types/              # TypeScript type definitions

src-tauri/              # Rust backend
├── src/
│   ├── cli/            # CLI executor, type definitions
│   ├── commands/       # Tauri command handlers (98 IPC commands)
│   ├── proxy/          # DNS server (A + AAAA) + Traefik gateway management
│   ├── crypto.rs       # AES-GCM encryption for secrets
│   ├── tray.rs         # System tray menu
│   └── lib.rs          # App setup + plugin registration
```

The app communicates with Colima and Docker through CLI subprocess execution. The Rust backend runs commands like `colima status`, `docker ps`, etc., and returns structured JSON to the React frontend via Tauri's IPC bridge.

## License

MIT
