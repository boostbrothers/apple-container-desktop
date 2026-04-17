import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  SquareTerminal,
  Play,
  Square,
  RotateCcw,
  FolderOpen,
  ScrollText,
  Search,
} from "lucide-react";
import { useContainerDetail } from "../../hooks/useContainerDetail";
import { useContainerAction } from "../../hooks/useContainers";
import { useOpenTerminalExec, useProjects } from "../../hooks/useProjects";

export type ContainerHeaderView = "inspect" | "logs";

interface ContainerHeaderProps {
  containerId: string;
  view: ContainerHeaderView;
  onBack: () => void;
  onViewInspect?: () => void;
  onViewLogs?: () => void;
  onNavigateToProject?: (projectId: string) => void;
}

export function ContainerHeader({
  containerId,
  view,
  onBack,
  onViewInspect,
  onViewLogs,
  onNavigateToProject,
}: ContainerHeaderProps) {
  const { data: detail } = useContainerDetail(containerId);
  const { data: projects } = useProjects();
  const action = useContainerAction();
  const openTerminal = useOpenTerminalExec();

  const project = useMemo(
    () => projects?.find((p) => p.container_ids.includes(containerId)) ?? null,
    [projects, containerId]
  );

  const isRunning = detail?.state === "running";
  const displayName = detail?.name ?? containerId.slice(0, 12);

  return (
    <div className="sticky -top-4 z-20 -mx-4 -mt-4 px-4 pt-4 pb-0 glass-panel border-b border-[var(--glass-border)] flex flex-col gap-3">
      <div className="@container flex items-center gap-3 flex-wrap">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <h1 className="text-lg font-semibold truncate">{displayName}</h1>
        {detail && (
          <Badge variant={isRunning ? "default" : "secondary"}>{detail.state}</Badge>
        )}
        <div className="flex items-center gap-1 ml-auto">
          {project && onNavigateToProject && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onNavigateToProject(project.id)}
              title={`Go to project ${project.name}`}
            >
              <FolderOpen className="h-3.5 w-3.5 @2xl:mr-1" />
              <span className="hidden @2xl:inline max-w-[160px] truncate">{project.name}</span>
            </Button>
          )}
          {isRunning ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => action.mutate({ id: containerId, action: "stop" })}
              disabled={action.isPending}
              title="Stop"
            >
              <Square className="h-3.5 w-3.5 @2xl:mr-1" />
              <span className="hidden @2xl:inline">Stop</span>
            </Button>
          ) : (
            <Button
              variant="outline"
              size="sm"
              onClick={() => action.mutate({ id: containerId, action: "start" })}
              disabled={action.isPending || !detail}
              title="Start"
            >
              <Play className="h-3.5 w-3.5 @2xl:mr-1" />
              <span className="hidden @2xl:inline">Start</span>
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => action.mutate({ id: containerId, action: "restart" })}
            disabled={action.isPending || !detail}
            title="Restart"
          >
            <RotateCcw className="h-3.5 w-3.5 @2xl:mr-1" />
            <span className="hidden @2xl:inline">Restart</span>
          </Button>
          {isRunning && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => openTerminal.mutate(containerId)}
              disabled={openTerminal.isPending}
              title="Terminal"
            >
              <SquareTerminal className="h-3.5 w-3.5 @2xl:mr-1" />
              <span className="hidden @2xl:inline">Terminal</span>
            </Button>
          )}
        </div>
      </div>
      <div className="flex -mb-px">
        <button
          className={
            view === "inspect"
              ? "px-4 py-2 text-sm font-medium border-b-2 border-primary text-foreground inline-flex items-center gap-1.5"
              : "px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
          }
          onClick={view === "inspect" ? undefined : onViewInspect}
          disabled={view === "inspect" || !onViewInspect}
          aria-current={view === "inspect" ? "page" : undefined}
        >
          <Search className="h-3.5 w-3.5" />
          Inspect
        </button>
        <button
          className={
            view === "logs"
              ? "px-4 py-2 text-sm font-medium border-b-2 border-primary text-foreground inline-flex items-center gap-1.5"
              : "px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted-foreground hover:text-foreground transition-colors inline-flex items-center gap-1.5"
          }
          onClick={view === "logs" ? undefined : onViewLogs}
          disabled={view === "logs" || !onViewLogs}
          aria-current={view === "logs" ? "page" : undefined}
        >
          <ScrollText className="h-3.5 w-3.5" />
          Logs
        </button>
      </div>
    </div>
  );
}
