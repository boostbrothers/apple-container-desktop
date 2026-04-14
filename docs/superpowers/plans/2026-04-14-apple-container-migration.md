# Colima → Apple Container 마이그레이션 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Colima/Docker CLI 통합을 Apple Container CLI 통합으로 전면 교체하고, Compose/DevContainer를 제거하며, 앱을 "Apple Container Desktop"으로 리브랜딩한다.

**Architecture:** Rust 백엔드의 CLI 실행 계층(`executor.rs`)이 `container` 바이너리를 호출하도록 변경한다. 각 Tauri IPC 명령어 모듈에서 Docker CLI 호출을 Apple Container CLI로 매핑한다. Compose/DevContainer 관련 코드를 전면 삭제하고, 자체 DNS/Traefik을 Apple Container 내장 DNS로 교체한다.

**Tech Stack:** Tauri 2 (Rust), React 19 + TypeScript, TanStack Query, Apple Container CLI

**설계 문서:** `docs/superpowers/specs/2026-04-14-apple-container-migration-design.md`

---

### Task 1: CLI 실행 계층 교체 (executor.rs)

**Files:**
- Modify: `src-tauri/src/cli/executor.rs`

- [ ] **Step 1: `docker_cmd()` → `container_cmd()` 변경**

`executor.rs`에서 Docker 관련 함수를 Apple Container로 교체한다:

```rust
// 삭제: DOCKER_PATH, docker_cmd(), docker_host()
// 추가:
static CONTAINER_PATH: LazyLock<String> = LazyLock::new(|| {
    find_binary("container").unwrap_or_else(|| "container".to_string())
});

pub fn container_cmd() -> &'static str {
    &CONTAINER_PATH
}
```

- [ ] **Step 2: `CliExecutor::run()`에서 DOCKER_HOST 제거**

```rust
impl CliExecutor {
    pub async fn run(program: &str, args: &[&str]) -> Result<String, String> {
        let output: Output = Command::new(program)
            .args(args)
            .env("PATH", &*EXTENDED_PATH)
            // DOCKER_HOST 줄 제거
            .output()
            .await
            .map_err(|e| format!("Failed to execute {}: {}", program, e))?;

        if output.status.success() {
            String::from_utf8(output.stdout)
                .map_err(|e| format!("Invalid UTF-8 output: {}", e))
        } else {
            let stderr = String::from_utf8_lossy(&output.stderr);
            Err(format!("{} failed: {}", program, stderr.trim()))
        }
    }
}
```

- [ ] **Step 3: 빌드 확인**

Run: `cd src-tauri && cargo check 2>&1 | head -20`
Expected: 아직 다른 파일에서 `docker_cmd()`, `docker_host()` 참조 에러 발생 (예상됨, 이후 단계에서 수정)

- [ ] **Step 4: 커밋**

```bash
git add src-tauri/src/cli/executor.rs
git commit -m "refactor(cli): Docker CLI executor를 Apple Container CLI로 교체

docker_cmd() → container_cmd()로 변경, DOCKER_HOST 환경변수 제거.
Apple Container는 XPC 기반이므로 소켓 불필요."
```

---

### Task 2: 타입 시스템 교체 (types.rs)

**Files:**
- Modify: `src-tauri/src/cli/types.rs`

- [ ] **Step 1: Container 관련 타입 변경**

`DockerPsEntry` → `ContainerListEntry`로 리네임하고, compose 관련 코드 제거:

```rust
#[derive(Debug, Deserialize)]
pub struct ContainerListEntry {
    pub id: String,
    pub name: String,
    pub image: String,
    pub state: String,
    pub status: String,
    #[serde(default)]
    pub ports: String,
    #[serde(default)]
    pub created_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct Container {
    pub id: String,
    pub name: String,
    pub image: String,
    pub state: String,
    pub status: String,
    pub ports: String,
    pub created_at: String,
}

impl From<ContainerListEntry> for Container {
    fn from(entry: ContainerListEntry) -> Self {
        Container {
            id: entry.id,
            name: entry.name,
            image: entry.image,
            state: entry.state,
            status: entry.status,
            ports: entry.ports,
            created_at: entry.created_at,
        }
    }
}
```

- [ ] **Step 2: Image 관련 타입 변경**

`DockerImageEntry` → `ImageListEntry`로 리네임:

```rust
#[derive(Debug, Deserialize)]
pub struct ImageListEntry {
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
    #[serde(default)]
    pub created_at: String,
}

impl From<ImageListEntry> for Image {
    fn from(entry: ImageListEntry) -> Self {
        Image {
            id: entry.id,
            repository: entry.repository,
            tag: entry.tag,
            size: entry.size,
            created_at: entry.created_at,
            in_use: false, // Apple Container에서는 개별 확인 필요
        }
    }
}
```

- [ ] **Step 3: Colima 상태 타입 → SystemStatus 변경**

`ColimaStatusRaw`, `ColimaStatus` 제거 후:

```rust
#[derive(Debug, Serialize, Clone)]
pub struct SystemStatus {
    pub running: bool,
    pub version: String,
}

impl SystemStatus {
    pub fn stopped() -> Self {
        SystemStatus {
            running: false,
            version: String::new(),
        }
    }
}
```

- [ ] **Step 4: Colima 전용 타입 제거 및 리소스 설정 타입 추가**

제거: `ColimaListEntry`, `ColimaVersion`, `DockerDaemonSettings`

`VmSettings` → `ResourceSettings` 변경:

```rust
#[derive(Debug, Serialize, Clone)]
pub struct ResourceSettings {
    pub container_cpus: String,
    pub container_memory: String,
    pub build_cpus: String,
    pub build_memory: String,
}
```

- [ ] **Step 5: Volume/Network 타입 변경**

`DockerVolumeEntry` → `VolumeListEntry`, `DockerNetworkEntry` → `NetworkListEntry`로 리네임. 구조는 Apple Container 출력에 맞춰 조정 (필드명은 실제 테스트 후 확정, 현재는 기존 구조 유지).

- [ ] **Step 6: Project 타입에서 compose/devcontainer 필드 제거**

`Project` 구조체에서 제거:
- `watch_mode`
- `compose_file`
- `service_name`

`ProjectWithStatus`에서도 동일 필드 제거.

`ProjectTypeDetection`에서 제거:
- `has_compose`
- `has_devcontainer`
- `compose_files`

- [ ] **Step 7: 커밋**

```bash
git add src-tauri/src/cli/types.rs
git commit -m "refactor(types): Docker/Colima 타입을 Apple Container 타입으로 교체

DockerPsEntry → ContainerListEntry, ColimaStatus → SystemStatus,
VmSettings → ResourceSettings. compose/devcontainer 관련 필드 제거."
```

---

### Task 3: 시스템 관리 명령어 교체 (colima.rs → system.rs)

**Files:**
- Delete: `src-tauri/src/commands/colima.rs`
- Create: `src-tauri/src/commands/system.rs`
- Modify: `src-tauri/src/commands/mod.rs`

- [ ] **Step 1: `system.rs` 생성**

```rust
use crate::cli::executor::CliExecutor;
use crate::cli::types::SystemStatus;

#[tauri::command]
pub async fn system_status() -> Result<SystemStatus, String> {
    let result = CliExecutor::run("container", &["system", "status"]).await;
    match result {
        Ok(stdout) => {
            // "container system status" 출력에서 running 여부 파싱
            let running = stdout.to_lowercase().contains("running");
            let version = CliExecutor::run("container", &["system", "version"])
                .await
                .unwrap_or_default();
            Ok(SystemStatus {
                running,
                version: version.trim().to_string(),
            })
        }
        Err(_) => Ok(SystemStatus::stopped()),
    }
}

#[tauri::command]
pub async fn system_start() -> Result<(), String> {
    CliExecutor::run("container", &["system", "start"]).await?;
    Ok(())
}

#[tauri::command]
pub async fn system_stop() -> Result<(), String> {
    CliExecutor::run("container", &["system", "stop"]).await?;
    Ok(())
}

#[tauri::command]
pub async fn system_restart() -> Result<(), String> {
    CliExecutor::run("container", &["system", "stop"]).await.ok();
    CliExecutor::run("container", &["system", "start"]).await?;
    Ok(())
}
```

