import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";
import type { DomainConfig, ContainerDomainOverride } from "../types";

export function useDomainConfig() {
  return useQuery({
    queryKey: ["domain-config"],
    queryFn: () => api.domainGetConfig(),
  });
}

export function useDomainSetConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (config: DomainConfig) => api.domainSetConfig(config),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["domain-config"] }),
  });
}

export function useDomainSync(enabled: boolean) {
  return useQuery({
    queryKey: ["domain-sync"],
    queryFn: () => api.domainSync(),
    refetchInterval: enabled ? 5000 : false,
    enabled,
  });
}

export function useDomainSetOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ name, config }: { name: string; config: ContainerDomainOverride }) =>
      api.domainSetOverride(name, config),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["domain-sync"] }),
  });
}

export function useDomainRemoveOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.domainRemoveOverride(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["domain-sync"] }),
  });
}
