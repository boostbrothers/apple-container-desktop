import { useState } from "react";
import { useContainers } from "../../hooks/useContainers";
import { ContainerRow } from "./ContainerRow";
import { ContainerLogs } from "./ContainerLogs";
import { Button } from "@/components/ui/button";

type Filter = "all" | "running" | "stopped";

export function ContainerList() {
  const { data: containers, isLoading, error } = useContainers();
  const [filter, setFilter] = useState<Filter>("all");
  const [logsContainerId, setLogsContainerId] = useState<string | null>(null);

  if (logsContainerId) {
    return <ContainerLogs containerId={logsContainerId} onBack={() => setLogsContainerId(null)} />;
  }

  const filtered = containers?.filter((c) => {
    if (filter === "running") return c.state === "running";
    if (filter === "stopped") return c.state !== "running";
    return true;
  });

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Containers</h1>
        <div className="flex gap-1">
          {(["all", "running", "stopped"] as Filter[]).map((f) => (
            <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {error && <p className="text-sm text-destructive">Failed to load containers. Is Colima running?</p>}
      <div className="flex flex-col gap-2">
        {filtered?.map((container) => (
          <ContainerRow key={container.id} container={container} onViewLogs={setLogsContainerId} />
        ))}
        {filtered?.length === 0 && !isLoading && <p className="text-sm text-muted-foreground">No containers found.</p>}
      </div>
    </div>
  );
}