- [ ] **Step 2: `colima.rs` 삭제, `mod.rs` 수정**

`mod.rs`에서 `pub mod colima;` → `pub mod system;`

- [ ] **Step 3: 커밋**

```bash
git add -A src-tauri/src/commands/
git commit -m "refactor(commands): colima.rs를 system.rs로 교체

colima status/start/stop → container system status/start/stop 매핑."
```

---

### Task 4: VM 설정 → 리소스 설정 교체 (vm_settings.rs → resource_settings.rs)

**Files:**
- Delete: `src-tauri/src/commands/vm_settings.rs`
- Create: `src-tauri/src/commands/resource_settings.rs`
- Modify: `src-tauri/src/commands/mod.rs`

- [ ] **Step 1: `resource_settings.rs` 생성**

```rust
use crate::cli::executor::CliExecutor;
use crate::cli::types::{HostInfo, ResourceSettings};

#[tauri::command]
pub async fn get_resource_settings() -> Result<ResourceSettings, String> {
    let container_cpus = CliExecutor::run("container", &["system", "property", "get", "container.cpus"])
        .await
        .unwrap_or_default()
        .trim()
        .to_string();
    let container_memory = CliExecutor::run("container", &["system", "property", "get", "container.memory"])
        .await
        .unwrap_or_default()
        .trim()
        .to_string();
    let build_cpus = CliExecutor::run("container", &["system", "property", "get", "build.cpus"])
        .await
        .unwrap_or_default()
        .trim()
        .to_string();
    let build_memory = CliExecutor::run("container", &["system", "property", "get", "build.memory"])
        .await
        .unwrap_or_default()
        .trim()
        .to_string();

    Ok(ResourceSettings {
        container_cpus,
        container_memory,
        build_cpus,
        build_memory,
    })
}

#[tauri::command]
pub async fn get_host_info() -> Result<HostInfo, String> {
    let cpu_str = CliExecutor::run("sysctl", &["-n", "hw.ncpu"]).await?;
    let cpus: u32 = cpu_str.trim().parse()
        .map_err(|e| format!("Failed to parse CPU count: {}", e))?;
    let mem_str = CliExecutor::run("sysctl", &["-n", "hw.memsize"]).await?;
    let mem_bytes: u64 = mem_str.trim().parse()
        .map_err(|e| format!("Failed to parse memory: {}", e))?;
    Ok(HostInfo {
        cpus,
        memory_gib: mem_bytes as f64 / 1_073_741_824.0,
    })
}

#[tauri::command]
pub async fn apply_resource_settings(
    container_cpus: String,
    container_memory: String,
    build_cpus: String,
    build_memory: String,
) -> Result<(), String> {
    if !container_cpus.is_empty() {
        CliExecutor::run("container", &["system", "property", "set", "container.cpus", &container_cpus]).await?;
    }
    if !container_memory.is_empty() {
        CliExecutor::run("container", &["system", "property", "set", "container.memory", &container_memory]).await?;
    }
    if !build_cpus.is_empty() {
        CliExecutor::run("container", &["system", "property", "set", "build.cpus", &build_cpus]).await?;
    }
    if !build_memory.is_empty() {
        CliExecutor::run("container", &["system", "property", "set", "build.memory", &build_memory]).await?;
    }
    Ok(())
}
```

- [ ] **Step 2: `vm_settings.rs` 삭제, `mod.rs` 수정**

`mod.rs`에서 `pub mod vm_settings;` → `pub mod resource_settings;`

- [ ] **Step 3: 커밋**

```bash
git add -A src-tauri/src/commands/
git commit -m "refactor(commands): vm_settings.rs를 resource_settings.rs로 교체

colima start --cpu/--memory/--disk → container system property set 매핑."
```

---

### Task 5: 컨테이너 명령어 교체 (container.rs)

**Files:**
- Modify: `src-tauri/src/commands/container.rs`

- [ ] **Step 1: import 변경 및 기본 명령어 교체**

```rust
use crate::cli::executor::{container_cmd, CliExecutor, EXTENDED_PATH};
use crate::cli::types::{
    Container, ContainerDetail, ContainerStats, ContainerListEntry, MountInfo, NetworkInfo, PortBinding,
};
```

`list_containers()`:
```rust
pub async fn list_containers() -> Result<Vec<Container>, String> {
    let entries: Vec<ContainerListEntry> =
        CliExecutor::run_json_lines(container_cmd(), &["list", "-a", "--format", "json"]).await?;
    Ok(entries.into_iter().map(Container::from).collect())
}
```

- [ ] **Step 2: start/stop/restart/remove/prune 교체**

```rust
pub async fn container_start(id: String) -> Result<(), String> {
    CliExecutor::run(container_cmd(), &["start", &id]).await?;
    Ok(())
}

pub async fn container_stop(id: String) -> Result<(), String> {
    CliExecutor::run(container_cmd(), &["stop", &id]).await?;
    Ok(())
}

pub async fn container_restart(id: String) -> Result<(), String> {
    CliExecutor::run(container_cmd(), &["stop", &id]).await?;
    CliExecutor::run(container_cmd(), &["start", &id]).await?;
    Ok(())
}

pub async fn container_remove(id: String) -> Result<(), String> {
    CliExecutor::run(container_cmd(), &["delete", "-f", &id]).await?;
    Ok(())
}

pub async fn prune_containers() -> Result<String, String> {
    CliExecutor::run(container_cmd(), &["prune"]).await
}
```

- [ ] **Step 3: run_container 교체**

`docker run` → `container run` (동일 인터페이스):
```rust
pub async fn run_container(
    image: String,
    name: Option<String>,
    ports: Option<String>,
    env_vars: Option<Vec<String>>,
) -> Result<String, String> {
    let mut args: Vec<String> = vec!["run".into(), "-d".into()];
    // ... (기존 로직 동일, 마지막에)
    let refs: Vec<&str> = args.iter().map(|s| s.as_str()).collect();
    CliExecutor::run(container_cmd(), &refs).await
}
```

- [ ] **Step 4: stream_container_logs 교체**

```rust
pub async fn stream_container_logs(app: AppHandle, id: String) -> Result<(), String> {
    let mut child = Command::new(container_cmd())
        .args(["logs", "-f", "-n", "200", &id])
        .env("PATH", &*EXTENDED_PATH)
        // DOCKER_HOST 제거
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn container logs: {}", e))?;
    // ... 나머지 동일
}
```

- [ ] **Step 5: container_inspect 교체**

```rust
pub async fn container_inspect(id: String) -> Result<ContainerDetail, String> {
    let output = CliExecutor::run(container_cmd(), &["inspect", &id]).await?;
    // Apple Container inspect 출력 형식에 맞게 파싱
    // 실제 출력을 확인 후 파싱 로직 조정 필요
    let parsed: serde_json::Value =
        serde_json::from_str(&output).map_err(|e| format!("JSON parse error: {}", e))?;
    // ... 기존 파싱 로직 유지 (Apple Container inspect가 유사한 JSON 구조일 가능성 높음)
}
```

- [ ] **Step 6: container_stats 교체**

```rust
pub async fn container_stats(id: String) -> Result<ContainerStats, String> {
    let output = CliExecutor::run(container_cmd(), &["stats", &id]).await?;
    // Apple Container stats 출력 형식에 맞게 파싱
    // 실제 출력을 확인 후 파싱 로직 조정 필요
}
```

- [ ] **Step 7: 커밋**

