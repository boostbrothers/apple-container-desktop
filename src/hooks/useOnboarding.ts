import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";

export function useOnboardingNeeded() {
  return useQuery({
    queryKey: ["onboarding-needed"],
    queryFn: api.checkOnboardingNeeded,
    staleTime: Infinity,
  });
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.completeOnboarding,
    onSuccess: () => {
      queryClient.setQueryData(["onboarding-needed"], false);
    },
  });
}
