import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";
import type { Project, Service } from "../types";

export function useProjects() {
  return useQuery({
    queryKey: ["projects"],
    queryFn: api.listProjects,
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

export function useAddProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (params: {
      name: string;
      workspacePath: string;
      dockerfile?: string;
    }) => api.addProject(params),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (project: Omit<Project, "status" | "container_ids" | "service_statuses">) =>
      api.updateProject(project),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useRemoveProject() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, stopContainers }: { id: string; stopContainers: boolean }) =>
      api.removeProject(id, stopContainers),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useProjectAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action }: { id: string; action: "up" | "stop" | "rebuild" }) => {
      switch (action) {
        case "up":
          return api.projectUp(id);
        case "stop":
          return api.projectStop(id);
        case "rebuild":
          return api.projectRebuild(id);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["containers"] });
    },
  });
}

export function useProjectLogs() {
  return useMutation({
    mutationFn: (id: string) => api.projectLogs(id),
  });
}

export function useOpenTerminalExec() {
  return useMutation({
    mutationFn: (containerId: string) => api.openTerminalExec(containerId),
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

export function useAddService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, service }: { projectId: string; service: Service }) =>
      api.addService(projectId, service),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useUpdateService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, service }: { projectId: string; service: Service }) =>
      api.updateService(projectId, service),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useRemoveService() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, serviceId }: { projectId: string; serviceId: string }) =>
      api.removeService(projectId, serviceId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useImportCompose() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ projectId, filePath }: { projectId: string; filePath: string }) =>
      api.importCompose(projectId, filePath),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });
}

export function useExportCompose() {
  return useMutation({
    mutationFn: ({ projectId, filePath }: { projectId: string; filePath: string }) =>
      api.exportCompose(projectId, filePath),
  });
}
