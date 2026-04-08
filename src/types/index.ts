export interface Container {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string;
  created_at: string;
  compose_project: string | null;
  compose_service: string | null;
}

export interface Image {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created_at: string;
  in_use: boolean;
}

export interface ColimaStatus {
  running: boolean;
  runtime: string;
  arch: string;
  cpus: number;
  memory_gib: number;
  disk_gib: number;
}

export interface VmSettings {
  cpus: number;
  memory_gib: number;
  disk_gib: number;
  runtime: string;
  network_address: string;
}

export interface HostInfo {
  cpus: number;
  memory_gib: number;
}

export interface Volume {
  name: string;
  driver: string;
  scope: string;
  mountpoint: string;
  labels: string;
  size: string;
}

export interface Network {
  id: string;
  name: string;
  driver: string;
  scope: string;
  ipv6: boolean;
  internal: boolean;
  labels: string;
}

export interface MountEntry {
  location: string;
  writable: boolean;
}

export interface MountSettings {
  mounts: MountEntry[];
  mount_type: string;
  mount_inotify: boolean;
}

export interface DnsHostEntry {
  hostname: string;
  ip: string;
}

export interface NetworkSettings {
  dns: string[];
  dns_hosts: DnsHostEntry[];
  network_address: boolean;
  network_mode: string;
  gateway_address: string;
  network_interface: string;
  port_forwarder: string;
}

export interface DockerDaemonSettings {
  insecure_registries: string[];
  registry_mirrors: string[];
}

export interface ContainerDetail {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  created: string;
  platform: string;
  env_vars: string[];
  ports: PortBinding[];
  mounts: MountInfo[];
  networks: NetworkInfo[];
  cmd: string;
  entrypoint: string;
}

export interface PortBinding {
  container_port: string;
  host_port: string;
  protocol: string;
}

export interface MountInfo {
  mount_type: string;
  source: string;
  destination: string;
  mode: string;
}

export interface NetworkInfo {
  name: string;
  ip_address: string;
  gateway: string;
}

export interface ContainerStats {
  cpu_percent: string;
  memory_usage: string;
  memory_limit: string;
  memory_percent: string;
  net_io: string;
  block_io: string;
  pids: string;
}

export interface ColimaVersion {
  version: string;
  git_commit: string;
  runtime_versions: RuntimeVersion[];
}

export interface RuntimeVersion {
  name: string;
  version: string;
}

export interface VersionCheck {
  current: string;
  latest: string;
  update_available: boolean;
}

export interface DevContainerProject {
  id: string;
  workspace_path: string;
  name: string;
  status: "running" | "stopped" | "not_built" | "building" | "path_missing";
  container_id: string | null;
}

export interface DevContainerConfig {
  image: string;
  features: string[];
  forward_ports: number[];
  remote_user: string;
}

export interface ColimaInstallCheck {
  installed: boolean;
  path: string | null;
}

// Docker Project Execution types

export interface EnvVarEntry {
  key: string;
  value: string;
  source: "manual" | "dotenv" | "command" | "api";
}

export type ProjectType = "dockerfile" | "compose" | "devcontainer";

export interface DockerProject {
  id: string;
  name: string;
  workspace_path: string;
  project_type: ProjectType;
  env_vars: EnvVarEntry[];
  dotenv_path: string | null;
  watch_mode: boolean;
  remote_debug: boolean;
  debug_port: number;
  compose_file: string | null;
  dockerfile: string | null;
  service_name: string | null;
  env_command: string | null;
  ports: string[];
  startup_command: string | null;
  status: "running" | "stopped" | "not_created" | "path_missing" | "unknown";
  container_ids: string[];
}

export interface AppSettings {
  terminal: string;
  shell: string;
}

export interface ProjectTypeDetection {
  has_dockerfile: boolean;
  has_compose: boolean;
  has_devcontainer: boolean;
  compose_files: string[];
  dockerfiles: string[];
  dotenv_files: string[];
}
