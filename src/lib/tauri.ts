import { invoke } from "@tauri-apps/api/core";
import type { Container, Image, ColimaStatus, VmSettings, HostInfo, Volume, Network, MountSettings, MountEntry, NetworkSettings, DnsHostEntry, DockerDaemonSettings, ContainerDetail, ContainerStats, ColimaVersion, VersionCheck, DevContainerProject, DevContainerConfig } from "../types";

export const api = {
  colimaStatus: () => invoke<ColimaStatus>("colima_status"),
  colimaStart: () => invoke<void>("colima_start"),
  colimaStop: () => invoke<void>("colima_stop"),
  colimaRestart: () => invoke<void>("colima_restart"),
  listContainers: () => invoke<Container[]>("list_containers"),
  containerStart: (id: string) => invoke<void>("container_start", { id }),
  containerStop: (id: string) => invoke<void>("container_stop", { id }),
  containerRestart: (id: string) => invoke<void>("container_restart", { id }),
  containerRemove: (id: string) => invoke<void>("container_remove", { id }),
  streamContainerLogs: (id: string) => invoke<void>("stream_container_logs", { id }),
  pruneContainers: () => invoke<string>("prune_containers"),
  runContainer: (params: { image: string; name?: string; ports?: string; envVars?: string[] }) =>
    invoke<string>("run_container", params),
  listImages: () => invoke<Image[]>("list_images"),
  pullImage: (name: string) => invoke<void>("pull_image", { name }),
  removeImage: (id: string) => invoke<void>("remove_image", { id }),
  pruneImages: () => invoke<string>("prune_images"),
  getVmSettings: () => invoke<VmSettings>("get_vm_settings"),
  getHostInfo: () => invoke<HostInfo>("get_host_info"),
  applyVmSettings: (settings: { cpus: number; memoryGib: number; diskGib: number; runtime: string; networkAddress: string }) =>
    invoke<void>("apply_vm_settings", settings),
  listVolumes: () => invoke<Volume[]>("list_volumes"),
  createVolume: (params: { name: string; driver?: string }) => invoke<string>("create_volume", params),
  removeVolume: (name: string) => invoke<void>("remove_volume", { name }),
  pruneVolumes: () => invoke<string>("prune_volumes"),
  listNetworks: () => invoke<Network[]>("list_networks"),
  createNetwork: (params: { name: string; driver?: string }) => invoke<string>("create_network", params),
  removeNetwork: (id: string) => invoke<void>("remove_network", { id }),
  pruneNetworks: () => invoke<string>("prune_networks"),
  getMountSettings: () => invoke<MountSettings>("get_mount_settings"),
  saveMountSettings: (params: { mounts: MountEntry[]; mountType: string; mountInotify: boolean }) =>
    invoke<void>("save_mount_settings", params),
  getNetworkSettings: () => invoke<NetworkSettings>("get_network_settings"),
  saveNetworkSettings: (params: {
    dns: string[];
    dnsHosts: DnsHostEntry[];
    networkAddress: boolean;
    networkMode: string;
    gatewayAddress: string;
    networkInterface: string;
    portForwarder: string;
  }) => invoke<void>("save_network_settings", params),
  getDockerSettings: () => invoke<DockerDaemonSettings>("get_docker_settings"),
  saveDockerSettings: (params: { insecureRegistries: string[]; registryMirrors: string[] }) =>
    invoke<void>("save_docker_settings", params),
  containerInspect: (id: string) => invoke<ContainerDetail>("container_inspect", { id }),
  containerStats: (id: string) => invoke<ContainerStats>("container_stats", { id }),
  getColimaVersion: () => invoke<ColimaVersion>("get_colima_version"),
  updateColimaRuntime: () => invoke<string>("update_colima_runtime"),
  checkLatestVersion: () => invoke<VersionCheck>("check_latest_version"),
  checkDevcontainerCli: () => invoke<boolean>("check_devcontainer_cli"),
  listDevcontainerProjects: () => invoke<DevContainerProject[]>("list_devcontainer_projects"),
  addDevcontainerProject: (workspacePath: string) =>
    invoke<DevContainerProject>("add_devcontainer_project", { workspacePath }),
  removeDevcontainerProject: (id: string, removeContainer: boolean) =>
    invoke<void>("remove_devcontainer_project", { id, removeContainer }),
  devcontainerUp: (workspacePath: string) =>
    invoke<void>("devcontainer_up", { workspacePath }),
  devcontainerBuild: (workspacePath: string) =>
    invoke<void>("devcontainer_build", { workspacePath }),
  devcontainerStop: (workspacePath: string) =>
    invoke<void>("devcontainer_stop", { workspacePath }),
  devcontainerReadConfig: (workspacePath: string) =>
    invoke<DevContainerConfig>("devcontainer_read_config", { workspacePath }),
};
