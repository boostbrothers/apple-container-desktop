use serde::{Deserialize, Serialize};

/// Raw JSON from `container list --format json`.
/// Each line is a nested object: { status, startedDate, configuration: { id, image, ... }, networks: [...] }
#[derive(Debug, Deserialize)]
pub struct ContainerListEntry {
    #[serde(default)]
    pub status: String,
    #[serde(default, rename = "startedDate")]
    pub started_date: Option<f64>,
    #[serde(default)]
    pub configuration: Option<ContainerListConfig>,
    #[serde(default)]
    pub networks: Vec<ContainerListNetwork>,
}

#[derive(Debug, Deserialize)]
pub struct ContainerListConfig {
    #[serde(default)]
    pub id: String,
    #[serde(default)]
    pub image: Option<ContainerListImage>,
    #[serde(default, rename = "publishedPorts")]
    pub published_ports: Vec<ContainerListPort>,
    #[serde(default)]
    pub labels: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize)]
pub struct ContainerListImage {
    #[serde(default)]
    pub reference: String,
}

#[derive(Debug, Deserialize)]
pub struct ContainerListPort {
    #[serde(default, rename = "containerPort")]
    pub container_port: u16,
    #[serde(default, rename = "hostPort")]
    pub host_port: u16,
    #[serde(default)]
    pub protocol: String,
}

#[derive(Debug, Deserialize)]
pub struct ContainerListNetwork {
    #[serde(default)]
    pub network: String,
    #[serde(default)]
    pub hostname: String,
    #[serde(default, rename = "ipv4Address")]
    pub ipv4_address: String,
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
    pub project: String,
    pub hostname: String,
}

