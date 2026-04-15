import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";

export function useDnsList() {
  return useQuery({
    queryKey: ["dns-list"],
    queryFn: () => api.dnsList(),
    refetchInterval: 5000,
  });
}

export function useDnsCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domain: string) => api.dnsCreate(domain),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dns-list"] }),
  });
}

export function useDnsDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domain: string) => api.dnsDelete(domain),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dns-list"] }),
  });
}

export function useDnsSetDefault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domain: string) => api.dnsSetDefault(domain),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dns-list"] }),
  });
}
