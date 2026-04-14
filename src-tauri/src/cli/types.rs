use serde::{Deserialize, Serialize};

#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct ContainerListEntry {
    pub id: String,
    pub name: String,
    pub image: String,
    pub state: String,
    pub status: String,
    pub ports: String,
    pub created_at: String,
}

impl Default for ContainerListEntry {
    fn default() -> Self {
        ContainerListEntry {
            id: String::new(),
            name: String::new(),
            image: String::new(),
            state: String::new(),
            status: String::new(),
            ports: String::new(),
            created_at: String::new(),
        }
    }
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

#[derive(Debug, Deserialize)]
#[serde(default)]
pub struct ImageListEntry {
    pub id: String,
    pub repository: String,
    pub tag: String,
    pub size: String,
    pub created_at: String,
}

impl Default for ImageListEntry {
    fn default() -> Self {
        ImageListEntry {
            id: String::new(),
            repository: String::new(),
            tag: String::new(),
            size: String::new(),
            created_at: String::new(),
        }
    }
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

impl From<ImageListEntry> for Image {
    fn from(entry: ImageListEntry) -> Self {
        Image {
            id: entry.id,
            repository: entry.repository,
            tag: entry.tag,
            size: entry.size,
            created_at: entry.created_at,
            in_use: false,
        }
    }
}

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

#[derive(Debug, Serialize, Clone)]
pub struct ResourceSettings {
    pub container_cpus: String,
    pub container_memory: String,
    pub build_cpus: String,
    pub build_memory: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct HostInfo {
    pub cpus: u32,
    pub memory_gib: f64,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct VolumeListEntry {
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

impl From<VolumeListEntry> for Volume {
    fn from(entry: VolumeListEntry) -> Self {
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
pub struct NetworkListEntry {
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

impl From<NetworkListEntry> for Network {
    fn from(entry: NetworkListEntry) -> Self {
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

// Volume mount for project containers
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct VolumeMount {
    pub mount_type: String, // "bind" | "volume"
    pub source: String,
    pub target: String,
    #[serde(default)]
    pub readonly: bool,
}

// Project Execution types

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EnvVarEntry {
    pub key: String,
    pub value: String,
    pub source: String, // "manual" | "dotenv" | "command" | "api" | "infisical"
    #[serde(default)]
    pub secret: bool,
    #[serde(default = "default_profile")]
    pub profile: String,
}

fn default_profile() -> String {
    "default".to_string()
}

// ─── Global Environment Store ────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GlobalEnvVar {
    pub key: String,
    pub value: String,
    pub source: String, // "manual" | "dotenv" | "infisical"
    pub secret: bool,
    #[serde(default)]
    pub source_file: Option<String>, // path for dotenv, project_id for infisical
    #[serde(default = "default_true")]
    pub enabled: bool, // active when there are key conflicts across sources
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EnvProfile {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub env_vars: Vec<GlobalEnvVar>,
    #[serde(default)]
    pub infisical_config: Option<InfisicalConfig>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct EnvStoreConfig {
    #[serde(default)]
    pub profiles: Vec<EnvProfile>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectEnvBinding {
    #[serde(default)]
    pub profile_id: Option<String>,
    #[serde(default = "default_true")]
    pub select_all: bool,
    #[serde(default)]
    pub selected_keys: Vec<String>,   // used when select_all = false
    #[serde(default)]
    pub excluded_keys: Vec<String>,   // used when select_all = true
}

impl Default for ProjectEnvBinding {
    fn default() -> Self {
        ProjectEnvBinding {
            profile_id: None,
            select_all: true,
            selected_keys: Vec::new(),
            excluded_keys: Vec::new(),
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct InfisicalConfig {
    pub project_id: String,
    pub environment: String,
    #[serde(default = "default_secret_path")]
    pub secret_path: String,
    #[serde(default)]
    pub auto_sync: bool,
    #[serde(default)]
    pub profile_mapping: std::collections::HashMap<String, String>,
    #[serde(default)]
    pub token: Option<String>,
}

fn default_secret_path() -> String {
    "/".to_string()
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Project {
    pub id: String,
    pub name: String,
    pub workspace_path: String,
    pub project_type: String, // "dockerfile" | "devcontainer"
    #[serde(default)]
    pub env_vars: Vec<EnvVarEntry>,
    #[serde(default)]
    pub dotenv_path: Option<String>,
    #[serde(default)]
    pub remote_debug: bool,
    #[serde(default = "default_debug_port")]
    pub debug_port: u16,
    #[serde(default)]
    pub dockerfile: Option<String>,
    #[serde(default)]
    pub env_command: Option<String>,
    #[serde(default)]
    pub ports: Vec<String>,
    #[serde(default)]
    pub startup_command: Option<String>,
    #[serde(default = "default_profile")]
    pub active_profile: String,
    #[serde(default = "default_profiles")]
    pub profiles: Vec<String>,
    #[serde(default)]
    pub infisical_config: Option<InfisicalConfig>,
    #[serde(default)]
    pub env_binding: ProjectEnvBinding,
    #[serde(default)]
    pub domain: Option<String>,
    #[serde(default)]
    pub image: Option<String>,
    #[serde(default)]
    pub network: Option<String>,
    #[serde(default)]
    pub init_commands: Vec<String>,
    #[serde(default)]
    pub volumes: Vec<VolumeMount>,
    #[serde(default = "default_true")]
    pub watch_mode: bool,
}

fn default_debug_port() -> u16 {
    9229
}

fn default_profiles() -> Vec<String> {
    vec!["default".to_string()]
}

#[derive(Debug, Serialize, Clone)]
pub struct ProjectWithStatus {
    pub id: String,
    pub name: String,
    pub workspace_path: String,
    pub project_type: String,
    pub env_vars: Vec<EnvVarEntry>,
    pub dotenv_path: Option<String>,
    pub remote_debug: bool,
    pub debug_port: u16,
    pub dockerfile: Option<String>,
    pub env_command: Option<String>,
    pub ports: Vec<String>,
    pub startup_command: Option<String>,
    pub active_profile: String,
    pub profiles: Vec<String>,
    pub infisical_config: Option<InfisicalConfig>,
    pub env_binding: ProjectEnvBinding,
    pub domain: Option<String>,
    pub image: Option<String>,
    pub network: Option<String>,
    pub init_commands: Vec<String>,
    pub volumes: Vec<VolumeMount>,
    pub watch_mode: bool,
    pub status: String,
    pub container_ids: Vec<String>,
}

impl Project {
    pub fn with_status(self, status: String, container_ids: Vec<String>) -> ProjectWithStatus {
        ProjectWithStatus {
            id: self.id,
            name: self.name,
            workspace_path: self.workspace_path,
            project_type: self.project_type,
            env_vars: self.env_vars,
            dotenv_path: self.dotenv_path,
            remote_debug: self.remote_debug,
            debug_port: self.debug_port,
            dockerfile: self.dockerfile,
            env_command: self.env_command,
            ports: self.ports,
            startup_command: self.startup_command,
            active_profile: self.active_profile,
            profiles: self.profiles,
            infisical_config: self.infisical_config,
            env_binding: self.env_binding,
            domain: self.domain,
            image: self.image,
            network: self.network,
            init_commands: self.init_commands,
            volumes: self.volumes,
            watch_mode: self.watch_mode,
            status,
            container_ids,
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectsConfig {
    pub projects: Vec<Project>,
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
    pub dockerfiles: Vec<String>,
    pub dotenv_files: Vec<String>,
}
