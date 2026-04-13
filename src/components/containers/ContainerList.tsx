import { useState, useMemo } from "react";
import { useContainers, usePruneContainers } from "../../hooks/useContainers";
import { useProjects } from "../../hooks/useProjects";
import { useDomainConfig, useDomainSync } from "../../hooks/useDomains";
import { ContainerRow } from "./ContainerRow";
import { ComposeGroup } from "./ComposeGroup";
import { ContainerLogs } from "./ContainerLogs";
import { ContainerRun } from "./ContainerRun";
import { ContainerDetail } from "./ContainerDetail";
import { ProjectsTab } from "./ProjectsTab";
import { ProjectDetail } from "./ProjectDetail";
import { Button } from "@/components/ui/button";
import type { Container, Project, DomainServiceEntry } from "../../types";

type Filter = "all" | "running" | "stopped";
type Tab = "running" | "projects";

interface ComposeGroupData {
  project: string;
  containers: Container[];
}

export function ContainerList() {
  const { data: containers, isLoading, error } = useContainers();
  const prune = usePruneContainers();
  const [filter, setFilter] = useState<Filter>("all");
  const [tab, setTab] = useState<Tab>("running");
  const [logsContainerId, setLogsContainerId] = useState<string | null>(null);
  const [inspectId, setInspectId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const { data: allProjects } = useProjects();
  const selectedProject = useMemo(
    () => allProjects?.find((p) => p.id === selectedProjectId) ?? null,
    [allProjects, selectedProjectId]
  );
  const { data: domainConfig } = useDomainConfig();
  const { data: domainSync } = useDomainSync(domainConfig?.enabled ?? false);

  const stoppedCount = useMemo(() =>
    containers?.filter((c) => c.state !== "running").length ?? 0,
  [containers]);

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

  const domainServiceMap = useMemo(() => {
    const map = new Map<string, DomainServiceEntry>();
    if (domainSync?.services) {
      for (const svc of domainSync.services) {
        map.set(svc.container_name, svc);
      }
    }
    return map;
  }, [domainSync]);

  if (selectedProject) {
    return <ProjectDetail project={selectedProject} onBack={() => setSelectedProjectId(null)} />;
  }

  if (inspectId) {
    return <ContainerDetail containerId={inspectId} onBack={() => setInspectId(null)} />;
  }

  if (logsContainerId) {
    return <ContainerLogs containerId={logsContainerId} onBack={() => setLogsContainerId(null)} />;
  }

  return (
    <div>
      {/* Tab Bar */}
      <div className="flex border-b border-[var(--glass-border)] mb-4">
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "running"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setTab("running")}
        >
          Running
        </button>
        <button
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "projects"
              ? "border-primary text-foreground"
              : "border-transparent text-muted-foreground hover:text-foreground"
          }`}
          onClick={() => setTab("projects")}
        >
          Projects
        </button>
      </div>

      {/* Running Tab */}
      {tab === "running" && (
        <>
          <div className="mb-4 flex items-center justify-between">
            <h1 className="text-lg font-semibold">Containers</h1>
            <div className="flex gap-1">
              {(["all", "running", "stopped"] as Filter[]).map((f) => (
                <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)}>
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </Button>
              ))}
              <Button
                variant="outline"
                size="sm"
                className="text-destructive"
                onClick={() => prune.mutate()}
                disabled={prune.isPending || stoppedCount === 0}
              >
                {prune.isPending ? "Pruning..." : "Prune"}
              </Button>
            </div>
          </div>
          <div className="mb-4"><ContainerRun /></div>
          {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
          {error && <p className="text-sm text-destructive">Failed to load containers. Is Colima running?</p>}
          <div className="flex flex-col gap-2">
            {composeGroups.map((group) => (
              <ComposeGroup
                key={group.project}
                project={group.project}
                containers={group.containers}
                onViewLogs={setLogsContainerId}
                onInspect={setInspectId}
                domainServiceMap={domainServiceMap}
                domainConfig={domainConfig}
              />
            ))}
            {standalone.map((container) => (
              <ContainerRow
                key={container.id}
                container={container}
                onViewLogs={setLogsContainerId}
                onInspect={setInspectId}
                domainService={domainServiceMap.get(container.name)}
                domainOverride={domainConfig?.container_overrides?.[container.name]}
                domainEnabled={domainConfig?.enabled}
              />
            ))}
            {composeGroups.length === 0 && standalone.length === 0 && !isLoading && (
              <p className="text-sm text-muted-foreground">No containers found.</p>
            )}
          </div>
        </>
      )}

      {/* Projects Tab */}
      {tab === "projects" && <ProjectsTab onSelectProject={(p) => setSelectedProjectId(p.id)} />}
    </div>
  );
}
