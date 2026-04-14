# Colima → Apple Container 마이그레이션 설계

**날짜:** 2026-04-14
**상태:** 승인됨

## 개요

Colima Desktop 앱을 Apple Container 통합으로 전환한다. Docker Compose, DevContainer 지원을 제거하고, Dockerfile 프로젝트만 지원한다. 자체 DNS/Traefik 프록시를 Apple Container 내장 DNS로 교체한다. 앱 이름을 "Apple Container Desktop"으로 변경한다.

## 결정 사항

| 항목 | 결정 |
|------|------|
| 도메인 라우팅 | Apple Container 내장 DNS로 완전 교체 (Traefik 제거) |
| 앱 이름 | "Apple Container Desktop" |
| 프로젝트 시스템 | 유지 (Dockerfile 타입만) |
| VM 설정 | "기본 컨테이너 리소스 설정"으로 변환 (`container system property`) |
| Docker 설정 | 레지스트리 관리 패널로 변환 |
| 환경변수 시스템 | 전체 유지 (주입 방식만 `container run -e`로 변경) |
| 마이그레이션 방식 | 계층별 단계적 마이그레이션 (7단계 커밋) |

## Apple Container CLI 참조

- 저장소: https://github.com/apple/container
- 바이너리: `/usr/local/bin/container`
- 데몬: `container-apiserver` (launchd, XPC 통신)
- 아키텍처: 컨테이너당 독립 경량 VM
- OCI 호환, `--format json` 지원
- macOS 26 권장, macOS 15 제한적 지원
- Apple Silicon 전용

## 단계 1: CLI 실행 계층 교체

### executor.rs 변경

- `docker_cmd()` → `container_cmd()`: 바이너리를 `/usr/local/bin/container`로 변경
- `DOCKER_HOST` 환경변수 설정 제거 (Apple Container는 XPC 기반, 소켓 불필요)
- `EXTENDED_PATH`: `/usr/local/bin` 중심으로 단순화

### types.rs 변경

- `DockerPsEntry` → `ContainerListEntry`: `container list --format json` 출력 파싱
- `Container`: `compose_project`, `compose_service` 필드 제거
- `ColimaStatusRaw` / `ColimaStatus` → `SystemStatus`: `container system status` 출력 파싱
- `Project.project_type`: "compose" / "devcontainer" 값 제거, "dockerfile"만 유지

## 단계 2: 시스템 관리 명령어 교체

### colima.rs → system.rs

| 현재 | 변경 후 |
|------|---------|
| `colima_status()` → `colima status --json` | `system_status()` → `container system status` |
| `colima_start()` → `colima start` | `system_start()` → `container system start` |
| `colima_stop()` → `colima stop` | `system_stop()` → `container system stop` |
| `colima_restart()` → stop + start | `system_restart()` → stop + start |

### vm_settings.rs → resource_settings.rs

| 현재 | 변경 후 |
|------|---------|
| `colima start --cpu X --memory Y --disk Z` | `container system property set container.cpus X` |
| CPU, 메모리, 디스크 3항목 | CPU, 메모리 2항목 + 빌더 리소스 (build.cpus, build.memory) |

### 프론트엔드

- `useColimaStatus` → `useSystemStatus`
- `api.colimaStatus()` → `api.systemStatus()`
- 상태바 UI: "Colima" → "Container"
- `VmSettings.tsx` → 기본 컨테이너 리소스 설정 UI

## 단계 3: 컨테이너/이미지/볼륨/네트워크 명령어 교체

### 컨테이너 관리

| 현재 (Docker) | 변경 후 (Apple Container) |
|--------------|--------------------------|
| `docker ps -a --format json` | `container list -a --format json` |
| `docker start ID` | `container start ID` |
| `docker stop ID` | `container stop ID` |
| `docker restart ID` | `container stop ID` + `container start ID` |
| `docker rm -f ID` | `container delete -f ID` |
| `docker container prune -f` | `container prune` |
| `docker run -d [opts] IMAGE` | `container run -d [opts] IMAGE` |
| `docker logs -f --tail 200 ID` | `container logs -f -n 200 ID` |
| `docker inspect ID` | `container inspect ID` |
| `docker stats ID --no-stream` | `container stats ID` |
| `docker exec ID CMD` | `container exec ID CMD` |

### 이미지 관리

| 현재 | 변경 후 |
|------|---------|
| `docker images --format json` | `container image list --format json` |
| `docker pull IMAGE` | `container image pull IMAGE` |
| `docker rmi IMAGE` | `container image delete IMAGE` |
| `docker image prune -f` | `container image prune` |
| `docker tag SRC DST` | `container image tag SRC DST` |

### 볼륨 관리

| 현재 | 변경 후 |
|------|---------|
| `docker volume ls --format json` | `container volume list` |
| `docker volume create NAME` | `container volume create NAME` |
| `docker volume rm NAME` | `container volume delete NAME` |
| `docker volume prune -f` | `container volume prune` |

### 네트워크 관리

| 현재 | 변경 후 |
|------|---------|
| `docker network ls --format json` | `container network list` |
| `docker network create NAME` | `container network create NAME` |
| `docker network rm NAME` | `container network delete NAME` |

macOS 26+ 전용. macOS 15에서는 네트워크 명령 비활성화 처리 필요.

### JSON 출력 형식 주의

Apple Container의 `--format json` 출력 형식은 Docker와 다를 수 있다. 각 명령어의 실제 JSON 출력을 테스트하여 `types.rs` 구조체의 필드명과 타입을 확정해야 한다. 구현 시 `container list --format json`, `container image list --format json`, `container inspect`, `container stats` 등의 출력을 먼저 확인할 것.

