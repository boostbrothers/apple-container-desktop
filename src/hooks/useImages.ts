import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";

export function useImages() {
  return useQuery({
    queryKey: ["images"],
    queryFn: api.listImages,
    refetchInterval: 10000,
  });
}

export function useRemoveImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.removeImage(id),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["images"] }); },
  });
}

export function usePullImage() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.pullImage(name),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["images"] }); },
  });
}
