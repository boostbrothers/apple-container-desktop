import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  setLiquidGlassEffect,
  isGlassSupported,
} from "tauri-plugin-liquid-glass-api";
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
    async function initLiquidGlass() {
      try {
        const supported = await isGlassSupported();
        if (supported) {
          await setLiquidGlassEffect({ enabled: true });
          document.documentElement.classList.add("liquid-glass");
        } else {
          document.documentElement.classList.add("no-glass");
          console.warn("[liquid-glass] Not supported on this platform, using CSS fallback");
        }
      } catch (e) {
        document.documentElement.classList.add("no-glass");
        console.error("[liquid-glass] Failed to apply effect:", e);
      }
    }
    initLiquidGlass();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
