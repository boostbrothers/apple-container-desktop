# Colima Desktop

[한국어](./README.ko.md)

A lightweight desktop GUI for [Colima](https://github.com/abiosoft/colima) — manage your Docker containers, images, and VM resources from a native macOS app.

Built with **Tauri 2** (Rust) + **React 19** + **TypeScript**.

## Features

- **Container Management** — View, start, stop, restart, and remove containers with real-time log streaming
- **Docker Compose Grouping** — Compose projects are automatically grouped with accordion UI and bulk actions (Start All / Stop All / Restart All / Remove All)
- **Image Management** — List, pull, and remove Docker images with pull progress tracking
- **VM Resource Settings** — Adjust CPU, Memory, Disk, Runtime, and Network Address with one-click apply
- **System Tray** — Quick access to Start / Stop / Restart Colima from the menu bar
- **Live Status** — Colima VM status indicator with auto-refresh

## Screenshots

> Coming soon

## Prerequisites

- macOS (Apple Silicon or Intel)
- [Colima](https://github.com/abiosoft/colima) installed and configured
- [Rust](https://rustup.rs/) toolchain
- [Node.js](https://nodejs.org/) 18+

## Getting Started

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

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop Framework | [Tauri 2](https://tauri.app/) |
| Backend | Rust + Tokio |
| Frontend | React 19 + TypeScript |
| Build Tool | Vite 7 |
| UI Components | [shadcn/ui](https://ui.shadcn.com/) + Base UI |
| Styling | Tailwind CSS 4 |
| State Management | TanStack React Query |
| Icons | Lucide React |

## Architecture

```
src/                    # React frontend
├── components/
│   ├── containers/     # Container list, rows, compose groups, logs
│   ├── images/         # Image list, rows, pull dialog
│   ├── settings/       # VM resource settings
│   ├── layout/         # Sidebar, main layout
│   └── ui/             # shadcn/ui primitives
├── hooks/              # React Query hooks
├── lib/                # Tauri API wrapper, utilities
└── types/              # TypeScript type definitions

src-tauri/              # Rust backend
├── src/
│   ├── cli/            # CLI executor, type definitions
│   ├── commands/       # Tauri command handlers
│   ├── tray.rs         # System tray menu
│   └── lib.rs          # App setup
```

The app communicates with Colima and Docker through CLI subprocess execution. The Rust backend runs commands like `colima status`, `docker ps`, etc., and returns structured JSON to the React frontend via Tauri's IPC bridge.

## License

MIT