impl From<ContainerListEntry> for Container {
    fn from(entry: ContainerListEntry) -> Self {
        let config = entry.configuration.unwrap_or(ContainerListConfig {
            id: String::new(),
            image: None,
            published_ports: Vec::new(),
            labels: None,
        });
        let id = config.id.clone();
        let name = config.id;
        let image = config
            .image
            .map(|img| img.reference)
            .unwrap_or_default();

        // CLI "status" field maps to our "state" (running / stopped / etc.)
        let state = entry.status.clone();

        // Build human-readable status from state + startedDate
        let status = if entry.status == "running" {
            if let Some(abs_time) = entry.started_date {
                // CFAbsoluteTime: seconds since 2001-01-01T00:00:00Z
                // Unix epoch offset = 978307200
                let unix_ts = abs_time + 978_307_200.0;
                let secs = unix_ts as i64;
                let now = std::time::SystemTime::now()
                    .duration_since(std::time::UNIX_EPOCH)
                    .unwrap_or_default()
                    .as_secs() as i64;
                let diff = now - secs;
                let human = if diff < 60 {
                    format!("{}s", diff)
                } else if diff < 3600 {
                    format!("{}m", diff / 60)
                } else if diff < 86400 {
                    format!("{}h", diff / 3600)
                } else {
                    format!("{}d", diff / 86400)
                };
                format!("Up {}", human)
            } else {
                "Up".to_string()
            }
        } else {
            entry.status.clone()
        };

        // Format ports like "0.0.0.0:8080->80/tcp"
        let ports = config
            .published_ports
            .iter()
            .map(|p| {
                let proto = if p.protocol.is_empty() {
                    "tcp"
                } else {
                    &p.protocol
                };
                format!("0.0.0.0:{}->{}/{}", p.host_port, p.container_port, proto)
            })
            .collect::<Vec<_>>()
            .join(", ");

        let created_at = entry
            .started_date
            .map(|t| {
                let unix_ts = (t + 978_307_200.0) as i64;
                // ISO 8601 basic
                format!("{}", unix_ts)
            })
            .unwrap_or_default();

        // Extract project name from labels
        let project = config
            .labels
            .as_ref()
            .and_then(|l| l.get("com.acd.project"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();

        // Extract hostname from network info (strip trailing dot)
        let hostname = entry
            .networks
            .first()
            .map(|n| n.hostname.trim_end_matches('.').to_string())
            .unwrap_or_default();

        Container {
            id,
            name,
            image,
            state,
            status,
            ports,
            created_at,
            project,
            hostname,
        }
    }
}

/// Raw JSON from `container image list --format json`.
/// Each entry: { reference, fullSize, descriptor: { digest, size, mediaType } }
#[derive(Debug, Deserialize)]
pub struct ImageListEntry {
    #[serde(default)]
    pub reference: String,
    #[serde(default, rename = "fullSize")]
    pub full_size: String,
    #[serde(default)]
    pub descriptor: Option<ImageDescriptor>,
}

#[derive(Debug, Deserialize)]
pub struct ImageDescriptor {
    #[serde(default)]
    pub digest: String,
    #[serde(default)]
    pub size: u64,
    #[serde(default, rename = "mediaType")]
    pub media_type: String,
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
        // Parse "docker.io/library/node:24-alpine" → repository + tag
        let (repository, tag) = if let Some(idx) = entry.reference.rfind(':') {
            let repo = &entry.reference[..idx];
            let tag = &entry.reference[idx + 1..];
            // Avoid splitting on the port part of a registry URL (e.g., localhost:5000/img)
            if tag.contains('/') {
                (entry.reference.clone(), "latest".to_string())
            } else {
                (repo.to_string(), tag.to_string())
            }
        } else {
            (entry.reference.clone(), "latest".to_string())
        };

        let id = entry
            .descriptor
            .as_ref()
            .map(|d| {
                d.digest
                    .strip_prefix("sha256:")
                    .unwrap_or(&d.digest)
                    .chars()
                    .take(12)
                    .collect::<String>()
            })
            .unwrap_or_default();

        Image {
            id,
            repository,
            tag,
            size: entry.full_size,
            created_at: String::new(),
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

/// Apple Container `volume list --format json` entry.
/// Fields are camelCase: {"name","driver","format","source","sizeInBytes","createdAt","labels":{},"options":{}}
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct VolumeListEntry {
    pub name: String,
    #[serde(default)]
    pub driver: String,
    #[serde(default)]
    pub format: String,
    #[serde(default)]
    pub source: String,
    #[serde(default)]
    pub size_in_bytes: u64,
    #[serde(default)]
    pub created_at: f64,
    #[serde(default)]
    pub labels: std::collections::HashMap<String, String>,
}

#[derive(Debug, Serialize, Clone)]
pub struct Volume {
    pub name: String,
    pub driver: String,
    pub format: String,
    pub source: String,
    pub size: String,
    pub created_at: f64,
    pub labels: std::collections::HashMap<String, String>,
}

impl From<VolumeListEntry> for Volume {
    fn from(entry: VolumeListEntry) -> Self {
        let size = format_bytes(entry.size_in_bytes);
        Volume {
            name: entry.name,
            driver: entry.driver,
            format: entry.format,
            source: entry.source,
            size,
            created_at: entry.created_at,
            labels: entry.labels,
        }
    }
}

fn format_bytes(bytes: u64) -> String {
    const KB: u64 = 1024;
    const MB: u64 = KB * 1024;
    const GB: u64 = MB * 1024;
    const TB: u64 = GB * 1024;
    if bytes >= TB {
        format!("{:.1} TB", bytes as f64 / TB as f64)
    } else if bytes >= GB {
        format!("{:.1} GB", bytes as f64 / GB as f64)
    } else if bytes >= MB {
        format!("{:.1} MB", bytes as f64 / MB as f64)
    } else if bytes >= KB {
        format!("{:.1} KB", bytes as f64 / KB as f64)
    } else {
        format!("{} B", bytes)
    }
}

/// Apple Container `network list --format json` entry.
/// Structure: {"id":"...","state":"...","config":{"id":"...","pluginInfo":{...},"mode":"nat","labels":{...}},"status":{...}}
#[derive(Debug, Deserialize)]
pub struct NetworkListEntry {
    pub id: String,
    #[serde(default)]
    pub state: String,
    #[serde(default)]
    pub config: Option<NetworkConfig>,
}

#[derive(Debug, Deserialize, Clone)]
pub struct NetworkConfig {
    #[serde(default)]
    pub mode: String,
    #[serde(default, rename = "pluginInfo")]
    pub plugin_info: Option<NetworkPluginInfo>,
    #[serde(default)]
    pub labels: Option<serde_json::Value>,
}

#[derive(Debug, Deserialize, Clone)]
#[allow(dead_code)]
pub struct NetworkPluginInfo {
    #[serde(default)]
    pub plugin: String,
    #[serde(default)]
    pub variant: String,
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
        let config = entry.config.unwrap_or(NetworkConfig {
            mode: String::new(),
            plugin_info: None,
            labels: None,
        });
        let driver = config
            .plugin_info
            .map(|p| p.plugin.clone())
            .unwrap_or_else(|| config.mode.clone());
        let labels = config
            .labels
            .map(|l| l.to_string())
            .unwrap_or_default();
        Network {
            id: entry.id.clone(),
            name: entry.id,
            driver,
            scope: entry.state,
            ipv6: false,
            internal: false,
            labels,
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
    pub hostname: String,
    pub working_dir: String,
    pub user: String,
    pub labels: Vec<LabelEntry>,
    pub restart_policy: String,
    pub pid: Option<u64>,
    pub raw_json: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct LabelEntry {
    pub key: String,
    pub value: String,
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
    pub hostname: String,
    pub ip_address: String,
    pub gateway: String,
    pub mac_address: String,
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

// Service definition for multi-container projects
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Service {
    pub id: String,
    pub name: String,
    #[serde(default)]
    pub image: Option<String>,
    #[serde(default)]
    pub dockerfile: Option<String>,
    #[serde(default)]
    pub ports: Vec<String>,
    #[serde(default)]
    pub volumes: Option<Vec<VolumeMount>>,
    #[serde(default)]
    pub watch_mode: Option<bool>,
    #[serde(default)]
    pub startup_command: Option<String>,
    #[serde(default)]
    pub remote_debug: Option<bool>,
    #[serde(default)]
    pub debug_port: Option<u16>,
    #[serde(default)]
    pub env_vars: Vec<EnvVarEntry>,
    #[serde(default)]
    pub network: Option<String>,
    #[serde(default)]
    pub restart: Option<String>,  // "no" | "always" | "on-failure" | "unless-stopped"
    #[serde(default)]
    pub depends_on: Vec<String>,
    #[serde(default)]
    pub cpus: Option<String>,
    #[serde(default)]
    pub memory: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ServiceStatus {
    pub service_id: String,
    pub service_name: String,
    pub status: String, // "running" | "stopped" | "not_created"
    pub container_id: Option<String>,
}

// Project-level network/volume definitions (created on project_up)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ProjectNetwork {
    pub name: String,
    #[serde(default)]
    pub driver: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct NamedVolume {
    pub name: String,
    #[serde(default)]
    pub driver: Option<String>,
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
    pub dns_domain: Option<String>,
    #[serde(default)]
    pub dns_hostname: Option<String>,
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
    #[serde(default)]
    pub cpus: Option<String>,
    #[serde(default)]
    pub memory: Option<String>,
    #[serde(default)]
    pub services: Vec<Service>,
    #[serde(default, alias = "compose_networks")]
    pub project_networks: Vec<ProjectNetwork>,
    #[serde(default, alias = "compose_volumes")]
    pub named_volumes: Vec<NamedVolume>,
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
    pub dns_domain: Option<String>,
    pub dns_hostname: Option<String>,
    pub image: Option<String>,
    pub network: Option<String>,
    pub init_commands: Vec<String>,
    pub volumes: Vec<VolumeMount>,
    pub watch_mode: bool,
    pub cpus: Option<String>,
    pub memory: Option<String>,
    pub services: Vec<Service>,
    pub project_networks: Vec<ProjectNetwork>,
    pub named_volumes: Vec<NamedVolume>,
    pub service_statuses: Vec<ServiceStatus>,
    pub status: String,
    pub container_ids: Vec<String>,
}

impl Project {
    pub fn with_status(
        self,
        status: String,
        container_ids: Vec<String>,
        service_statuses: Vec<ServiceStatus>,
    ) -> ProjectWithStatus {
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
            dns_domain: self.dns_domain,
            dns_hostname: self.dns_hostname,
            image: self.image,
            network: self.network,
            init_commands: self.init_commands,
            volumes: self.volumes,
            watch_mode: self.watch_mode,
            cpus: self.cpus,
            memory: self.memory,
            services: self.services,
            project_networks: self.project_networks,
            named_volumes: self.named_volumes,
            service_statuses,
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
