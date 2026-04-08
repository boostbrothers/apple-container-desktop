use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DockerPsEntry {
    #[serde(rename = "ID")]
    pub id: String,
    pub names: String,
    pub image: String,
    pub state: String,
    pub status: String,
    pub ports: String,
    pub created_at: String,
    #[serde(default)]
    pub labels: String,
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
    pub compose_project: Option<String>,
    pub compose_service: Option<String>,
}

impl From<DockerPsEntry> for Container {
    fn from(entry: DockerPsEntry) -> Self {
        let mut compose_project = None;
        let mut compose_service = None;

        for part in entry.labels.split(',') {
            let part = part.trim();
            if let Some(val) = part.strip_prefix("com.docker.compose.project=") {
                compose_project = Some(val.to_string());
            } else if let Some(val) = part.strip_prefix("com.docker.compose.service=") {
                compose_service = Some(val.to_string());
            }
        }

        Container {
            id: entry.id,
            name: entry.names,
            image: entry.image,
            state: entry.state,
            status: entry.status,
            ports: entry.ports,
            created_at: entry.created_at,
            compose_project,
            compose_service,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DockerImageEntry {
    #[serde(rename = "ID")]
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
    pub created_at: String,
    #[serde(default)]
    pub containers: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct Image {
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
    pub created_at: String,
    pub in_use: bool,
}

impl From<DockerImageEntry> for Image {
    fn from(entry: DockerImageEntry) -> Self {
        let in_use = entry.containers.parse::<u32>().unwrap_or(0) > 0;
        Image {
            id: entry.id,
            repository: entry.repository,
            tag: entry.tag,
            size: entry.size,
            created_at: entry.created_at,
            in_use,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct ColimaStatusRaw {
    pub display_name: String,
    pub arch: String,
    pub runtime: String,
    pub cpu: u32,
    pub memory: u64,
    pub disk: u64,
    #[serde(default)]
    pub kubernetes: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct ColimaStatus {
    pub running: bool,
    pub runtime: String,
    pub arch: String,
    pub cpus: u32,
    pub memory_gib: f64,
    pub disk_gib: f64,
}

impl ColimaStatusRaw {
    pub fn into_status(self) -> ColimaStatus {
        ColimaStatus {
            running: true,
            runtime: self.runtime,
            arch: self.arch,
            cpus: self.cpu,
            memory_gib: self.memory as f64 / 1_073_741_824.0,
            disk_gib: self.disk as f64 / 1_073_741_824.0,
        }
    }
}

impl ColimaStatus {
    pub fn stopped() -> Self {
        ColimaStatus {
            running: false,
            runtime: String::new(),
            arch: String::new(),
            cpus: 0,
            memory_gib: 0.0,
            disk_gib: 0.0,
        }
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct VmSettings {
    pub cpus: u32,
    pub memory_gib: f64,
    pub disk_gib: f64,
    pub runtime: String,
    pub network_address: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct HostInfo {
    pub cpus: u32,
    pub memory_gib: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DockerVolumeEntry {
    pub name: String,
    pub driver: String,
    pub scope: String,
    pub mountpoint: String,
    #[serde(default)]
    pub labels: String,
    #[serde(default)]
    pub size: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct Volume {
    pub name: String,
    pub driver: String,
    pub scope: String,
    pub mountpoint: String,
    pub labels: String,
    pub size: String,
}

impl From<DockerVolumeEntry> for Volume {
    fn from(entry: DockerVolumeEntry) -> Self {
        Volume {
            name: entry.name,
            driver: entry.driver,
            scope: entry.scope,
            mountpoint: entry.mountpoint,
            labels: entry.labels,
            size: entry.size,
        }
    }
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DockerNetworkEntry {
    #[serde(rename = "ID")]
    pub id: String,
    pub name: String,
    pub driver: String,
    pub scope: String,
    #[serde(rename = "IPv6")]
    #[serde(default)]
    pub ipv6: String,
    #[serde(default)]
    pub internal: String,
    #[serde(default)]
    pub labels: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct Network {
    pub id: String,
    pub name: String,
    pub driver: String,
    pub scope: String,
    pub ipv6: bool,
    pub internal: bool,
    pub labels: String,
}

impl From<DockerNetworkEntry> for Network {
    fn from(entry: DockerNetworkEntry) -> Self {
        Network {
            id: entry.id,
            name: entry.name,
            driver: entry.driver,
            scope: entry.scope,
            ipv6: entry.ipv6 == "true",
            internal: entry.internal == "true",
            labels: entry.labels,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct ColimaListEntry {
    pub cpus: u32,
    pub memory: u64,
    pub disk: u64,
    pub runtime: String,
    #[serde(default)]
    pub network_address: String,
    pub status: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MountEntry {
    pub location: String,
    #[serde(default)]
    pub writable: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct MountSettings {
    pub mounts: Vec<MountEntry>,
    pub mount_type: String,
    pub mount_inotify: bool,
}

#[derive(Debug, Serialize, Clone)]
pub struct ColimaVersion {
    pub version: String,
    pub git_commit: String,
    pub runtime_versions: Vec<RuntimeVersion>,
}

#[derive(Debug, Serialize, Clone)]
pub struct RuntimeVersion {
    pub name: String,
    pub version: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct VersionCheck {
    pub current: String,
    pub latest: String,
    pub update_available: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DockerDaemonSettings {
    pub insecure_registries: Vec<String>,
    pub registry_mirrors: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NetworkSettings {
    pub dns: Vec<String>,
    pub dns_hosts: Vec<DnsHostEntry>,
    pub network_address: bool,
    pub network_mode: String,
    pub gateway_address: String,
    pub network_interface: String,
    pub port_forwarder: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DnsHostEntry {
    pub hostname: String,
    pub ip: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ContainerDetail {
    pub id: String,
    pub name: String,
    pub image: String,
    pub state: String,
    pub status: String,
    pub created: String,
    pub platform: String,
    pub env_vars: Vec<String>,
    pub ports: Vec<PortBinding>,
    pub mounts: Vec<MountInfo>,
    pub networks: Vec<NetworkInfo>,
    pub cmd: String,
    pub entrypoint: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct PortBinding {
    pub container_port: String,
    pub host_port: String,
    pub protocol: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct MountInfo {
    pub mount_type: String,
    pub source: String,
    pub destination: String,
    pub mode: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct NetworkInfo {
    pub name: String,
    pub ip_address: String,
    pub gateway: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct ContainerStats {
    pub cpu_percent: String,
    pub memory_usage: String,
    pub memory_limit: String,
    pub memory_percent: String,
    pub net_io: String,
    pub block_io: String,
    pub pids: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DevContainerProject {
    pub id: String,
    pub workspace_path: String,
    pub name: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct DevContainerProjectWithStatus {
    pub id: String,
    pub workspace_path: String,
    pub name: String,
    pub status: String,
    pub container_id: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DevContainerProjectsConfig {
    pub projects: Vec<DevContainerProject>,
}

#[derive(Debug, Serialize, Clone)]
pub struct DevContainerReadConfig {
    pub image: String,
    pub features: Vec<String>,
    pub forward_ports: Vec<u16>,
    pub remote_user: String,
}

// Docker Project Execution types

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EnvVarEntry {
    pub key: String,
    pub value: String,
    pub source: String, // "manual" | "dotenv" | "api"
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DockerProject {
    pub id: String,
    pub name: String,
    pub workspace_path: String,
    pub project_type: String, // "dockerfile" | "compose" | "devcontainer"
    #[serde(default)]
    pub env_vars: Vec<EnvVarEntry>,
    #[serde(default)]
    pub dotenv_path: Option<String>,
    #[serde(default)]
    pub watch_mode: bool,
    #[serde(default)]
    pub remote_debug: bool,
    #[serde(default = "default_debug_port")]
    pub debug_port: u16,
    #[serde(default)]
    pub compose_file: Option<String>,
    #[serde(default)]
    pub dockerfile: Option<String>,
    #[serde(default)]
    pub service_name: Option<String>,
    #[serde(default)]
    pub env_command: Option<String>,
    #[serde(default)]
    pub ports: Vec<String>,
    #[serde(default)]
    pub startup_command: Option<String>,
}

fn default_debug_port() -> u16 {
    9229
}

#[derive(Debug, Serialize, Clone)]
pub struct DockerProjectWithStatus {
    pub id: String,
    pub name: String,
    pub workspace_path: String,
    pub project_type: String,
    pub env_vars: Vec<EnvVarEntry>,
    pub dotenv_path: Option<String>,
    pub watch_mode: bool,
    pub remote_debug: bool,
    pub debug_port: u16,
    pub compose_file: Option<String>,
    pub dockerfile: Option<String>,
    pub service_name: Option<String>,
    pub env_command: Option<String>,
    pub ports: Vec<String>,
    pub startup_command: Option<String>,
    pub status: String,
    pub container_ids: Vec<String>,
}

impl DockerProject {
    pub fn with_status(self, status: String, container_ids: Vec<String>) -> DockerProjectWithStatus {
        DockerProjectWithStatus {
            id: self.id,
            name: self.name,
            workspace_path: self.workspace_path,
            project_type: self.project_type,
            env_vars: self.env_vars,
            dotenv_path: self.dotenv_path,
            watch_mode: self.watch_mode,
            remote_debug: self.remote_debug,
            debug_port: self.debug_port,
            compose_file: self.compose_file,
            dockerfile: self.dockerfile,
            service_name: self.service_name,
            env_command: self.env_command,
            ports: self.ports,
            startup_command: self.startup_command,
            status,
            container_ids,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct DockerProjectsConfig {
    pub projects: Vec<DockerProject>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    #[serde(default = "default_terminal")]
    pub terminal: String,
    #[serde(default = "default_shell")]
    pub shell: String,
}

fn default_terminal() -> String {
    if cfg!(target_os = "macos") {
        "Terminal.app".to_string()
    } else {
        "xterm".to_string()
    }
}

fn default_shell() -> String {
    "/bin/sh".to_string()
}

impl Default for AppSettings {
    fn default() -> Self {
        AppSettings {
            terminal: default_terminal(),
            shell: default_shell(),
        }
    }
}

#[derive(Debug, Serialize, Clone)]
pub struct ProjectTypeDetection {
    pub has_dockerfile: bool,
    pub has_compose: bool,
    pub has_devcontainer: bool,
    pub compose_files: Vec<String>,
    pub dockerfiles: Vec<String>,
    pub dotenv_files: Vec<String>,
}
