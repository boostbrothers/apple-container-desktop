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
  Lock,
  Copy,
  Globe,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import type { Project } from "../../types";
import {
  useProjectAction,
  useRemoveProject,
} from "../../hooks/useProjects";
import { useDnsList } from "../../hooks/useDns";
import { useSwitchProfile } from "../../hooks/useEnvSecrets";

interface ProjectCardProps {
  project: Project;
  onSelect: () => void;
}

export function ProjectCard({ project, onSelect }: ProjectCardProps) {
  const action = useProjectAction();
  const remove = useRemoveProject();
  const [isRunning, setIsRunning] = useState(false);
  const [lastLog, setLastLog] = useState<string | null>(null);
  const switchProfile = useSwitchProfile();
  const { data: dnsList } = useDnsList();

  const domainUrl = project.dns_hostname
    ? `${project.dns_hostname}.${project.dns_domain || dnsList?.default_domain || ""}`
    : null;

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

  const typeLabel = "Dockerfile";

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
    <div className="glass-group overflow-hidden group">
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
            {project.remote_debug && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 bg-purple-500/10 text-purple-400 border-purple-500/20"
              >
                Debug:{project.debug_port}
              </Badge>
            )}
            {project.profiles.length > 1 && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 bg-cyan-500/10 text-cyan-400 border-cyan-500/20 cursor-pointer"
                onClick={(e) => {
                  e.stopPropagation();
                  const idx = project.profiles.indexOf(project.active_profile);
                  const next = project.profiles[(idx + 1) % project.profiles.length];
                  switchProfile.mutate({ projectId: project.id, profileName: next });
                }}
              >
                {project.active_profile}
              </Badge>
            )}
            {project.env_vars.filter((v) => v.secret && v.profile === project.active_profile).length > 0 && (
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 bg-amber-500/10 text-amber-400 border-amber-500/20"
              >
                <Lock className="h-2.5 w-2.5 mr-0.5" />
                {project.env_vars.filter((v) => v.secret && v.profile === project.active_profile).length}
              </Badge>
            )}
            {project.status === "path_missing" && (
              <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
            )}
          </div>
          <div className="flex items-center gap-1 mt-0.5">
            <span className="text-xs text-muted-foreground truncate">
              {project.workspace_path}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(project.workspace_path);
              }}
              title="Copy path"
            >
              <Copy className="h-2.5 w-2.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                revealItemInDir(project.workspace_path);
              }}
              title="Open in Finder"
            >
              <FolderOpen className="h-2.5 w-2.5" />
            </Button>
          </div>
          {domainUrl && domainUrl.endsWith(".") === false && (
            <div className="flex items-center gap-1 mt-0.5">
              <Globe className="h-3 w-3 text-[#2997ff] shrink-0" />
              <span className="text-[10px] font-mono text-[#2997ff] truncate">
                {domainUrl}
              </span>
            </div>
          )}
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
