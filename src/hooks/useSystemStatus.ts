import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";

export function useSystemStatus() {
  return useQuery({
    queryKey: ["system-status"],
    queryFn: api.systemStatus,
    refetchInterval: 5000,
  });
}

export function useSystemAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: "start" | "stop" | "restart") => {
      switch (action) {
        case "start": return api.systemStart();
        case "stop": return api.systemStop();
        case "restart": return api.systemRestart();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["system-status"] });
    },
  });
}
