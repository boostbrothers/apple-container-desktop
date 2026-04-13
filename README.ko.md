# Colima Desktop

[English](./README.md)

[Colima](https://github.com/abiosoft/colima)를 위한 경량 데스크톱 GUI — Docker 컨테이너, 이미지, VM 자원을 네이티브 macOS 앱에서 관리할 수 있습니다.

**Tauri 2** (Rust) + **React 19** + **TypeScript** 기반으로 제작되었습니다.

## 주요 기능

- **컨테이너 관리** — 컨테이너 조회, 시작, 중지, 재시작, 삭제 및 실시간 로그 스트리밍
- **Docker Compose 그룹핑** — Compose 프로젝트를 자동으로 묶어 아코디언 UI로 표시하고 일괄 액션 지원 (Start All / Stop All / Restart All / Remove All)
- **이미지 관리** — Docker 이미지 목록 조회, Pull, 삭제 및 Pull 진행 상태 표시
- **VM 자원 설정** — CPU, Memory, Disk, Runtime, Network Address를 슬라이더로 조정하고 한 번의 클릭으로 적용
- **시스템 트레이** — 메뉴바에서 Colima Start / Stop / Restart 빠른 접근
- **실시간 상태** — Colima VM 상태 표시기 (자동 갱신)
- **Liquid Glass UI** — macOS 26+ 네이티브 Liquid Glass 효과 지원 (이전 버전은 vibrancy 폴백)

## 스크린샷

> 준비 중

## 설치

### 빠른 설치 (macOS / Linux)

```bash
curl -fsSL https://raw.githubusercontent.com/yoonhoGo/colima-desktop/main/install.sh | sh
```

최신 **베타** 버전을 설치하려면:

```bash
curl -fsSL https://raw.githubusercontent.com/yoonhoGo/colima-desktop/main/install.sh | sh -s -- --beta
```

설치 스크립트가 OS와 아키텍처를 자동 감지하고, GitHub에서 최신 릴리스를 다운로드하여 설치합니다.

- **macOS**: `Colima Desktop.app`을 `/Applications`에 설치
- **Linux (Debian/Ubuntu)**: `.deb` 패키지로 설치
- **Linux (기타)**: AppImage를 `~/.local/bin`에 설치

### GitHub Releases에서 다운로드

모든 플랫폼의 빌드된 바이너리는 [Releases](https://github.com/yoonhoGo/colima-desktop/releases) 페이지에서 다운로드할 수 있습니다.

| 플랫폼 | 파일 |
|--------|------|
| macOS (Apple Silicon) | `Colima.Desktop_x.x.x_aarch64.dmg` |
| macOS (Intel) | `Colima.Desktop_x.x.x_x86_64.dmg` |
| Linux (Debian/Ubuntu) | `colima-desktop_x.x.x_amd64.deb` |
| Linux (AppImage) | `colima-desktop_x.x.x_amd64.AppImage` |
| Windows | `Colima.Desktop_x.x.x_x64-setup.exe` |

### 사전 요구 사항

- [Colima](https://github.com/abiosoft/colima) 설치 및 설정 완료

## 개발

```bash
# 저장소 클론
git clone https://github.com/yoonhoGo/colima-desktop.git
cd colima-desktop

# 의존성 설치
npm install

# 개발 모드 실행
npm run tauri dev

# 프로덕션 빌드
npm run tauri build
```

### 개발 사전 요구 사항

- [Rust](https://rustup.rs/) 툴체인
- [Node.js](https://nodejs.org/) 18+

## 기술 스택

| 레이어 | 기술 |
|--------|------|
| 데스크톱 프레임워크 | [Tauri 2](https://tauri.app/) |
| 백엔드 | Rust + Tokio |
| 프론트엔드 | React 19 + TypeScript |
| 빌드 도구 | Vite 7 |
| UI 컴포넌트 | [shadcn/ui](https://ui.shadcn.com/) + Base UI |
| 스타일링 | Tailwind CSS 4 |
| 테마 | [tauri-plugin-liquid-glass](https://github.com/hkandala/tauri-plugin-liquid-glass) |
| 상태 관리 | TanStack React Query |
| 아이콘 | Lucide React |

## 아키텍처

```
src/                    # React 프론트엔드
├── components/
│   ├── containers/     # 컨테이너 목록, 행, Compose 그룹, 로그
│   ├── images/         # 이미지 목록, 행, Pull 다이얼로그
│   ├── settings/       # VM 자원 설정
│   ├── layout/         # 사이드바, 메인 레이아웃
│   └── ui/             # shadcn/ui 기본 컴포넌트
├── hooks/              # React Query 훅
├── lib/                # Tauri API 래퍼, 유틸리티
└── types/              # TypeScript 타입 정의

src-tauri/              # Rust 백엔드
├── src/
│   ├── cli/            # CLI 실행기, 타입 정의
│   ├── commands/       # Tauri 커맨드 핸들러
│   ├── tray.rs         # 시스템 트레이 메뉴
│   └── lib.rs          # 앱 설정
```

앱은 CLI 서브프로세스 실행을 통해 Colima 및 Docker와 통신합니다. Rust 백엔드에서 `colima status`, `docker ps` 등의 명령을 실행하고, 구조화된 JSON을 Tauri IPC 브릿지를 통해 React 프론트엔드에 전달합니다.

## 라이선스

MIT
