import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
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
        {/* Container CPUs */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Container CPUs</label>
          <Input
            placeholder="e.g. 4"
            value={containerCpus}
            onChange={(e) => setContainerCpus(e.target.value)}
            disabled={applyMutation.isPending}
          />
          <p className="text-[10px] text-muted-foreground">
            CPU limit for running containers.
          </p>
        </div>

        {/* Container Memory */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Container Memory</label>
          <Input
            placeholder="e.g. 4GiB"
            value={containerMemory}
            onChange={(e) => setContainerMemory(e.target.value)}
            disabled={applyMutation.isPending}
          />
          <p className="text-[10px] text-muted-foreground">
            Memory limit for running containers.
          </p>
        </div>

        {/* Build CPUs */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Build CPUs</label>
          <Input
            placeholder="e.g. 8"
            value={buildCpus}
            onChange={(e) => setBuildCpus(e.target.value)}
            disabled={applyMutation.isPending}
          />
          <p className="text-[10px] text-muted-foreground">
            CPU limit for building images.
          </p>
        </div>

        {/* Build Memory */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Build Memory</label>
          <Input
            placeholder="e.g. 8GiB"
            value={buildMemory}
            onChange={(e) => setBuildMemory(e.target.value)}
            disabled={applyMutation.isPending}
          />
          <p className="text-[10px] text-muted-foreground">
            Memory limit for building images.
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