```bash
git add src-tauri/src/commands/container.rs
git commit -m "refactor(commands): container.rs Docker CLI → Apple Container CLI 교체

docker ps → container list, docker rm → container delete,
docker logs --tail → container logs -n 등 전체 매핑."
```

---

### Task 6: 이미지 명령어 교체 (image.rs)

**Files:**
- Modify: `src-tauri/src/commands/image.rs`

- [ ] **Step 1: 전체 교체**

```rust
use crate::cli::executor::{container_cmd, CliExecutor, EXTENDED_PATH};
use crate::cli::types::{ImageListEntry, Image};
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;

#[tauri::command]
pub async fn list_images() -> Result<Vec<Image>, String> {
    let entries: Vec<ImageListEntry> =
        CliExecutor::run_json_lines(container_cmd(), &["image", "list", "--format", "json"]).await?;
    Ok(entries.into_iter().map(Image::from).collect())
}

#[tauri::command]
pub async fn pull_image(app: AppHandle, name: String) -> Result<(), String> {
    let mut child = Command::new(container_cmd())
        .args(["image", "pull", &name])
        .env("PATH", &*EXTENDED_PATH)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn container image pull: {}", e))?;

    let stdout = child.stdout.take().ok_or("No stdout")?;
    let app_clone = app.clone();
    tokio::spawn(async move {
        let reader = BufReader::new(stdout);
        let mut lines = reader.lines();
        while let Ok(Some(line)) = lines.next_line().await {
            let _ = app_clone.emit("image-pull-progress", &line);
        }
    });

    let output = child.wait().await
        .map_err(|e| format!("container image pull failed: {}", e))?;
    if output.success() {
        let _ = app.emit("image-pull-complete", &name);
        Ok(())
    } else {
        Err(format!("container image pull {} failed", name))
    }
}

#[tauri::command]
pub async fn remove_image(id: String) -> Result<(), String> {
    CliExecutor::run(container_cmd(), &["image", "delete", &id]).await?;
    Ok(())
}

#[tauri::command]
pub async fn prune_images() -> Result<String, String> {
    CliExecutor::run(container_cmd(), &["image", "prune", "-a"]).await
}
```

- [ ] **Step 2: 커밋**

```bash
git add src-tauri/src/commands/image.rs
git commit -m "refactor(commands): image.rs Docker CLI → Apple Container CLI 교체

docker images → container image list, docker rmi → container image delete."
```

---

### Task 7: 볼륨/네트워크 명령어 교체

**Files:**
- Modify: `src-tauri/src/commands/volume.rs`
- Modify: `src-tauri/src/commands/network.rs`

- [ ] **Step 1: volume.rs 교체**

```rust
use crate::cli::executor::{container_cmd, CliExecutor};
use crate::cli::types::{VolumeListEntry, Volume};

#[tauri::command]
pub async fn list_volumes() -> Result<Vec<Volume>, String> {
    let entries: Vec<VolumeListEntry> =
        CliExecutor::run_json_lines(container_cmd(), &["volume", "list", "--format", "json"]).await?;
    Ok(entries.into_iter().map(Volume::from).collect())
}

#[tauri::command]
pub async fn create_volume(name: String, driver: Option<String>) -> Result<String, String> {
    let mut args = vec!["volume", "create"];
    // Apple Container volume create는 driver 옵션이 다를 수 있음
    args.push(&name);
    CliExecutor::run(container_cmd(), &args).await
}

#[tauri::command]
pub async fn remove_volume(name: String) -> Result<(), String> {
    CliExecutor::run(container_cmd(), &["volume", "delete", &name]).await?;
    Ok(())
}

#[tauri::command]
pub async fn prune_volumes() -> Result<String, String> {
    CliExecutor::run(container_cmd(), &["volume", "prune"]).await
}
```

- [ ] **Step 2: network.rs 교체**

```rust
use crate::cli::executor::{container_cmd, CliExecutor};
use crate::cli::types::{NetworkListEntry, Network};

#[tauri::command]
pub async fn list_networks() -> Result<Vec<Network>, String> {
    let entries: Vec<NetworkListEntry> =
        CliExecutor::run_json_lines(container_cmd(), &["network", "list", "--format", "json"]).await?;
    Ok(entries.into_iter().map(Network::from).collect())
}

#[tauri::command]
pub async fn create_network(name: String, driver: Option<String>) -> Result<String, String> {
    let mut args = vec!["network", "create"];
    args.push(&name);
    CliExecutor::run(container_cmd(), &args).await
}

#[tauri::command]
pub async fn remove_network(id: String) -> Result<(), String> {
    CliExecutor::run(container_cmd(), &["network", "delete", &id]).await?;
    Ok(())
}

#[tauri::command]
pub async fn prune_networks() -> Result<String, String> {
    CliExecutor::run(container_cmd(), &["network", "prune"]).await
}
```

- [ ] **Step 3: 커밋**

```bash
git add src-tauri/src/commands/volume.rs src-tauri/src/commands/network.rs
git commit -m "refactor(commands): volume.rs, network.rs Apple Container CLI로 교체

docker volume/network → container volume/network 매핑."
```

---

### Task 8: Compose / DevContainer 제거 (Rust 백엔드)

**Files:**
- Modify: `src-tauri/src/commands/project.rs` (compose/devcontainer 분기 제거)
- Delete: `src-tauri/src/commands/project_config.rs`
- Delete: `src-tauri/schemas/devContainer.base.schema.json` (존재하면)
- Modify: `src-tauri/src/commands/env_secrets.rs` (`prepare_secrets_for_compose()` 제거)
- Modify: `src-tauri/src/commands/mod.rs`

- [ ] **Step 1: `project.rs`에서 compose/devcontainer 함수 제거**

제거할 함수들:
- `find_docker_compose_cmd()`
- `compose_up()`
- `get_compose_status()`
- `find_devcontainer_cli()`
- `devcontainer_project_up()`
- `get_devcontainer_status()`
- `check_devcontainer_cli()`
- `migrate_config_if_needed()` (또는 devcontainer/compose 마이그레이션 로직만 제거)

- [ ] **Step 2: `project_up()`에서 compose/devcontainer 분기 제거**

dockerfile 분기만 남기도록 match 문 단순화.

- [ ] **Step 3: `project_stop()`에서 compose/devcontainer 분기 제거**

- [ ] **Step 4: `detect_project_type()`에서 compose/devcontainer 감지 제거**

Dockerfile, dotenv만 감지:
```rust
pub async fn detect_project_type(workspace_path: String) -> ProjectTypeDetection {
    let path = std::path::Path::new(&workspace_path);
    let dockerfiles = ["Dockerfile", "dockerfile", "Dockerfile.dev", "Dockerfile.development"]
        .iter()
        .filter(|f| path.join(f).exists())
        .map(|f| f.to_string())
        .collect();
    let dotenv_files = [".env", ".env.local", ".env.development", ".env.dev"]
        .iter()
        .filter(|f| path.join(f).exists())
        .map(|f| f.to_string())
        .collect();
    ProjectTypeDetection {
        has_dockerfile: !dockerfiles.is_empty(),
        dockerfiles,
        dotenv_files,
    }
}
```

- [ ] **Step 5: `project.rs`의 `dockerfile_up()`에서 Docker CLI → Apple Container CLI 교체**

`docker build` → `container build`, `docker run` → `container run`, `docker rm` → `container delete` 등.

컨테이너 이름 접두사: `colima-project-` → `acd-project-`

- [ ] **Step 6: `project_config.rs` 삭제**

- [ ] **Step 7: `env_secrets.rs`에서 `prepare_secrets_for_compose()` 제거**

- [ ] **Step 8: `mod.rs` 수정**

`pub mod project_config;` 제거

- [ ] **Step 9: 커밋**

