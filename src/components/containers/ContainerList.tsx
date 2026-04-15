import { useState, useMemo } from "react";
import { useContainers, usePruneContainers } from "../../hooks/useContainers";
import { useProjects } from "../../hooks/useProjects";
import { ContainerRow } from "./ContainerRow";
import { ContainerLogs } from "./ContainerLogs";
import { ContainerRun } from "./ContainerRun";
import { ContainerDetail } from "./ContainerDetail";
import { ProjectsTab } from "./ProjectsTab";
import { ProjectDetail } from "./ProjectDetail";
import { Button } from "@/components/ui/button";
import type { Container, Project } from "../../types";

type Filter = "all" | "running" | "stopped";
type Tab = "running" | "projects";

interface ContainerListProps {
  composeFilter?: string | null;
}

export function ContainerList({ composeFilter }: ContainerListProps) {
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
  const stoppedCount = useMemo(() =>
    containers?.filter((c) => c.state !== "running").length ?? 0,
  [containers]);

  const filtered = useMemo(() => {
    if (!containers) return [];
    return containers.filter((c) => {
      if (filter === "running" && c.state !== "running") return false;
      if (filter === "stopped" && c.state === "running") return false;
      return true;
    });
  }, [containers, filter]);

  const groupedContainers = useMemo(() => {
    if (!filtered.length) return { groups: [] as { name: string; containers: Container[] }[], ungrouped: [] as Container[] };

    const projectMap = new Map<string, Container[]>();

    for (const c of filtered) {
      // Use label-based project name; fall back to project.container_ids mapping
      let projectName = c.project;
      if (!projectName && allProjects) {
        const match = allProjects.find(p => p.container_ids.includes(c.id));
        if (match) projectName = match.name;
      }
      if (projectName) {
        const list = projectMap.get(projectName) || [];
        list.push(c);
        projectMap.set(projectName, list);
      }
    }

    const groups = Array.from(projectMap.entries()).map(([name, containers]) => ({ name, containers }));
    const assignedIds = new Set(groups.flatMap(g => g.containers.map(c => c.id)));
    const ungrouped = filtered.filter(c => !assignedIds.has(c.id));
    return { groups, ungrouped };
  }, [filtered, allProjects]);

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
          {error && <p className="text-sm text-destructive">Failed to load containers.</p>}
          <div className="flex flex-col gap-3">
            {groupedContainers.groups.map(({ name, containers }) => (
              <div key={name} className="glass-card overflow-hidden">
                <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--glass-border)]">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                    {name}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {containers.length} container{containers.length !== 1 ? 's' : ''}
                  </span>
                </div>
                <div className="flex flex-col">
                  {containers.map((container) => (
                    <ContainerRow
                      key={container.id}
                      container={container}
                      onViewLogs={setLogsContainerId}
                      onInspect={setInspectId}
                      domainUrl={container.hostname || null}
                      compact
                    />
                  ))}
                </div>
              </div>
            ))}

            {groupedContainers.ungrouped.length > 0 && (
              <div className="flex flex-col gap-2">
                {groupedContainers.groups.length > 0 && (
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
                    Standalone
                  </span>
                )}
                {groupedContainers.ungrouped.map((container) => (
                  <ContainerRow
                    key={container.id}
                    container={container}
                    onViewLogs={setLogsContainerId}
                    onInspect={setInspectId}
                    domainUrl={container.hostname || null}
                  />
                ))}
              </div>
            )}

            {filtered.length === 0 && !isLoading && (
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
