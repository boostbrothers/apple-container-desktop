import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";

export function useContainers() {
  return useQuery({
    queryKey: ["containers"],
    queryFn: api.listContainers,
    refetchInterval: 3000,
  });
}

export function useContainerAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "start" | "stop" | "restart" | "remove" }) => {
      switch (action) {
        case "start": return api.containerStart(id);
        case "stop": return api.containerStop(id);
        case "restart": return api.containerRestart(id);
        case "remove": return api.containerRemove(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["containers"] });
    },
  });
}
