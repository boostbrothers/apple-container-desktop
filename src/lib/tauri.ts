import { invoke } from "@tauri-apps/api/core";
import type { Container, Image, SystemStatus, ResourceSettings, HostInfo, Volume, Network, ContainerDetail, ContainerStats, ContainerVersion, ContainerInstallCheck, RegistrySettings, DomainStatus, Project, ProjectTypeDetection, EnvVarEntry, InfisicalConfig, AppSettings, GlobalEnvVar, EnvProfile, ProjectEnvBinding, DomainConfig, ContainerDomainOverride } from "../types";

export const api = {
  // System
  systemStatus: () => invoke<SystemStatus>("system_status"),
  systemStart: () => invoke<void>("system_start"),
  systemStop: () => invoke<void>("system_stop"),
  systemRestart: () => invoke<void>("system_restart"),

  // Containers
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

  // Images
  listImages: () => invoke<Image[]>("list_images"),
  pullImage: (name: string) => invoke<void>("pull_image", { name }),
  removeImage: (id: string) => invoke<void>("remove_image", { id }),
  pruneImages: () => invoke<string>("prune_images"),

  // Resource Settings (was VM Settings)
  getResourceSettings: () => invoke<ResourceSettings>("get_resource_settings"),
  getHostInfo: () => invoke<HostInfo>("get_host_info"),
  applyResourceSettings: (settings: { containerCpus: string; containerMemory: string; buildCpus: string; buildMemory: string }) =>
    invoke<void>("apply_resource_settings", settings),

  // Volumes
  listVolumes: () => invoke<Volume[]>("list_volumes"),
  createVolume: (params: { name: string; driver?: string }) => invoke<string>("create_volume", params),
  removeVolume: (name: string) => invoke<void>("remove_volume", { name }),
  pruneVolumes: () => invoke<string>("prune_volumes"),

  // Networks
  listNetworks: () => invoke<Network[]>("list_networks"),
  createNetwork: (params: { name: string; driver?: string }) => invoke<string>("create_network", params),
  removeNetwork: (id: string) => invoke<void>("remove_network", { id }),
  pruneNetworks: () => invoke<string>("prune_networks"),

  // Registry Settings (was Docker Settings)
  getRegistrySettings: () => invoke<RegistrySettings>("get_registry_settings"),
  registryLogin: (params: { registry: string; username: string; password: string }) =>
    invoke<void>("registry_login", params),
  registryLogout: (registry: string) => invoke<void>("registry_logout", { registry }),
  setDefaultRegistry: (domain: string) => invoke<void>("set_default_registry", { domain }),

  // Version & Install
  getContainerVersion: () => invoke<ContainerVersion>("get_container_version"),
  checkContainerInstalled: () => invoke<ContainerInstallCheck>("check_container_installed"),
  checkOnboardingNeeded: () => invoke<boolean>("check_onboarding_needed"),
  completeOnboarding: () => invoke<void>("complete_onboarding"),

  // Projects
  detectProjectType: (workspacePath: string) =>
    invoke<ProjectTypeDetection>("detect_project_type", { workspacePath }),
  listProjects: () =>
    invoke<Project[]>("list_projects"),
  addProject: (params: { name: string; workspacePath: string; dockerfile?: string }) =>
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
  decryptGlobalEnvSecret: (profileId: string, key: string) =>
    invoke<string>("decrypt_global_env_secret", { profileId, key }),
  decryptProjectEnvSecret: (projectId: string, key: string, profile: string) =>
    invoke<string>("decrypt_project_env_secret", { projectId, key, profile }),

  // Container Domains
  domainGetConfig: () => invoke<DomainConfig>("domain_get_config"),
  domainSetConfig: (config: DomainConfig) => invoke<void>("domain_set_config", { config }),
  domainSetup: (domain: string) => invoke<void>("domain_setup", { domain }),
  domainTeardown: (domain: string) => invoke<void>("domain_teardown", { domain }),
  domainStatus: () => invoke<DomainStatus>("domain_status"),
};
