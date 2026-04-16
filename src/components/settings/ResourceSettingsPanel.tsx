import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { CpuSlider, MemorySlider } from "@/components/ui/resource-slider";
import { useResourceSettings, useHostInfo, useApplyResourceSettings } from "@/hooks/useResourceSettings";
import { useSystemStatus } from "@/hooks/useSystemStatus";

export function ResourceSettingsPanel() {
  const { data: settings, isLoading: settingsLoading, error: settingsError } = useResourceSettings();
  const { data: hostInfo } = useHostInfo();
  const { data: status } = useSystemStatus();
  const applyMutation = useApplyResourceSettings();

  const [containerCpus, setContainerCpus] = useState("");
  const [containerMemory, setContainerMemory] = useState("");
  const [buildCpus, setBuildCpus] = useState("");
  const [buildMemory, setBuildMemory] = useState("");

  useEffect(() => {
    if (settings) {
      setContainerCpus(settings.container_cpus);
      setContainerMemory(settings.container_memory);
      setBuildCpus(settings.build_cpus);
      setBuildMemory(settings.build_memory);
    }
  }, [settings]);

  const hasChanges =
    settings &&
    (containerCpus !== settings.container_cpus ||
      containerMemory !== settings.container_memory ||
      buildCpus !== settings.build_cpus ||
      buildMemory !== settings.build_memory);

  const handleApply = () => {
    applyMutation.mutate({
      containerCpus,
      containerMemory,
      buildCpus,
      buildMemory,
    });
  };

  const maxCpus = hostInfo?.cpus ?? 16;
  const maxMemoryGib = hostInfo ? Math.floor(hostInfo.memory_gib) : 64;

  if (settingsLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (settingsError) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Failed to load resource settings.
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Resource Settings</h2>
        <Badge variant={status?.running ? "default" : "secondary"}>
          {status?.running ? "Running" : "Stopped"}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        Host: {maxCpus} CPUs, {maxMemoryGib} GiB memory
      </p>

      <div className="space-y-5">
        {/* Container Resources */}
        <div className="glass-panel rounded-lg p-4 space-y-4">
          <h3 className="text-sm font-semibold">Container Defaults</h3>
          <CpuSlider value={containerCpus} onChange={setContainerCpus} maxCpus={maxCpus} />
          <MemorySlider value={containerMemory} onChange={setContainerMemory} maxMemoryGiB={maxMemoryGib} />
          <p className="text-[10px] text-muted-foreground">
            Default resource limits for running containers.
          </p>
        </div>

        {/* Build Resources */}
        <div className="glass-panel rounded-lg p-4 space-y-4">
          <h3 className="text-sm font-semibold">Builder Defaults</h3>
          <CpuSlider value={buildCpus} onChange={setBuildCpus} maxCpus={maxCpus} />
          <MemorySlider value={buildMemory} onChange={setBuildMemory} maxMemoryGiB={maxMemoryGib} />
          <p className="text-[10px] text-muted-foreground">
            Default resource limits for building images.
          </p>
        </div>
      </div>

      {/* Apply Button */}
      <div className="space-y-2">
        <Button
          onClick={handleApply}
          disabled={!hasChanges || applyMutation.isPending}
          className="w-full"
        >
          {applyMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Applying...
            </>
          ) : (
            "Apply Settings"
          )}
        </Button>

        {applyMutation.isError && (
          <p className="text-center text-xs text-destructive">
            {applyMutation.error?.message ?? "Failed to apply settings"}
          </p>
        )}

        {applyMutation.isSuccess && (
          <p className="text-center text-xs text-green-600">
            Settings applied successfully
          </p>
        )}
      </div>
    </div>
  );
}