```bash
git add -A src-tauri/src/commands/ src-tauri/schemas/
git commit -m "refactor(commands): Compose/DevContainer 코드 전면 제거

project_config.rs 삭제, compose_up/devcontainer_project_up 제거,
detect_project_type 단순화, dockerfile_up의 CLI를 Apple Container로 교체."
```

---

### Task 9: DNS/Proxy → Apple Container 내장 DNS 교체

**Files:**
- Delete: `src-tauri/src/proxy/dns.rs`
- Delete: `src-tauri/src/proxy/gateway.rs`
- Delete: `src-tauri/src/proxy/sync.rs`
- Modify: `src-tauri/src/proxy/config.rs` (단순화)
- Modify: `src-tauri/src/proxy/mod.rs`
- Rewrite: `src-tauri/src/commands/proxy.rs` → 내장 DNS 명령어

- [ ] **Step 1: `proxy/dns.rs`, `proxy/gateway.rs`, `proxy/sync.rs` 삭제**

- [ ] **Step 2: `proxy/config.rs` 단순화**

`PortRoute` 제거, `ContainerDomainOverride.port_routes` 제거. 기본 도메인을 `container.local`로 변경:

```rust
fn default_domain_suffix() -> String {
    "container.local".to_string()
}
```

- [ ] **Step 3: `proxy/mod.rs` 수정**

`dns`, `gateway`, `sync` 모듈 제거:
```rust
pub mod config;
```

- [ ] **Step 4: `commands/proxy.rs` → Apple Container DNS 명령어로 재작성**

`ProxyState` 제거 (DNS 서버/게이트웨이 더 이상 관리하지 않음).

새 명령어:
```rust
use crate::cli::executor::CliExecutor;
use crate::proxy::config::{self as domain_config, DomainConfig, ContainerDomainOverride};
use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize)]
pub struct DomainStatus {
    pub enabled: bool,
    pub domain_suffix: String,
    pub dns_domains: Vec<String>,
}

#[tauri::command]
pub async fn domain_get_config(app: tauri::AppHandle) -> Result<DomainConfig, String> {
    let path = config_path(&app)?;
    Ok(domain_config::load_config(&path).await)
}

#[tauri::command]
pub async fn domain_set_config(app: tauri::AppHandle, config: DomainConfig) -> Result<(), String> {
    let path = config_path(&app)?;
    domain_config::save_config(&path, &config).await
}

#[tauri::command]
pub async fn domain_setup(domain: String) -> Result<(), String> {
    // sudo 필요 — osascript를 통해 권한 요청
    let script = format!(
        r#"do shell script "container system dns create {} --localhost" with administrator privileges"#,
        domain
    );
    let output = tokio::process::Command::new("osascript")
        .args(["-e", &script])
        .output()
        .await
        .map_err(|e| format!("Failed to run osascript: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to create DNS domain: {}", stderr));
    }
    // 기본 DNS 도메인으로도 설정
    CliExecutor::run("container", &["system", "property", "set", "dns.domain", &domain]).await?;
    Ok(())
}

#[tauri::command]
pub async fn domain_teardown(domain: String) -> Result<(), String> {
    let script = format!(
        r#"do shell script "container system dns delete {}" with administrator privileges"#,
        domain
    );
    let output = tokio::process::Command::new("osascript")
        .args(["-e", &script])
        .output()
        .await
        .map_err(|e| format!("Failed to run osascript: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to delete DNS domain: {}", stderr));
    }
    Ok(())
}

#[tauri::command]
pub async fn domain_status() -> Result<DomainStatus, String> {
    let output = CliExecutor::run("container", &["system", "dns", "list"]).await
        .unwrap_or_default();
    let dns_domains: Vec<String> = output.lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    let suffix = CliExecutor::run("container", &["system", "property", "get", "dns.domain"])
        .await
        .unwrap_or_else(|_| "container.local".to_string())
        .trim()
        .to_string();
    Ok(DomainStatus {
        enabled: !dns_domains.is_empty(),
        domain_suffix: suffix,
        dns_domains,
    })
}
```

- [ ] **Step 5: `lib.rs` 수정**

`ProxyState` 관련 코드 제거:
- `.manage(commands::proxy::ProxyState::new())` 제거
- `start_proxy_services()` 자동 시작 제거
- IPC 핸들러에서 제거: `domain_sync`, `proxy_start`, `proxy_stop`, `proxy_get_status`, `proxy_install_resolver`, `proxy_uninstall_resolver`, `domain_set_override`, `domain_remove_override`
- 새 핸들러 등록: `domain_setup`, `domain_teardown`, `domain_status`

`pub mod proxy;` (lib.rs 상단) 유지하되, 내부 모듈 구조가 단순화됨.

- [ ] **Step 6: 커밋**

```bash
git add -A src-tauri/src/proxy/ src-tauri/src/commands/proxy.rs src-tauri/src/lib.rs
git commit -m "refactor(proxy): 자체 DNS/Traefik을 Apple Container 내장 DNS로 교체

dns.rs, gateway.rs, sync.rs 삭제.
container system dns create/delete/list 명령어로 대체.
ProxyState 및 자동 시작 로직 제거."
```

---

### Task 10: 레지스트리 관리 패널 교체 (docker_settings.rs → registry_settings.rs)

**Files:**
- Delete: `src-tauri/src/commands/docker_settings.rs`
- Create: `src-tauri/src/commands/registry_settings.rs`
- Modify: `src-tauri/src/commands/mod.rs`

- [ ] **Step 1: `registry_settings.rs` 생성**

```rust
use crate::cli::executor::CliExecutor;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct RegistryEntry {
    pub registry: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct RegistrySettings {
    pub registries: Vec<RegistryEntry>,
    pub default_domain: String,
}

#[tauri::command]
pub async fn get_registry_settings() -> Result<RegistrySettings, String> {
    let output = CliExecutor::run("container", &["registry", "list"]).await
        .unwrap_or_default();
    let registries: Vec<RegistryEntry> = output.lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .map(|r| RegistryEntry { registry: r })
        .collect();
    let default_domain = CliExecutor::run("container", &["system", "property", "get", "registry.domain"])
        .await
        .unwrap_or_default()
        .trim()
        .to_string();
    Ok(RegistrySettings {
        registries,
        default_domain,
    })
}

#[tauri::command]
pub async fn registry_login(registry: String, username: String, password: String) -> Result<(), String> {
    use tokio::process::Command;
    use crate::cli::executor::EXTENDED_PATH;

    let mut child = Command::new("container")
        .args(["registry", "login", &registry, "-u", &username, "--password-stdin"])
        .env("PATH", &*EXTENDED_PATH)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to spawn: {}", e))?;

    if let Some(mut stdin) = child.stdin.take() {
        use tokio::io::AsyncWriteExt;
        stdin.write_all(password.as_bytes()).await
            .map_err(|e| format!("Failed to write password: {}", e))?;
    }

    let output = child.wait_with_output().await
        .map_err(|e| format!("Failed to wait: {}", e))?;
    if output.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        Err(format!("Login failed: {}", stderr))
    }
}

#[tauri::command]
pub async fn registry_logout(registry: String) -> Result<(), String> {
    CliExecutor::run("container", &["registry", "logout", &registry]).await?;
    Ok(())
}

#[tauri::command]
pub async fn set_default_registry(domain: String) -> Result<(), String> {
    CliExecutor::run("container", &["system", "property", "set", "registry.domain", &domain]).await?;
    Ok(())
}
```

- [ ] **Step 2: `docker_settings.rs` 삭제, `mod.rs` 수정**

`pub mod docker_settings;` → `pub mod registry_settings;`

- [ ] **Step 3: 커밋**

```bash
git add -A src-tauri/src/commands/
git commit -m "refactor(commands): docker_settings.rs를 registry_settings.rs로 교체

Colima YAML 기반 Docker 데몬 설정 → container registry 명령어 기반 레지스트리 관리."
```

