import { useState, useMemo } from "react";
import { useContainers } from "../../hooks/useContainers";
import { ContainerRow } from "./ContainerRow";
import { ComposeGroup } from "./ComposeGroup";
import { ContainerLogs } from "./ContainerLogs";
import { Button } from "@/components/ui/button";
import type { Container } from "../../types";

type Filter = "all" | "running" | "stopped";

interface ComposeGroupData {
  project: string;
  containers: Container[];
}

export function ContainerList() {
  const { data: containers, isLoading, error } = useContainers();
  const [filter, setFilter] = useState<Filter>("all");
  const [logsContainerId, setLogsContainerId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!containers) return [];
    return containers.filter((c) => {
      if (filter === "running") return c.state === "running";
      if (filter === "stopped") return c.state !== "running";
      return true;
    });
  }, [containers, filter]);

  const { composeGroups, standalone } = useMemo(() => {
    const groupMap = new Map<string, Container[]>();
    const standalone: Container[] = [];

    for (const c of filtered) {
      if (c.compose_project) {
        const group = groupMap.get(c.compose_project) ?? [];
        group.push(c);
        groupMap.set(c.compose_project, group);
      } else {
        standalone.push(c);
      }
    }

    const composeGroups: ComposeGroupData[] = Array.from(groupMap.entries()).map(
      ([project, containers]) => ({ project, containers })
    );

    return { composeGroups, standalone };
  }, [filtered]);

  if (logsContainerId) {
    return <ContainerLogs containerId={logsContainerId} onBack={() => setLogsContainerId(null)} />;
  }

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
        {composeGroups.map((group) => (
          <ComposeGroup
            key={group.project}
            project={group.project}
            containers={group.containers}
            onViewLogs={setLogsContainerId}
          />
        ))}
        {standalone.map((container) => (
          <ContainerRow key={container.id} container={container} onViewLogs={setLogsContainerId} />
        ))}
        {composeGroups.length === 0 && standalone.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground">No containers found.</p>
        )}
      </div>
    </div>
  );
}
