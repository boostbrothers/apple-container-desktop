export interface Container {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string;
  created_at: string;
}

export interface Image {
  id: string;
  repository: string;
  tag: string;
  size: string;
  created_at: string;
  in_use: boolean;
}

export interface SystemStatus {
  running: boolean;
  version: string;
}

export interface ResourceSettings {
  container_cpus: string;
  container_memory: string;
  build_cpus: string;
  build_memory: string;
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

export interface ContainerVersion {
  version: string;
}

export interface ContainerInstallCheck {
  installed: boolean;
  path: string | null;
}

export interface RegistryEntry {
  registry: string;
}

export interface RegistrySettings {
  registries: RegistryEntry[];
  default_domain: string;
}

export interface DomainStatus {
  enabled: boolean;
  domain_suffix: string;
  dns_domains: string[];
}

// Docker Project Execution types

export interface EnvVarEntry {
  key: string;
  value: string;
  source: "manual" | "dotenv" | "command" | "api" | "infisical";
  secret: boolean;
  profile: string;
}

export interface InfisicalConfig {
  project_id: string;
  environment: string;
  secret_path: string;
  auto_sync: boolean;
  profile_mapping: Record<string, string>;
  token: string | null;
}

// --- Global Environment Store ---

export interface GlobalEnvVar {
  key: string;
  value: string;
  source: "manual" | "dotenv" | "infisical";
  secret: boolean;
  source_file: string | null;
  enabled: boolean;
}

export interface EnvProfile {
  id: string;
  name: string;
  env_vars: GlobalEnvVar[];
  infisical_config: InfisicalConfig | null;
}

export interface ProjectEnvBinding {
  profile_id: string | null;
  select_all: boolean;
  selected_keys: string[];
  excluded_keys: string[];
}

export type ProjectType = "dockerfile";

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

export interface AppSettings {
  terminal: string;
  shell: string;
}

export interface ProjectTypeDetection {
  has_dockerfile: boolean;
  dockerfiles: string[];
  dotenv_files: string[];
}

// --- Container Domains ---

export interface DomainConfig {
  enabled: boolean;
  auto_register: boolean;
  domain_suffix: string;
  container_overrides: Record<string, ContainerDomainOverride>;
}

export interface ContainerDomainOverride {
  enabled: boolean;
  hostname?: string | null;
  port?: number | null;
}
