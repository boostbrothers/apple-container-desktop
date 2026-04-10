import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";
import type { EnvVarEntry, InfisicalConfig } from "../types";

// ── Profile Management ──

export function useCreateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, profileName }: { projectId: string; profileName: string }) =>
      api.createProfile(projectId, profileName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useDeleteProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, profileName }: { projectId: string; profileName: string }) =>
      api.deleteProfile(projectId, profileName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useSwitchProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, profileName }: { projectId: string; profileName: string }) =>
      api.switchProfile(projectId, profileName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

// ── Env Var CRUD ──

export function useSetEnvVar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, entry }: { projectId: string; entry: EnvVarEntry }) =>
      api.setEnvVar(projectId, entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useRemoveEnvVar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, key, profile }: { projectId: string; key: string; profile: string }) =>
      api.removeEnvVar(projectId, key, profile),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useBulkImportEnv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, profile, entries }: { projectId: string; profile: string; entries: EnvVarEntry[] }) =>
      api.bulkImportEnv(projectId, profile, entries),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

// ── Dotenv Import/Export ──

export function useLoadDotenvForProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, filePath, profile }: { projectId: string; filePath: string; profile: string }) =>
      api.loadDotenvForProfile(projectId, filePath, profile),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useExportProfileToDotenv() {
  return useMutation({
    mutationFn: ({ projectId, profile, filePath }: { projectId: string; profile: string; filePath: string }) =>
      api.exportProfileToDotenv(projectId, profile, filePath),
  });
}

// ── Infisical ──

export function useCheckInfisicalInstalled() {
  return useQuery({
    queryKey: ["infisical-installed"],
    queryFn: api.checkInfisicalInstalled,
    staleTime: 60_000,
  });
}

export function useConfigureInfisical() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, config }: { projectId: string; config: InfisicalConfig }) =>
      api.configureInfisical(projectId, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useSyncInfisical() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (projectId: string) => api.syncInfisical(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useTestInfisicalConnection() {
  return useMutation({
    mutationFn: (projectId: string) => api.testInfisicalConnection(projectId),
  });
}
