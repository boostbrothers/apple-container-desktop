import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";

export function useRegistrySettings() {
  return useQuery({
    queryKey: ["registry-settings"],
    queryFn: api.getRegistrySettings,
    refetchInterval: 10000,
  });
}

export function useRegistryLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { registry: string; username: string; password: string }) =>
      api.registryLogin(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registry-settings"] });
    },
  });
}

export function useRegistryLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (registry: string) => api.registryLogout(registry),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["registry-settings"] });
    },
  });
}
