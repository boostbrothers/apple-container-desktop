import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/tauri";

export function useContainerVersion() {
  return useQuery({
    queryKey: ["container-version"],
    queryFn: api.getContainerVersion,
  });
}
