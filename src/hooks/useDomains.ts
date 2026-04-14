import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";
import type { DomainConfig } from "../types";

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

export function useDomainStatus() {
  return useQuery({
    queryKey: ["domain-status"],
    queryFn: () => api.domainStatus(),
    refetchInterval: 5000,
  });
}

export function useDomainSetup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domain: string) => api.domainSetup(domain),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["domain-status"] }),
  });
}

export function useDomainTeardown() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domain: string) => api.domainTeardown(domain),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["domain-status"] }),
  });
}
