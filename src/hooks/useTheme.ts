import { useCallback, useEffect, useSyncExternalStore } from "react";
import { getCurrentWindow, type Theme as TauriTheme } from "@tauri-apps/api/window";

type Theme = "light" | "dark" | "auto";

const STORAGE_KEY = "colima-desktop-theme";

let currentTheme: Theme = (localStorage.getItem(STORAGE_KEY) as Theme) ?? "auto";
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): Theme {
  return currentTheme;
}

function resolveIsDark(theme: Theme): boolean {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  return theme === "dark" || (theme === "auto" && prefersDark);
}

function applyTheme(theme: Theme) {
  const isDark = resolveIsDark(theme);

  // Apply CSS dark class for variable switching
  document.documentElement.classList.toggle("dark", isDark);

  // Set native Tauri window theme so liquid glass / vibrancy follows
  const tauriTheme: TauriTheme | null =
    theme === "auto" ? null : theme === "dark" ? "dark" : "light";

  getCurrentWindow().setTheme(tauriTheme).catch(() => {
    // Not in Tauri context (e.g. browser dev) — ignore
  });
}

// Apply on load
applyTheme(currentTheme);

// Listen for system theme changes (for auto mode)
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    if (currentTheme === "auto") {
      applyTheme("auto");
    }
  });

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot);

  const setTheme = useCallback((next: Theme) => {
    currentTheme = next;
    localStorage.setItem(STORAGE_KEY, next);
    applyTheme(next);
    notify();
  }, []);

  // Ensure theme is applied on mount
  useEffect(() => {
    applyTheme(currentTheme);
  }, []);

  return { theme, setTheme } as const;
}
