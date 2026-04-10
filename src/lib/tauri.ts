import { invoke } from "@tauri-apps/api/core";
import type { Container, Image, ColimaStatus, VmSettings, HostInfo, Volume, Network, MountSettings, MountEntry, NetworkSettings, DnsHostEntry, DockerDaemonSettings, ContainerDetail, ContainerStats, ColimaVersion, VersionCheck, ColimaInstallCheck, Project, ProjectTypeDetection, EnvVarEntry, InfisicalConfig, AppSettings, DevcontainerConfigResponse, DevcontainerValidationError, GlobalEnvVar, EnvProfile, ProjectEnvBinding } from "../types";

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
  checkColimaInstalled: () => invoke<ColimaInstallCheck>("check_colima_installed"),
  checkOnboardingNeeded: () => invoke<boolean>("check_onboarding_needed"),
  completeOnboarding: () => invoke<void>("complete_onboarding"),

  // Projects (unified)
  checkDevcontainerCli: () => invoke<boolean>("check_devcontainer_cli"),
  detectProjectType: (workspacePath: string) =>
    invoke<ProjectTypeDetection>("detect_project_type", { workspacePath }),
  listProjects: () =>
    invoke<Project[]>("list_projects"),
  addProject: (params: { name: string; workspacePath: string; projectType: string; composeFile?: string; dockerfile?: string }) =>
    invoke<Project>("add_project", params),
  updateProject: (project: Omit<Project, "status" | "container_ids">) =>
    invoke<void>("update_project", { project }),
  removeProject: (id: string, stopContainers: boolean) =>
    invoke<void>("remove_project", { id, stopContainers }),
  projectUp: (id: string) =>
    invoke<void>("project_up", { id }),
  projectStop: (id: string) =>
    invoke<void>("project_stop", { id }),
  projectLogs: (id: string) =>
    invoke<void>("project_logs", { id }),
  projectRebuild: (id: string) =>
    invoke<void>("project_rebuild", { id }),
  loadDotenvFile: (filePath: string) =>
    invoke<EnvVarEntry[]>("load_dotenv_file", { filePath }),
  runEnvCommand: (command: string, workspacePath: string) =>
    invoke<EnvVarEntry[]>("run_env_command", { command, workspacePath }),
  openTerminalExec: (containerId: string) =>
    invoke<void>("open_terminal_exec", { containerId }),
  getAppSettings: () =>
    invoke<AppSettings>("get_app_settings"),
  saveAppSettings: (params: { terminal: string; shell: string }) =>
    invoke<void>("save_app_settings", params),

  // Environment & Secrets
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
  checkInfisicalInstalled: () =>
    invoke<boolean>("check_infisical_installed"),
  configureInfisical: (projectId: string, config: InfisicalConfig) =>
    invoke<Project>("configure_infisical", { projectId, config }),
  syncInfisical: (projectId: string) =>
    invoke<EnvVarEntry[]>("sync_infisical", { projectId }),
  testInfisicalConnection: (projectId: string) =>
    invoke<boolean>("test_infisical_connection", { projectId }),

  // DevContainer Config
  readDevcontainerJson: (workspacePath: string) =>
    invoke<DevcontainerConfigResponse>("read_devcontainer_json", { workspacePath }),
  writeDevcontainerJson: (workspacePath: string, config: Record<string, unknown>) =>
    invoke<void>("write_devcontainer_json", { workspacePath, config }),
  validateDevcontainerJson: (config: Record<string, unknown>) =>
    invoke<DevcontainerValidationError[]>("validate_devcontainer_json", { config }),

  // Global Env Store
  listEnvProfiles: () =>
    invoke<EnvProfile[]>("list_env_profiles"),
  createEnvProfile: (name: string) =>
    invoke<EnvProfile>("create_env_profile", { name }),
  deleteEnvProfile: (profileId: string) =>
    invoke<void>("delete_env_profile", { profileId }),
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
};