---

### Task 11: 업데이트/온보딩/트레이 수정

**Files:**
- Modify: `src-tauri/src/commands/update.rs`
- Modify: `src-tauri/src/commands/onboarding.rs`
- Modify: `src-tauri/src/tray.rs`

- [ ] **Step 1: `update.rs` — Colima 버전 체크 → Apple Container 버전 체크**

```rust
use crate::cli::executor::CliExecutor;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct ContainerVersion {
    pub version: String,
}

#[tauri::command]
pub async fn get_container_version() -> Result<ContainerVersion, String> {
    let output = CliExecutor::run("container", &["system", "version"]).await?;
    Ok(ContainerVersion {
        version: output.trim().to_string(),
    })
}
```

`update_colima_runtime()`, `check_latest_version()`, `parse_colima_version()` 제거.

- [ ] **Step 2: `onboarding.rs` — Colima → container 바이너리 체크**

```rust
use crate::cli::executor::find_binary;
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct ContainerInstallCheck {
    pub installed: bool,
    pub path: Option<String>,
}

#[tauri::command]
pub async fn check_container_installed() -> Result<ContainerInstallCheck, String> {
    match find_binary("container") {
        Some(path) => Ok(ContainerInstallCheck { installed: true, path: Some(path) }),
        None => Ok(ContainerInstallCheck { installed: false, path: None }),
    }
}

#[tauri::command]
pub async fn check_onboarding_needed() -> Result<bool, String> {
    let config_dir = dirs::config_dir().ok_or("Cannot find config directory")?;
    let settings_path = config_dir.join("apple-container-desktop").join("app-settings.json");
    Ok(!settings_path.exists())
}

#[tauri::command]
pub async fn complete_onboarding() -> Result<(), String> {
    let config_dir = dirs::config_dir().ok_or("Cannot find config directory")?;
    let app_dir = config_dir.join("apple-container-desktop");
    tokio::fs::create_dir_all(&app_dir).await
        .map_err(|e| format!("Failed to create config dir: {}", e))?;
    let settings_path = app_dir.join("app-settings.json");
    tokio::fs::write(&settings_path, "{}").await
        .map_err(|e| format!("Failed to write settings: {}", e))?;
    Ok(())
}
```

- [ ] **Step 3: `tray.rs` — Colima 참조를 Apple Container로 교체**

주요 변경:
- `fetch_colima_status()` → `fetch_system_status()`: `container system status` 호출
- `fetch_running_containers()`: `container_cmd()` 사용, `ContainerListEntry` 타입
- `build_tray_menu()`: "Colima: Running/Stopped" → "Container: Running/Stopped"
- "Start/Stop/Restart Colima" → "Start/Stop/Restart Container"
- "Quit Colima Desktop" → "Quit Apple Container Desktop"
- 툴팁: "Colima Desktop" → "Apple Container Desktop"
- 메뉴 이벤트 핸들러: `crate::commands::colima::*` → `crate::commands::system::*`
- 상태 텍스트에서 CPU/RAM/Disk → 단순히 "Running"/"Stopped"

- [ ] **Step 4: 커밋**

```bash
git add src-tauri/src/commands/update.rs src-tauri/src/commands/onboarding.rs src-tauri/src/tray.rs
git commit -m "refactor: update/onboarding/tray Colima → Apple Container 교체

Colima 버전 체크 → container system version,
onboarding: colima 바이너리 → container 바이너리 체크,
tray: 모든 Colima 텍스트 및 명령어 교체."
```

---

### Task 12: lib.rs IPC 핸들러 통합 수정

**Files:**
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 전체 IPC 핸들러 목록 갱신**

```rust
mod cli;
mod commands;
pub mod crypto;
pub mod proxy;
mod tray;

use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_liquid_glass::init())
        // ProxyState 제거
        .invoke_handler(tauri::generate_handler![
            // System (was: colima)
            commands::system::system_status,
            commands::system::system_start,
            commands::system::system_stop,
            commands::system::system_restart,
            // Container
            commands::container::list_containers,
            commands::container::container_start,
            commands::container::container_stop,
            commands::container::container_restart,
            commands::container::container_remove,
            commands::container::stream_container_logs,
            commands::container::prune_containers,
            commands::container::run_container,
            commands::container::container_inspect,
            commands::container::container_stats,
            // Image
            commands::image::list_images,
            commands::image::pull_image,
            commands::image::remove_image,
            commands::image::prune_images,
            // Resource Settings (was: vm_settings)
            commands::resource_settings::get_resource_settings,
            commands::resource_settings::get_host_info,
            commands::resource_settings::apply_resource_settings,
            // Volume
            commands::volume::list_volumes,
            commands::volume::create_volume,
            commands::volume::remove_volume,
            commands::volume::prune_volumes,
            // Network
            commands::network::list_networks,
            commands::network::create_network,
            commands::network::remove_network,
            commands::network::prune_networks,
            // Mounts (Colima mount 설정은 제거 또는 유지 판단)
            // Network Settings (Colima 네트워크 설정은 제거 또는 유지 판단)
            // Registry Settings (was: docker_settings)
            commands::registry_settings::get_registry_settings,
            commands::registry_settings::registry_login,
            commands::registry_settings::registry_logout,
            commands::registry_settings::set_default_registry,
            // Update
            commands::update::get_container_version,
            // Onboarding
            commands::onboarding::check_container_installed,
            commands::onboarding::check_onboarding_needed,
            commands::onboarding::complete_onboarding,
            // Project
            commands::project::detect_project_type,
            commands::project::list_projects,
            commands::project::add_project,
            commands::project::update_project,
            commands::project::remove_project,
            commands::project::project_up,
            commands::project::project_stop,
            commands::project::project_logs,
            commands::project::project_rebuild,
            commands::project::load_dotenv_file,
            commands::project::run_env_command,
            commands::project::open_terminal_exec,
            // Environment Secrets
            commands::env_secrets::create_profile,
            commands::env_secrets::delete_profile,
            commands::env_secrets::switch_profile,
            commands::env_secrets::set_env_var,
            commands::env_secrets::remove_env_var,
            commands::env_secrets::bulk_import_env,
            commands::env_secrets::load_dotenv_for_profile,
            commands::env_secrets::export_profile_to_dotenv,
            commands::env_secrets::check_infisical_installed,
            commands::env_secrets::configure_infisical,
            commands::env_secrets::sync_infisical,
            commands::env_secrets::test_infisical_connection,
            // Global Env Store
            commands::env_store::list_env_profiles,
            commands::env_store::create_env_profile,
            commands::env_store::delete_env_profile,
            commands::env_store::rename_env_profile,
            commands::env_store::add_global_env_var,
            commands::env_store::remove_global_env_var,
            commands::env_store::toggle_global_env_var,
            commands::env_store::import_dotenv_to_profile,
            commands::env_store::reimport_dotenv,
            commands::env_store::configure_profile_infisical,
            commands::env_store::sync_profile_infisical,
            commands::env_store::test_profile_infisical,
            commands::env_store::get_resolved_env_vars,
            commands::env_store::decrypt_global_env_secret,
            commands::env_store::decrypt_project_env_secret,
            // App Settings
            commands::app_settings::get_app_settings,
            commands::app_settings::save_app_settings,
            // Domain (was: proxy with DNS+Traefik)
            commands::proxy::domain_get_config,
            commands::proxy::domain_set_config,
            commands::proxy::domain_setup,
            commands::proxy::domain_teardown,
            commands::proxy::domain_status,
        ])
        .setup(|app| {
            tray::create_tray(app)?;
            // DNS/Gateway 자동 시작 제거
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

- [ ] **Step 2: Colima 전용 설정 모듈 제거 여부 판단**

`mounts.rs`, `network_settings.rs`는 Colima YAML 설정 기반. Apple Container에서는 불필요하므로 제거:
- `mod.rs`에서 `pub mod mounts;`, `pub mod network_settings;` 제거
- 해당 파일 삭제

- [ ] **Step 3: `cargo check`로 빌드 확인**

Run: `cd src-tauri && cargo check 2>&1 | tail -30`
Expected: 백엔드 컴파일 성공 (프론트엔드 수정 전이므로 타입 불일치는 런타임에서 확인)

- [ ] **Step 4: 커밋**

```bash
git add -A src-tauri/
git commit -m "refactor(lib): IPC 핸들러 전체 갱신 — Apple Container 통합 완료

