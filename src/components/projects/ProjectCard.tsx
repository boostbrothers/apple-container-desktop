import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Play,
  Square,
  RotateCw,
  Trash2,
  Settings,
  Loader2,
  FolderOpen,
  AlertTriangle,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import type { DockerProject } from "../../types";
import {
  useDockerProjectAction,
  useRemoveDockerProject,
} from "../../hooks/useDockerProjects";

interface ProjectCardProps {
  project: DockerProject;
  onSelect: () => void;
}

export function ProjectCard({ project, onSelect }: ProjectCardProps) {
  const action = useDockerProjectAction();
  const remove = useRemoveDockerProject();
  const [isRunning, setIsRunning] = useState(false);
  const [lastLog, setLastLog] = useState<string | null>(null);

  useEffect(() => {
    if (!isRunning) return;

    const unlisten = listen<string>(
      `docker-project-log-${project.id}`,
      (event) => {
        if (event.payload === "[done]") {
          setIsRunning(false);
          setLastLog(null);
        } else {
          setLastLog(event.payload);
        }
      }
    );

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [isRunning, project.id]);

  const handleAction = (type: "up" | "stop" | "rebuild") => {
    if (type === "up" || type === "rebuild") {
      setIsRunning(true);
    }
    action.mutate(
      { id: project.id, action: type },
      { onError: () => setIsRunning(false) }
    );
  };

  const handleRemove = () => {
    remove.mutate({
      id: project.id,
      stopContainers: project.status === "running",
    });
  };

  const typeLabel = {
    compose: "Compose",
    dockerfile: "Dockerfile",
    devcontainer: "DevContainer",
  }[project.project_type] ?? project.project_type;

  const statusBadge = () => {
    switch (project.status) {
      case "running":
        return (
          <Badge
            variant="default"
            className="text-xs bg-[var(--status-running-bg)] text-[var(--status-running-text)] border border-[var(--status-running-border)]"
          >
            Running
          </Badge>
        );
      case "stopped":
        return (
          <Badge variant="secondary" className="text-xs">
            Stopped
          </Badge>
        );
      case "not_created":
        return (
          <Badge
            variant="outline"
            className="text-xs bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
          >
            Not Started
          </Badge>
        );
      case "path_missing":
        return (
          <Badge variant="destructive" className="text-xs">
            Path Missing
          </Badge>
        );
      default:
        return null;
    }
  };

  const disabled = action.isPending || remove.isPending || isRunning;

  return (
    <div className="glass-group overflow-hidden">
      <div className="flex items-center gap-3 px-4 py-3">
        <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">
              {project.name}
            </span>
            <Badge variant="outline" className="text-[10px] px-1.5">
              {typeLabel}
            </Badge>
            {statusBadge()}
            {project.watch_mode && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 bg-blue-500/10 text-blue-400 border-blue-500/20"
              >
                Watch
              </Badge>
            )}
            {project.remote_debug && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 bg-purple-500/10 text-purple-400 border-purple-500/20"
              >
                Debug:{project.debug_port}
              </Badge>
            )}
            {project.status === "path_missing" && (
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            )}
          </div>
          <span className="text-xs text-muted-foreground truncate block">
            {project.workspace_path}
          </span>
          {isRunning && lastLog && (
            <span className="text-[11px] text-muted-foreground/70 truncate block font-mono mt-0.5">
              {lastLog}
            </span>
          )}
        </div>
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {isRunning ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : (
            <>
              {project.status === "running" && (
                <>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleAction("rebuild")}
                    disabled={disabled}
                    title="Rebuild"
                  >
                    <RotateCw className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => handleAction("stop")}
                    disabled={disabled}
                    title="Stop"
                  >
                    <Square className="h-3.5 w-3.5" />
                  </Button>
                </>
              )}
              {(project.status === "stopped" ||
                project.status === "not_created") && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => handleAction("up")}
                  disabled={disabled}
                  title="Start"
                >
                  <Play className="h-3.5 w-3.5" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={onSelect}
                title="Settings"
              >
                <Settings className="h-3.5 w-3.5" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-destructive"
                onClick={handleRemove}
                disabled={disabled}
                title="Remove"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
