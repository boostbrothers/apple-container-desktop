import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";

export function useColimaStatus() {
  return useQuery({
    queryKey: ["colima-status"],
    queryFn: api.colimaStatus,
    refetchInterval: 5000,
  });
}

export function useColimaAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (action: "start" | "stop" | "restart") => {
      switch (action) {
        case "start": return api.colimaStart();
        case "stop": return api.colimaStop();
        case "restart": return api.colimaRestart();
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["colima-status"] });
    },
  });
}
