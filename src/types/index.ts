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
