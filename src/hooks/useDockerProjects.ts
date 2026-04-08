import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";
import type { DockerProject, EnvVarEntry } from "../types";

export function useDockerProjects() {
  return useQuery({
    queryKey: ["docker-projects"],
    queryFn: api.listDockerProjects,
    refetchInterval: 3000,
  });
}

export function useDetectProjectType(workspacePath: string) {
  return useQuery({
    queryKey: ["detect-project-type", workspacePath],
    queryFn: () => api.detectProjectType(workspacePath),
    enabled: !!workspacePath,
  });
}

export function useAddDockerProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      name: string;
      workspacePath: string;
      projectType: string;
      composeFile?: string;
      dockerfile?: string;
    }) => api.addDockerProject(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["docker-projects"] });
    },
  });
}

export function useUpdateDockerProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (project: Omit<DockerProject, "status" | "container_ids">) =>
      api.updateDockerProject(project),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["docker-projects"] });
    },
  });
}

export function useRemoveDockerProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stopContainers }: { id: string; stopContainers: boolean }) =>
      api.removeDockerProject(id, stopContainers),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["docker-projects"] });
    },
  });
}

export function useDockerProjectAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "up" | "stop" | "rebuild" }) => {
      switch (action) {
        case "up":
          return api.dockerProjectUp(id);
        case "stop":
          return api.dockerProjectStop(id);
        case "rebuild":
          return api.dockerProjectRebuild(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["docker-projects"] });
    },
  });
}

export function useDockerProjectLogs() {
  return useMutation({
    mutationFn: (id: string) => api.dockerProjectLogs(id),
  });
}

export function useLoadDotenvFile() {
  return useMutation({
    mutationFn: (filePath: string) => api.loadDotenvFile(filePath),
  });
}

export function useRunEnvCommand() {
  return useMutation({
    mutationFn: ({ command, workspacePath }: { command: string; workspacePath: string }) =>
      api.runEnvCommand(command, workspacePath),
  });
}
