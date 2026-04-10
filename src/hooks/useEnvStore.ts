import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";
import type { GlobalEnvVar, InfisicalConfig } from "../types";

const PROFILES_KEY = ["env-profiles"];

// ── Profile CRUD ──

export function useEnvProfiles() {
  return useQuery({
    queryKey: PROFILES_KEY,
    queryFn: api.listEnvProfiles,
  });
}

export function useCreateEnvProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.createEnvProfile(name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILES_KEY });
    },
  });
}

export function useDeleteEnvProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profileId: string) => api.deleteEnvProfile(profileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILES_KEY });
    },
  });
}

export function useRenameEnvProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, newName }: { profileId: string; newName: string }) =>
      api.renameEnvProfile(profileId, newName),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILES_KEY });
    },
  });
}

// ── Env Var CRUD ──

export function useAddGlobalEnvVar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, entry }: { profileId: string; entry: GlobalEnvVar }) =>
      api.addGlobalEnvVar(profileId, entry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILES_KEY });
    },
  });
}

export function useRemoveGlobalEnvVar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, key, source }: { profileId: string; key: string; source: string }) =>
      api.removeGlobalEnvVar(profileId, key, source),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILES_KEY });
    },
  });
}

export function useToggleGlobalEnvVar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, key, source, enabled }: { profileId: string; key: string; source: string; enabled: boolean }) =>
      api.toggleGlobalEnvVar(profileId, key, source, enabled),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILES_KEY });
    },
  });
}

// ── Dotenv Import ──

export function useImportDotenvToProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, filePath }: { profileId: string; filePath: string }) =>
      api.importDotenvToProfile(profileId, filePath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILES_KEY });
    },
  });
}

export function useReimportDotenv() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, filePath }: { profileId: string; filePath: string }) =>
      api.reimportDotenv(profileId, filePath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILES_KEY });
    },
  });
}

// ── Infisical ──

export function useConfigureProfileInfisical() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ profileId, config }: { profileId: string; config: InfisicalConfig }) =>
      api.configureProfileInfisical(profileId, config),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILES_KEY });
    },
  });
}

export function useSyncProfileInfisical() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (profileId: string) => api.syncProfileInfisical(profileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILES_KEY });
    },
  });
}

export function useTestProfileInfisical() {
  return useMutation({
    mutationFn: (profileId: string) => api.testProfileInfisical(profileId),
  });
}

// ── Resolved Vars ──

export function useResolvedEnvVars(profileId: string | null) {
  return useQuery({
    queryKey: ["resolved-env-vars", profileId],
    queryFn: () => api.getResolvedEnvVars(profileId!),
    enabled: !!profileId,
  });
}