## 단계 4: Compose / DevContainer 제거

### Rust 백엔드 제거

| 파일 | 제거 범위 |
|------|----------|
| `project.rs` | `find_docker_compose_cmd()`, `compose_up()`, `get_compose_status()` |
| `project.rs` | `find_devcontainer_cli()`, `devcontainer_project_up()`, `get_devcontainer_status()` |
| `project.rs` | `detect_project_type()` — compose/devcontainer 감지 로직 |
| `project.rs` | `project_up()` — compose/devcontainer 분기 제거 |
| `project.rs` | `project_stop()` — compose/devcontainer 분기 제거 |
| `project.rs` | `migrate_config_if_needed()` — 구 파일 형식 마이그레이션 제거 |
| `project_config.rs` | **파일 전체 삭제** |
| `env_secrets.rs` | `prepare_secrets_for_compose()` 제거 |
| `schemas/devContainer.base.schema.json` | **파일 삭제** |
| `lib.rs` | IPC 핸들러에서 제거: `read_devcontainer_json`, `write_devcontainer_json`, `validate_devcontainer_json`, `check_devcontainer_cli` |

### 프론트엔드 제거

| 경로 | 제거 범위 |
|------|----------|
| `src/components/devcontainer-config/` | **디렉토리 전체 삭제** (7개 컴포넌트) |
| `AddProjectWizard.tsx` | Compose/DevContainer 선택지 제거 |
| `ProjectCard.tsx` | compose/devcontainer 상태 표시 로직 제거 |
| `ProjectDetail.tsx` | compose/devcontainer 관련 설정 UI 제거 |
| `src/lib/tauri.ts` | devcontainer 관련 API 제거 |
| `src/types/index.ts` | compose/devcontainer 타입 정리 |
| `src/hooks/` | DevContainer 관련 훅 제거 |

### types.ts Project 인터페이스

제거 필드: `compose_file`, `service_name`, `compose_project`, `compose_service`, `watch_mode`

유지 필드: `id`, `name`, `workspace_path`, `project_type` ("dockerfile"), `dockerfile`, `ports`, `startup_command`, `env_vars`, `active_profile`, `profiles`, `env_binding`, `infisical_config`, `domain`, `remote_debug`

## 단계 5: DNS/Proxy → Apple Container 내장 DNS

### 제거

| 파일 | 이유 |
|------|------|
| `proxy/dns.rs` | 자체 UDP DNS 서버 → 내장 DNS 대체 |
| `proxy/gateway.rs` | Traefik 게이트웨이 → 불필요 |
| `proxy/sync.rs` | 라우트 동기화 → 불필요 |

### Apple Container 내장 DNS 활용

```
container system dns create DOMAIN [--localhost]  # sudo 필요
container system dns delete DOMAIN                # sudo 필요
container system dns list
container system property set dns.domain DOMAIN
```

### 새 모듈 구조

`proxy/` → `domain/` 리네임:
- `domain/config.rs`: 도메인 설정 관리
- `domain/mod.rs`: 모듈 정의

### 명령어 변경

| 현재 | 변경 후 |
|------|---------|
| `proxy_start()` | `domain_setup()` → `container system dns create` |
| `proxy_stop()` | `domain_teardown()` → `container system dns delete` |
| `proxy_get_status()` | `domain_status()` → `container system dns list` |
| `domain_sync()` | 제거 (자동 관리) |

### 프론트엔드

- `ContainerDomainsSettings.tsx`: Traefik UI 제거, DNS 도메인 관리 UI로 단순화
- `domain_suffix` 기본값: `container.local`
- 게이트웨이 상태 표시 제거

### 설정 파일 변경

- `~/.config/.../gateway/` 디렉토리 제거
- `domain-config.json` 단순화

## 단계 6: 레지스트리 관리 패널

### docker_settings.rs → registry_settings.rs

| 명령어 | CLI |
|--------|-----|
| `list_registries()` | `container registry list` |
| `registry_login()` | `container registry login REGISTRY -u USER --password-stdin` |
| `registry_logout()` | `container registry logout REGISTRY` |
| `get_default_registry()` | `container system property get registry.domain` |
| `set_default_registry()` | `container system property set registry.domain VALUE` |

### DockerSettingsPanel.tsx → RegistrySettingsPanel.tsx

- Insecure Registry / Mirror UI 제거
- 로그인된 레지스트리 테이블 + 로그인/로그아웃 버튼
- 기본 레지스트리 도메인 입력 필드

## 단계 7: 브랜딩 및 설정 경로 변경

### 앱 이름

| 항목 | 현재 | 변경 후 |
|------|------|---------|
| 앱 이름 | Colima Desktop | Apple Container Desktop |
| 앱 식별자 | `colima-desktop` | `apple-container-desktop` |
| `tauri.conf.json` | Colima Desktop | Apple Container Desktop |
| 시스템 트레이 | Colima Desktop | Apple Container Desktop |

### 설정 경로

| 항목 | 현재 | 변경 후 |
|------|------|---------|
| 설정 디렉토리 | `~/.config/colima-desktop/` | `~/.config/apple-container-desktop/` |

### 컨테이너/도메인

| 항목 | 현재 | 변경 후 |
|------|------|---------|
| 프로젝트 컨테이너 접두사 | `colima-project-{id}` | `acd-project-{id}` |
| 도메인 기본값 | `colima.local` | `container.local` |

### 마이그레이션

- 구 설정 `~/.config/colima-desktop/` 존재 시 새 경로로 복사 (구 디렉토리 유지)
- 모든 "Colima" 텍스트 교체 (사이드바, 온보딩, 설정, 트레이 등)