Colima/Docker 전용 핸들러 제거, Apple Container 핸들러 등록,
mounts/network_settings 모듈 제거, ProxyState 제거."
```

---

### Task 13: 프론트엔드 타입 교체 (types/index.ts)

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Colima/Docker/Compose/DevContainer 타입 교체**

```typescript
// Container — compose 필드 제거
export interface Container {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string;
  created_at: string;
}

// ColimaStatus → SystemStatus
export interface SystemStatus {
  running: boolean;
  version: string;
}

// VmSettings → ResourceSettings
export interface ResourceSettings {
  container_cpus: string;
  container_memory: string;
  build_cpus: string;
  build_memory: string;
}

// DockerDaemonSettings → RegistrySettings
export interface RegistryEntry {
  registry: string;
}
export interface RegistrySettings {
  registries: RegistryEntry[];
  default_domain: string;
}

// ColimaVersion → ContainerVersion
export interface ContainerVersion {
  version: string;
}

// ColimaInstallCheck → ContainerInstallCheck
export interface ContainerInstallCheck {
  installed: boolean;
  path: string | null;
}

// ProjectType — "compose" | "devcontainer" 제거
export type ProjectType = "dockerfile";

// Project — compose/devcontainer 필드 제거
export interface Project {
  id: string;
  name: string;
  workspace_path: string;
  project_type: ProjectType;
  env_vars: EnvVarEntry[];
  dotenv_path: string | null;
  remote_debug: boolean;
  debug_port: number;
  dockerfile: string | null;
  env_command: string | null;
  ports: string[];
  startup_command: string | null;
  active_profile: string;
  profiles: string[];
  infisical_config: InfisicalConfig | null;
  env_binding: ProjectEnvBinding;
  domain: string | null;
  status: "running" | "stopped" | "not_created" | "path_missing" | "unknown";
  container_ids: string[];
}

// ProjectTypeDetection — compose/devcontainer 제거
export interface ProjectTypeDetection {
  has_dockerfile: boolean;
  dockerfiles: string[];
  dotenv_files: string[];
}

// ProxyStatus → DomainStatus
export interface DomainStatus {
  enabled: boolean;
  domain_suffix: string;
  dns_domains: string[];
}
```

제거할 타입: `DevcontainerConfigResponse`, `DevcontainerValidationError`, `ConfigTab`, `DevcontainerSourceType`, `ProxyRoute`, `ProxyStatus`, `DomainServiceEntry`, `DomainSyncResult`, `PortRoute`, `MountSettings`, `MountEntry`, `NetworkSettings`, `DnsHostEntry`, `RuntimeVersion`, `VersionCheck`

- [ ] **Step 2: 커밋**

```bash
git add src/types/index.ts
git commit -m "refactor(types): TypeScript 타입을 Apple Container에 맞게 교체

Colima/Docker/Compose/DevContainer 타입 제거,
SystemStatus/ResourceSettings/RegistrySettings/DomainStatus 추가."
```

---

### Task 14: 프론트엔드 API 래퍼 교체 (tauri.ts)

**Files:**
- Modify: `src/lib/tauri.ts`

- [ ] **Step 1: import 및 API 전체 교체**

Colima/Docker/Compose/DevContainer API 제거, Apple Container API로 교체:

```typescript
import { invoke } from "@tauri-apps/api/core";
import type {
  Container, Image, SystemStatus, ResourceSettings, HostInfo, Volume, Network,
  RegistrySettings, ContainerDetail, ContainerStats, ContainerVersion,
  ContainerInstallCheck, Project, ProjectTypeDetection, EnvVarEntry,
  InfisicalConfig, AppSettings, GlobalEnvVar, EnvProfile, ProjectEnvBinding,
  DomainConfig, ContainerDomainOverride, DomainStatus
} from "../types";

