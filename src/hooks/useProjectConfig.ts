import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";
import type { DevcontainerValidationError } from "../types";

export function useDevcontainerJsonConfig(workspacePath: string) {
  return useQuery({
    queryKey: ["devcontainer-json", workspacePath],
    queryFn: () => api.readDevcontainerJson(workspacePath),
    enabled: !!workspacePath,
  });
}

export function useSaveDevcontainerConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspacePath,
      config,
    }: {
      workspacePath: string;
      config: Record<string, unknown>;
    }) => api.writeDevcontainerJson(workspacePath, config),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["devcontainer-json", variables.workspacePath],
      });
      queryClient.invalidateQueries({
        queryKey: ["devcontainer-config"],
      });
    },
  });
}

export function useValidateDevcontainerConfig() {
  return useMutation({
    mutationFn: (config: Record<string, unknown>) =>
      api.validateDevcontainerJson(config),
  });
}

export function parseValidationErrors(error: unknown): DevcontainerValidationError[] {
  if (!(error instanceof Error)) return [];
  const msg = error.message;
  if (msg.startsWith("VALIDATION:")) {
    try {
      return JSON.parse(msg.slice("VALIDATION:".length));
    } catch {
      return [];
    }
  }
  return [];
}
