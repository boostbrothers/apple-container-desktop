# Apple Container Desktop

[English](./README.md)

[Apple Container](https://github.com/apple/container)를 위한 경량 데스크톱 GUI — Linux 컨테이너, 이미지, 볼륨, 네트워크를 네이티브 macOS 앱에서 관리할 수 있습니다.

**Tauri 2** (Rust) + **React 19** + **TypeScript** 기반으로 제작되었습니다.

## 주요 기능

- **컨테이너 관리** — 컨테이너 조회, 시작, 중지, 재시작, 삭제 및 실시간 로그 스트리밍, 상세 통계(CPU, 메모리, 네트워크 I/O)
- **프로젝트 관리** — Dockerfile 기반 프로젝트 프레임워크 (자동 감지, 환경변수 바인딩, 원클릭 빌드 & 실행)
- **이미지 관리** — OCI 이미지 목록 조회, Pull, 삭제 및 Pull 진행 상태 표시
- **볼륨 관리** — 볼륨 목록 조회, 생성, 삭제 및 정리(prune) 지원
- **네트워크 관리** — 네트워크 목록 조회, 생성, 삭제 및 정리(prune) 지원 (macOS 26+)
- **컨테이너 도메인** — Apple Container 내장 DNS 연동으로 `{name}.{domain}` 자동 라우팅, 커스텀 도메인 접미사 지원
- **환경변수 관리** — 글로벌 및 프로젝트별 환경변수 프로파일, .env 파일 가져오기, Infisical 시크릿 매니저 연동, AES-GCM 암호화
- **리소스 설정** — `container system property`를 통한 기본 컨테이너 및 빌더 CPU/메모리 설정
- **레지스트리 관리** — 레지스트리 로그인/로그아웃 및 기본 레지스트리 도메인 설정
- **시스템 트레이** — 메뉴바에서 Container 서비스 Start / Stop / Restart 빠른 접근
- **실시간 상태** — Container 서비스 상태 표시기 (자동 갱신)
- **온보딩** — Apple Container 설치 확인 및 사이드바 가이드가 포함된 안내 설정 플로우
- **자동 업데이트** — GitHub Releases를 통한 자동 업데이트 (베타 채널 지원)
- **Liquid Glass UI** — macOS 26+ 네이티브 Liquid Glass 효과 지원 (이전 버전은 vibrancy 폴백)

## 스크린샷

> 준비 중

## 설치

### 사전 요구 사항

- macOS 15+ (macOS 26 권장)
- Apple Silicon Mac
- [Apple Container](https://github.com/apple/container) 설치 (`/usr/local/bin/container`)

### GitHub Releases에서 다운로드

빌드된 바이너리는 [Releases](https://github.com/boostbrothers/apple-container-desktop/releases) 페이지에서 다운로드할 수 있습니다.

| 플랫폼 | 파일 |
|--------|------|
| macOS (Apple Silicon) | `Apple.Container.Desktop_x.x.x_aarch64.dmg` |

## 개발

```bash
# 저장소 클론
git clone https://github.com/boostbrothers/apple-container-desktop.git
cd apple-container-desktop

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
- [Apple Container](https://github.com/apple/container) 설치

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
| 암호화 | AES-GCM (Rust) |

## 아키텍처

```
src/                    # React 프론트엔드
├── components/
│   ├── containers/     # 컨테이너 목록, 행, 로그, 프로젝트 관리
│   ├── images/         # 이미지 목록, 행, Pull 다이얼로그
│   ├── volumes/        # 볼륨 목록, 행, 생성 다이얼로그
│   ├── networks/       # 네트워크 목록, 행, 생성 다이얼로그
│   ├── environment/    # 글로벌 환경변수 프로파일, 환경변수 테이블, Infisical 설정
│   ├── env/            # 프로젝트별 환경변수 관리
│   ├── settings/       # 리소스, 레지스트리, 도메인, 터미널, 외관, 업데이트 설정
│   ├── onboarding/     # 안내 설정 플로우
│   ├── layout/         # 사이드바, 메인 레이아웃
│   └── ui/             # shadcn/ui 기본 컴포넌트
├── hooks/              # React Query 훅
├── lib/                # Tauri API 래퍼, 유틸리티
└── types/              # TypeScript 타입 정의

src-tauri/              # Rust 백엔드
├── src/
│   ├── cli/            # CLI 실행기 (Apple Container 명령어)
│   ├── commands/       # Tauri IPC 커맨드 핸들러
│   │   ├── system.rs           # Container 서비스 상태/시작/중지/재시작
│   │   ├── container.rs        # 컨테이너 관리 + 통계 + 로그 스트리밍
│   │   ├── image.rs            # 이미지 관리
│   │   ├── volume.rs           # 볼륨 관리
│   │   ├── network.rs          # 네트워크 관리
│   │   ├── resource_settings.rs # 기본 컨테이너/빌더 리소스 설정
│   │   ├── registry_settings.rs # 레지스트리 로그인/로그아웃/설정
│   │   ├── project.rs          # 프로젝트 관리 (Dockerfile)
│   │   ├── env_secrets.rs      # 프로젝트 환경변수 + Infisical 연동
│   │   ├── env_store.rs        # 글로벌 환경변수 저장소 + 암호화
│   │   ├── proxy.rs            # 도메인 DNS 명령어
│   │   ├── app_settings.rs     # 앱 설정 (터미널, 셸)
│   │   ├── update.rs           # 버전 정보
│   │   └── onboarding.rs       # 온보딩 상태
│   ├── proxy/          # 도메인 DNS 설정
│   ├── crypto.rs       # AES-GCM 시크릿 암호화
│   ├── tray.rs         # 시스템 트레이 메뉴
│   └── lib.rs          # 앱 설정 + 플러그인 등록
└── tauri.conf.json     # Tauri 설정
```

앱은 CLI 서브프로세스 실행을 통해 Apple Container와 통신합니다. Rust 백엔드에서 `container system status`, `container list` 등의 명령을 실행하고, 구조화된 JSON을 Tauri IPC 브릿지를 통해 React 프론트엔드에 전달합니다. Apple Container는 컨테이너당 독립 경량 VM 아키텍처와 XPC 기반 통신을 사용합니다.

## 라이선스

MIT