export const api = {
  // System (was: Colima)
  systemStatus: () => invoke<SystemStatus>("system_status"),
  systemStart: () => invoke<void>("system_start"),
  systemStop: () => invoke<void>("system_stop"),
  systemRestart: () => invoke<void>("system_restart"),

  // Container
  listContainers: () => invoke<Container[]>("list_containers"),
  containerStart: (id: string) => invoke<void>("container_start", { id }),
  containerStop: (id: string) => invoke<void>("container_stop", { id }),
  containerRestart: (id: string) => invoke<void>("container_restart", { id }),
  containerRemove: (id: string) => invoke<void>("container_remove", { id }),
  streamContainerLogs: (id: string) => invoke<void>("stream_container_logs", { id }),
  pruneContainers: () => invoke<string>("prune_containers"),
  runContainer: (params: { image: string; name?: string; ports?: string; envVars?: string[] }) =>
    invoke<string>("run_container", params),
  containerInspect: (id: string) => invoke<ContainerDetail>("container_inspect", { id }),
  containerStats: (id: string) => invoke<ContainerStats>("container_stats", { id }),

  // Image
  listImages: () => invoke<Image[]>("list_images"),
  pullImage: (name: string) => invoke<void>("pull_image", { name }),
  removeImage: (id: string) => invoke<void>("remove_image", { id }),
  pruneImages: () => invoke<string>("prune_images"),

  // Resource Settings (was: VM Settings)
  getResourceSettings: () => invoke<ResourceSettings>("get_resource_settings"),
  getHostInfo: () => invoke<HostInfo>("get_host_info"),
  applyResourceSettings: (settings: { containerCpus: string; containerMemory: string; buildCpus: string; buildMemory: string }) =>
    invoke<void>("apply_resource_settings", settings),

  // Volume
  listVolumes: () => invoke<Volume[]>("list_volumes"),
  createVolume: (params: { name: string; driver?: string }) => invoke<string>("create_volume", params),
  removeVolume: (name: string) => invoke<void>("remove_volume", { name }),
  pruneVolumes: () => invoke<string>("prune_volumes"),

  // Network
  listNetworks: () => invoke<Network[]>("list_networks"),
  createNetwork: (params: { name: string; driver?: string }) => invoke<string>("create_network", params),
  removeNetwork: (id: string) => invoke<void>("remove_network", { id }),
  pruneNetworks: () => invoke<string>("prune_networks"),

  // Registry (was: Docker Settings)
  getRegistrySettings: () => invoke<RegistrySettings>("get_registry_settings"),
  registryLogin: (params: { registry: string; username: string; password: string }) =>
    invoke<void>("registry_login", params),
  registryLogout: (registry: string) => invoke<void>("registry_logout", { registry }),
  setDefaultRegistry: (domain: string) => invoke<void>("set_default_registry", { domain }),

  // Version
  getContainerVersion: () => invoke<ContainerVersion>("get_container_version"),

  // Onboarding
  checkContainerInstalled: () => invoke<ContainerInstallCheck>("check_container_installed"),
  checkOnboardingNeeded: () => invoke<boolean>("check_onboarding_needed"),
  completeOnboarding: () => invoke<void>("complete_onboarding"),

  // Projects
  detectProjectType: (workspacePath: string) =>
    invoke<ProjectTypeDetection>("detect_project_type", { workspacePath }),
  listProjects: () => invoke<Project[]>("list_projects"),
  addProject: (params: { name: string; workspacePath: string; projectType: string; dockerfile?: string }) =>
    invoke<Project>("add_project", params),
  updateProject: (project: Omit<Project, "status" | "container_ids">) =>
    invoke<void>("update_project", { project }),
  removeProject: (id: string, stopContainers: boolean) =>
    invoke<void>("remove_project", { id, stopContainers }),
  projectUp: (id: string) => invoke<void>("project_up", { id }),
  projectStop: (id: string) => invoke<void>("project_stop", { id }),
  projectLogs: (id: string) => invoke<void>("project_logs", { id }),
  projectRebuild: (id: string) => invoke<void>("project_rebuild", { id }),
  loadDotenvFile: (filePath: string) => invoke<EnvVarEntry[]>("load_dotenv_file", { filePath }),
  runEnvCommand: (command: string, workspacePath: string) =>
    invoke<EnvVarEntry[]>("run_env_command", { command, workspacePath }),
  openTerminalExec: (containerId: string) => invoke<void>("open_terminal_exec", { containerId }),
  getAppSettings: () => invoke<AppSettings>("get_app_settings"),
  saveAppSettings: (params: { terminal: string; shell: string }) =>
    invoke<void>("save_app_settings", params),

  // Environment & Secrets (unchanged)
  createProfile: (projectId: string, profileName: string) =>
    invoke<Project>("create_profile", { projectId, profileName }),
  deleteProfile: (projectId: string, profileName: string) =>
    invoke<Project>("delete_profile", { projectId, profileName }),
  switchProfile: (projectId: string, profileName: string) =>
    invoke<Project>("switch_profile", { projectId, profileName }),
  setEnvVar: (projectId: string, entry: EnvVarEntry) =>
    invoke<Project>("set_env_var", { projectId, entry }),
  removeEnvVar: (projectId: string, key: string, profile: string) =>
    invoke<Project>("remove_env_var", { projectId, key, profile }),
  bulkImportEnv: (projectId: string, profile: string, entries: EnvVarEntry[]) =>
    invoke<Project>("bulk_import_env", { projectId, profile, entries }),
  loadDotenvForProfile: (projectId: string, filePath: string, profile: string) =>
    invoke<Project>("load_dotenv_for_profile", { projectId, filePath, profile }),
  exportProfileToDotenv: (projectId: string, profile: string, filePath: string) =>
    invoke<void>("export_profile_to_dotenv", { projectId, profile, filePath }),
  checkInfisicalInstalled: () => invoke<boolean>("check_infisical_installed"),
  configureInfisical: (projectId: string, config: InfisicalConfig) =>
    invoke<Project>("configure_infisical", { projectId, config }),
  syncInfisical: (projectId: string) => invoke<EnvVarEntry[]>("sync_infisical", { projectId }),
  testInfisicalConnection: (projectId: string) => invoke<boolean>("test_infisical_connection", { projectId }),

  // Global Env Store (unchanged)
  listEnvProfiles: () => invoke<EnvProfile[]>("list_env_profiles"),
  createEnvProfile: (name: string) => invoke<EnvProfile>("create_env_profile", { name }),
  deleteEnvProfile: (profileId: string) => invoke<void>("delete_env_profile", { profileId }),
  renameEnvProfile: (profileId: string, newName: string) =>
    invoke<EnvProfile>("rename_env_profile", { profileId, newName }),
  addGlobalEnvVar: (profileId: string, entry: GlobalEnvVar) =>
    invoke<EnvProfile>("add_global_env_var", { profileId, entry }),
  removeGlobalEnvVar: (profileId: string, key: string, source: string) =>
    invoke<EnvProfile>("remove_global_env_var", { profileId, key, source }),
  toggleGlobalEnvVar: (profileId: string, key: string, source: string, enabled: boolean) =>
    invoke<EnvProfile>("toggle_global_env_var", { profileId, key, source, enabled }),
  importDotenvToProfile: (profileId: string, filePath: string) =>
    invoke<EnvProfile>("import_dotenv_to_profile", { profileId, filePath }),
  reimportDotenv: (profileId: string, filePath: string) =>
    invoke<EnvProfile>("reimport_dotenv", { profileId, filePath }),
  configureProfileInfisical: (profileId: string, config: InfisicalConfig) =>
    invoke<EnvProfile>("configure_profile_infisical", { profileId, config }),
  syncProfileInfisical: (profileId: string) =>
    invoke<EnvProfile>("sync_profile_infisical", { profileId }),
  testProfileInfisical: (profileId: string) =>
    invoke<boolean>("test_profile_infisical", { profileId }),
  getResolvedEnvVars: (profileId: string) =>
    invoke<GlobalEnvVar[]>("get_resolved_env_vars", { profileId }),
  decryptGlobalEnvSecret: (profileId: string, key: string) =>
    invoke<string>("decrypt_global_env_secret", { profileId, key }),
  decryptProjectEnvSecret: (projectId: string, key: string, profile: string) =>
    invoke<string>("decrypt_project_env_secret", { projectId, key, profile }),

  // Domain (was: DNS + Reverse Proxy)
  domainGetConfig: () => invoke<DomainConfig>("domain_get_config"),
  domainSetConfig: (config: DomainConfig) => invoke<void>("domain_set_config", { config }),
  domainSetup: (domain: string) => invoke<void>("domain_setup", { domain }),
  domainTeardown: (domain: string) => invoke<void>("domain_teardown", { domain }),
  domainStatus: () => invoke<DomainStatus>("domain_status"),
};
```

- [ ] **Step 2: 커밋**

```bash
git add src/lib/tauri.ts
git commit -m "refactor(api): Tauri API 래퍼를 Apple Container에 맞게 전면 교체

Colima/Docker/Compose/DevContainer API 제거,
systemStatus/resourceSettings/registrySettings/domainSetup 등 추가."
```

---

### Task 15: 프론트엔드 훅 교체

**Files:**
- Delete: `src/hooks/useColimaStatus.ts`
- Delete: `src/hooks/useColimaVersion.ts`
- Delete: `src/hooks/useDockerSettings.ts`
- Delete: `src/hooks/useVmSettings.ts`
- Delete: `src/hooks/useProjectConfig.ts`
- Delete: `src/hooks/useMounts.ts`
- Delete: `src/hooks/useNetworkSettings.ts`
- Create: `src/hooks/useSystemStatus.ts`
- Create: `src/hooks/useContainerVersion.ts`
- Create: `src/hooks/useRegistrySettings.ts`
- Create: `src/hooks/useResourceSettings.ts`

- [ ] **Step 1: `useSystemStatus.ts` 생성**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";

export function useSystemStatus() {
  return useQuery({
    queryKey: ["system-status"],
    queryFn: api.systemStatus,
    refetchInterval: 5000,
  });
}

export function useSystemAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: "start" | "stop" | "restart") => {
      switch (action) {
        case "start": return api.systemStart();
        case "stop": return api.systemStop();
        case "restart": return api.systemRestart();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-status"] });
    },
  });
}
```

- [ ] **Step 2: `useContainerVersion.ts` 생성**

```typescript
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/tauri";

export function useContainerVersion() {
  return useQuery({
    queryKey: ["container-version"],
    queryFn: api.getContainerVersion,
  });
}
```

- [ ] **Step 3: `useRegistrySettings.ts` 생성**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";

export function useRegistrySettings() {
  return useQuery({
    queryKey: ["registry-settings"],
    queryFn: api.getRegistrySettings,
    refetchInterval: 10000,
  });
}

export function useRegistryLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { registry: string; username: string; password: string }) =>
      api.registryLogin(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registry-settings"] });
    },
  });
}

