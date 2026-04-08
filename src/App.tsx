import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setLiquidGlassEffect } from "tauri-plugin-liquid-glass-api";
import { MainLayout } from "./components/layout/MainLayout";
import { Onboarding } from "./components/onboarding/Onboarding";
import { useOnboardingNeeded, useCompleteOnboarding } from "./hooks/useOnboarding";
import "./App.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true },
  },
});

function AppContent() {
  const { data: needsOnboarding, isLoading } = useOnboardingNeeded();
  const completeOnboarding = useCompleteOnboarding();

  const handleOnboardingComplete = () => {
    completeOnboarding.mutate();
  };

  if (isLoading) return null;

  if (needsOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return <MainLayout />;
}

export default function App() {
  useEffect(() => {
    setLiquidGlassEffect().catch(() => {
      // Liquid glass not supported on this platform — no-op
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
