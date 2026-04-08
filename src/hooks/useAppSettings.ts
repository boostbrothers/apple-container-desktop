import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";

export function useAppSettings() {
  return useQuery({
    queryKey: ["app-settings"],
    queryFn: api.getAppSettings,
    staleTime: 60_000,
  });
}

export function useSaveAppSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: { terminal: string; shell: string }) =>
      api.saveAppSettings(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["app-settings"] });
    },
  });
}
