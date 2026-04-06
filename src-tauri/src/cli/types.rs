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

impl From<DockerPsEntry> for Container {
    fn from(entry: DockerPsEntry) -> Self {
        Container {
            id: entry.id,
            name: entry.names,
            image: entry.image,
            state: entry.state,
            status: entry.status,
            ports: entry.ports,
            created_at: entry.created_at,
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
