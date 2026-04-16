# Apple Container Desktop

[한국어](./README.ko.md)

A lightweight desktop GUI for [Apple Container](https://github.com/apple/container) — manage your Linux containers, images, volumes, and networks from a native macOS app.

Built with **Tauri 2** (Rust) + **React 19** + **TypeScript**.

## Features

- **Container Management** — View, start, stop, restart, and remove containers with real-time log streaming and detailed stats (CPU, memory, network I/O)
- **Project Management** — Dockerfile-based project framework with auto-detection, environment variable binding, and one-click build & run
- **Image Management** — List, pull, and remove OCI images with pull progress tracking
- **Volume Management** — List, create, and remove volumes with prune support
- **Network Management** — List, create, and remove networks with prune support (macOS 26+)
- **Container Domains** — Apple Container built-in DNS integration for automatic `{name}.{domain}` routing with custom domain suffix support
- **Environment Management** — Global and per-project environment variable profiles with .env file import, Infisical secret manager integration, and AES-GCM encryption for sensitive values
- **Resource Settings** — Configure default container and builder CPU/memory via `container system property`
- **Registry Management** — Registry login/logout and default registry domain configuration
- **System Tray** — Quick access to Start / Stop / Restart Container service from the menu bar
- **Live Status** — Container service status indicator with auto-refresh
- **Onboarding** — Guided setup flow with Apple Container installation check and sidebar guide
- **Auto-Update** — Automatic update via GitHub Releases with beta channel support
- **Liquid Glass UI** — Native macOS 26+ Liquid Glass effect with vibrancy fallback on older versions

## Screenshots

> Coming soon

## Installation

### Prerequisites

- macOS 15+ (macOS 26 recommended)
- Apple Silicon Mac
- [Apple Container](https://github.com/apple/container) installed (`/usr/local/bin/container`)

### Quick Install (Recommended)

```bash
curl -fsSL https://raw.githubusercontent.com/boostbrothers/apple-container-desktop/main/install.sh | sh
```

To install the latest beta version:

```bash
curl -fsSL https://raw.githubusercontent.com/boostbrothers/apple-container-desktop/main/install.sh | sh -s -- --beta
```

The installer automatically downloads the latest release from GitHub, mounts the DMG, and installs the app to `/Applications`.

### Download from GitHub Releases

Alternatively, you can download pre-built binaries from the [Releases](https://github.com/boostbrothers/apple-container-desktop/releases) page.

| Platform | File |
|----------|------|
| macOS (Apple Silicon) | `Apple.Container.Desktop_x.x.x_aarch64.dmg` |

## Development

```bash
# Clone the repository
git clone https://github.com/boostbrothers/apple-container-desktop.git
cd apple-container-desktop

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
- [Apple Container](https://github.com/apple/container) installed

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
│   ├── containers/     # Container list, rows, logs, project management
│   ├── images/         # Image list, rows, pull dialog
│   ├── volumes/        # Volume list, rows, create dialog
│   ├── networks/       # Network list, rows, create dialog
│   ├── environment/    # Global environment profiles, env var table, Infisical config
│   ├── env/            # Project-level environment management
│   ├── settings/       # Resource, registry, domain, terminal, appearance, update settings
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
│   ├── crypto.rs       # AES-GCM encryption for secrets
│   ├── tray.rs         # System tray menu
│   └── lib.rs          # App setup + plugin registration
└── tauri.conf.json     # Tauri configuration
```

The app communicates with Apple Container through CLI subprocess execution. The Rust backend runs commands like `container system status`, `container list`, etc., and returns structured JSON to the React frontend via Tauri's IPC bridge. Apple Container uses a per-container lightweight VM architecture with XPC-based communication.

## License

MIT
