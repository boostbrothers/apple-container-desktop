import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/tauri";

export function useColimaStatus() {
  return useQuery({
    queryKey: ["colima-status"],
    queryFn: api.colimaStatus,
    refetchInterval: 5000,
  });
}
