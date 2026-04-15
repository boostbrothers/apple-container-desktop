import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";

export function useResourceSettings() {
  return useQuery({
    queryKey: ["resource-settings"],
    queryFn: api.getResourceSettings,
    refetchInterval: 10000,
  });
}

export function useHostInfo() {
  return useQuery({
    queryKey: ["host-info"],
    queryFn: api.getHostInfo,
    staleTime: Infinity,
  });
}

export function useApplyResourceSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (settings: {
      containerCpus: string; containerMemory: string;
      buildCpus: string; buildMemory: string;
    }) => api.applyResourceSettings(settings),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["resource-settings"] });
      queryClient.invalidateQueries({ queryKey: ["system-status"] });
    },
  });
}
