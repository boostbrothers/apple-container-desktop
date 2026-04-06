import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useVmSettings, useHostInfo, useApplyVmSettings } from "@/hooks/useVmSettings";
import { useColimaStatus } from "@/hooks/useColimaStatus";

export function VmSettings() {
  const { data: settings, isLoading: settingsLoading, error: settingsError } = useVmSettings();
  const { data: hostInfo } = useHostInfo();
  const { data: status } = useColimaStatus();
  const applyMutation = useApplyVmSettings();

  const [cpus, setCpus] = useState(2);
  const [memoryGib, setMemoryGib] = useState(2);
  const [diskGib, setDiskGib] = useState(60);
  const [runtime, setRuntime] = useState("docker");
  const [networkAddress, setNetworkAddress] = useState("");

  useEffect(() => {
    if (settings) {
      setCpus(settings.cpus);
      setMemoryGib(Math.round(settings.memory_gib));
      setDiskGib(Math.round(settings.disk_gib));
      setRuntime(settings.runtime);
      setNetworkAddress(settings.network_address);
    }
  }, [settings]);

  const hasChanges =
    settings &&
    (cpus !== settings.cpus ||
      memoryGib !== Math.round(settings.memory_gib) ||
      diskGib !== Math.round(settings.disk_gib) ||
      runtime !== settings.runtime ||
      networkAddress !== settings.network_address);

  const currentDiskGib = settings ? Math.round(settings.disk_gib) : 0;
  const diskShrinkWarning = settings && diskGib < currentDiskGib;

  const handleApply = () => {
    applyMutation.mutate({
      cpus,
      memoryGib,
      diskGib,
      runtime,
      networkAddress,
    });
  };

  const maxCpus = hostInfo?.cpus ?? 16;
  const maxMemory = hostInfo ? Math.floor(hostInfo.memory_gib) : 64;

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
        Failed to load VM settings. Is Colima running?
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">VM Settings</h2>
        <Badge variant={status?.running ? "default" : "secondary"}>
          {status?.running ? "Running" : "Stopped"}
        </Badge>
      </div>

      <div className="space-y-5">
        {/* CPU */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">CPU</label>
            <span className="text-xs text-muted-foreground">max {maxCpus}</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={maxCpus}
              value={cpus}
              onChange={(e) => setCpus(Number(e.target.value))}
              disabled={applyMutation.isPending}
              className="flex-1"
            />
            <Input
              type="number"
              min={1}
              max={maxCpus}
              value={cpus}
              onChange={(e) => setCpus(Math.min(maxCpus, Math.max(1, Number(e.target.value))))}
              disabled={applyMutation.isPending}
              className="w-20 text-center"
            />
          </div>
        </div>

        {/* Memory */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Memory (GiB)</label>
            <span className="text-xs text-muted-foreground">max {maxMemory}</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={1}
              max={maxMemory}
              value={memoryGib}
              onChange={(e) => setMemoryGib(Number(e.target.value))}
              disabled={applyMutation.isPending}
              className="flex-1"
            />
            <Input
              type="number"
              min={1}
              max={maxMemory}
              value={memoryGib}
              onChange={(e) => setMemoryGib(Math.min(maxMemory, Math.max(1, Number(e.target.value))))}
              disabled={applyMutation.isPending}
              className="w-20 text-center"
            />
          </div>
        </div>

        {/* Disk */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-sm font-medium">Disk (GiB)</label>
            <span className="text-xs text-muted-foreground">10 ~ 500</span>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={10}
              max={500}
              value={diskGib}
              onChange={(e) => setDiskGib(Number(e.target.value))}
              disabled={applyMutation.isPending}
              className="flex-1"
            />
            <Input
              type="number"
              min={10}
              max={500}
              value={diskGib}
              onChange={(e) => setDiskGib(Math.min(500, Math.max(10, Number(e.target.value))))}
              disabled={applyMutation.isPending}
              className="w-20 text-center"
            />
          </div>
          {diskShrinkWarning && (
            <p className="text-xs text-destructive">
              Disk cannot be shrunk below current size ({currentDiskGib} GiB). This value will be ignored.
            </p>
          )}
        </div>

        {/* Runtime */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Runtime</label>
          <div className="flex gap-2">
            {(["docker", "containerd"] as const).map((r) => (
              <Button
                key={r}
                variant={runtime === r ? "default" : "outline"}
                size="sm"
                onClick={() => setRuntime(r)}
                disabled={applyMutation.isPending}
              >
                {r}
              </Button>
            ))}
          </div>
        </div>

        {/* Network Address */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Network Address</label>
          <Input
            placeholder="e.g. 192.168.106.2 (optional)"
            value={networkAddress}
            onChange={(e) => setNetworkAddress(e.target.value)}
            disabled={applyMutation.isPending}
          />
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
              Restarting...
            </>
          ) : (
            "Save & Restart"
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
