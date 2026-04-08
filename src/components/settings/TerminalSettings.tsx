import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { useAppSettings, useSaveAppSettings } from "@/hooks/useAppSettings";

const TERMINAL_PRESETS = [
  { label: "Terminal.app", value: "Terminal" },
  { label: "iTerm2", value: "iTerm" },
  { label: "Warp", value: "Warp" },
  { label: "Alacritty", value: "alacritty" },
  { label: "Kitty", value: "kitty" },
  { label: "WezTerm", value: "wezterm" },
  { label: "GNOME Terminal", value: "gnome-terminal" },
  { label: "Konsole", value: "konsole" },
];

const SHELL_PRESETS = [
  { label: "/bin/sh", value: "/bin/sh" },
  { label: "/bin/bash", value: "/bin/bash" },
  { label: "/bin/zsh", value: "/bin/zsh" },
];

export function TerminalSettings() {
  const { data: settings, isLoading, error } = useAppSettings();
  const saveMutation = useSaveAppSettings();

  const [terminal, setTerminal] = useState("");
  const [shell, setShell] = useState("/bin/sh");

  useEffect(() => {
    if (settings) {
      setTerminal(settings.terminal);
      setShell(settings.shell);
    }
  }, [settings]);

  const hasChanges =
    settings && (terminal !== settings.terminal || shell !== settings.shell);

  const handleSave = () => {
    saveMutation.mutate({ terminal, shell });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Failed to load settings.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h2 className="text-lg font-semibold">Terminal Settings</h2>

      <div className="space-y-5">
        {/* Terminal App */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Terminal Application</label>
          <div className="flex gap-1.5 flex-wrap">
            {TERMINAL_PRESETS.map((preset) => (
              <Button
                key={preset.value}
                variant={terminal === preset.value ? "default" : "outline"}
                size="sm"
                onClick={() => setTerminal(preset.value)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <Input
            placeholder="Custom terminal app name or path"
            value={terminal}
            onChange={(e) => setTerminal(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            macOS: app name (e.g. Terminal, iTerm, Warp). Linux: binary name or full path.
          </p>
        </div>

        {/* Shell */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Container Shell</label>
          <div className="flex gap-1.5">
            {SHELL_PRESETS.map((preset) => (
              <Button
                key={preset.value}
                variant={shell === preset.value ? "default" : "outline"}
                size="sm"
                onClick={() => setShell(preset.value)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          <Input
            placeholder="Shell path inside the container"
            value={shell}
            onChange={(e) => setShell(e.target.value)}
          />
          <p className="text-[11px] text-muted-foreground">
            Shell to use when attaching to a container via docker exec.
          </p>
        </div>
      </div>

      {/* Save */}
      <div className="space-y-2">
        <Button
          onClick={handleSave}
          disabled={!hasChanges || saveMutation.isPending}
          className="w-full"
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save"
          )}
        </Button>

        {saveMutation.isSuccess && (
          <p className="text-center text-xs text-green-600">
            Settings saved successfully
          </p>
        )}
        {saveMutation.isError && (
          <p className="text-center text-xs text-destructive">
            Failed to save settings
          </p>
        )}
      </div>
    </div>
  );
}