export function useRegistryLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (registry: string) => api.registryLogout(registry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registry-settings"] });
    },
  });
}
```

- [ ] **Step 4: `useResourceSettings.ts` 생성**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";

export function useResourceSettings() {
  return useQuery({
    queryKey: ["resource-settings"],
    queryFn: api.getResourceSettings,
    refetchInterval: 10000,
  });
}

export function useHostInfo() {
  return useQuery({
    queryKey: ["host-info"],
    queryFn: api.getHostInfo,
    staleTime: Infinity,
  });
}

export function useApplyResourceSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: {
      containerCpus: string;
      containerMemory: string;
      buildCpus: string;
      buildMemory: string;
    }) => api.applyResourceSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resource-settings"] });
      queryClient.invalidateQueries({ queryKey: ["system-status"] });
    },
  });
}
```

- [ ] **Step 5: 구 훅 파일 삭제**

`useColimaStatus.ts`, `useColimaVersion.ts`, `useDockerSettings.ts`, `useVmSettings.ts`, `useProjectConfig.ts`, `useMounts.ts`, `useNetworkSettings.ts` 삭제.

- [ ] **Step 6: `useDomains.ts` 수정**

기존 proxy 관련 API 호출을 새 domain API로 교체.

- [ ] **Step 7: 커밋**

```bash
git add -A src/hooks/
git commit -m "refactor(hooks): React Query 훅을 Apple Container에 맞게 교체

useColimaStatus → useSystemStatus, useVmSettings → useResourceSettings,
useDockerSettings → useRegistrySettings. DevContainer/Mounts 훅 삭제."
```

---

### Task 16: 프론트엔드 컴포넌트 정리 (DevContainer 삭제 + 참조 수정)

**Files:**
- Delete: `src/components/devcontainer-config/` (전체 디렉토리)
- Modify: 컴포넌트에서 Colima/Compose/DevContainer 참조 수정 (다수)

- [ ] **Step 1: `src/components/devcontainer-config/` 디렉토리 삭제**

- [ ] **Step 2: 모든 컴포넌트에서 삭제된 훅/타입/API 참조 수정**

`grep -r`로 `useColimaStatus`, `useColimaVersion`, `useDockerSettings`, `useVmSettings`, `useProjectConfig`, `compose`, `devcontainer`, `ColimaStatus`, `VmSettings`, `DockerDaemonSettings` 등을 검색하여 모든 참조를 새 이름으로 교체.

주요 수정 대상:
- `AddProjectWizard.tsx`: Compose/DevContainer 선택지 제거
- `ProjectCard.tsx`: compose/devcontainer 상태 분기 제거
- `ProjectDetail.tsx`: compose/devcontainer 설정 UI 제거
- 설정 패널들: `VmSettings.tsx` → 리소스 설정, `DockerSettingsPanel.tsx` → 레지스트리 패널
- `ContainerDomainsSettings.tsx`: Traefik/게이트웨이 UI 제거
- 온보딩 컴포넌트: Colima → Container 텍스트 교체

- [ ] **Step 3: `npm run build`로 프론트엔드 빌드 확인**

Run: `npm run build 2>&1 | tail -20`
Expected: TypeScript 컴파일 + Vite 빌드 성공

- [ ] **Step 4: 커밋**

```bash
git add -A src/components/ src/hooks/ src/types/ src/lib/
git commit -m "refactor(ui): DevContainer 컴포넌트 삭제 및 전체 참조 수정

devcontainer-config/ 삭제, Compose/DevContainer UI 분기 제거,
설정 패널 교체, Colima 텍스트 → Apple Container 교체."
```

---

### Task 17: 브랜딩 및 설정 경로 변경

**Files:**
- Modify: `src-tauri/tauri.conf.json`
- Modify: `src-tauri/src/commands/onboarding.rs` (이미 Task 11에서 수정)
- Modify: `src-tauri/src/commands/project.rs` (config_path)
- Modify: `src-tauri/src/commands/app_settings.rs`
- Modify: `src-tauri/src/commands/env_store.rs` (config_path)
- Modify: `CLAUDE.md`
- Modify: `package.json` (있으면)

- [ ] **Step 1: `tauri.conf.json` 변경**

```json
{
  "productName": "Apple Container Desktop",
  "identifier": "com.yoonhogo.apple-container-desktop",
  "app": {
    "windows": [{ "title": "Apple Container Desktop", ... }]
  },
  "plugins": {
    "updater": {
      "endpoints": [
        "https://github.com/yoonhoGo/apple-container-desktop/releases/latest/download/latest.json"
      ]
    }
  }
}
```

- [ ] **Step 2: 설정 디렉토리 경로 변경**

`project.rs`의 `config_path()`:
```rust
fn config_path() -> PathBuf {
    let config_dir = dirs::config_dir().unwrap_or_default();
    config_dir.join("apple-container-desktop").join("projects.json")
}
```

`env_store.rs`, `app_settings.rs` 등에서도 `colima-desktop` → `apple-container-desktop` 교체.

- [ ] **Step 3: 구 설정 마이그레이션 함수 추가**

`project.rs`에 추가:
```rust
fn migrate_old_config_dir() {
    let config_dir = dirs::config_dir().unwrap_or_default();
    let old_dir = config_dir.join("colima-desktop");
    let new_dir = config_dir.join("apple-container-desktop");
    if old_dir.exists() && !new_dir.exists() {
        let _ = std::fs::create_dir_all(&new_dir);
        // 설정 파일 복사
        for entry in std::fs::read_dir(&old_dir).into_iter().flatten() {
            if let Ok(entry) = entry {
                let dest = new_dir.join(entry.file_name());
                let _ = std::fs::copy(entry.path(), dest);
            }
        }
    }
}
```

- [ ] **Step 4: 컨테이너 이름 접두사 변경**

`project.rs`에서 `colima-project-` → `acd-project-` 전역 교체.

- [ ] **Step 5: 도메인 기본값 변경**

`proxy/config.rs`의 `default_domain_suffix()`:
```rust
fn default_domain_suffix() -> String {
    "container.local".to_string()
}
```

- [ ] **Step 6: 모든 "Colima" 텍스트 검색 및 교체**

Run: `grep -r "Colima\|colima" src/ src-tauri/ --include="*.rs" --include="*.ts" --include="*.tsx" --include="*.json" | grep -v node_modules | grep -v target`

모든 "Colima" → "Apple Container" / "colima" → 적절한 대체어로 교체.

- [ ] **Step 7: `CLAUDE.md` 업데이트**

프로젝트 이름, 설명, 구조 등을 Apple Container Desktop에 맞게 수정.

- [ ] **Step 8: 전체 빌드 확인**

Run: `npm run tauri build 2>&1 | tail -30` (또는 `cargo check && npm run build`)
Expected: 빌드 성공

- [ ] **Step 9: 커밋**

```bash
git add -A
git commit -m "refactor: 앱을 Apple Container Desktop으로 리브랜딩

tauri.conf.json 앱 이름/식별자 변경,
설정 디렉토리 ~/.config/apple-container-desktop/,
컨테이너 접두사 acd-project-, 도메인 기본값 container.local,
구 설정 자동 마이그레이션, 모든 Colima 텍스트 교체."
```

---

### Task 18: 최종 검증

- [ ] **Step 1: 전체 빌드**

Run: `cd src-tauri && cargo check && cd .. && npm run build`

- [ ] **Step 2: grep으로 잔존 Colima/Docker 참조 확인**

Run: `grep -rn "colima\|docker_cmd\|docker_host\|DockerPs\|DockerImage\|DockerVolume\|DockerNetwork\|DockerDaemon\|compose_project\|compose_service\|devcontainer" src/ src-tauri/src/ --include="*.rs" --include="*.ts" --include="*.tsx" | grep -v "// " | grep -v target`

Expected: 0개 결과 (또는 의도적 주석만)

- [ ] **Step 3: 잔존 참조가 있으면 수정**

- [ ] **Step 4: 최종 커밋**

```bash
git add -A
git commit -m "chore: 잔존 Colima/Docker 참조 정리"
```
