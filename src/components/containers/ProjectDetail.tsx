import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Loader2,
  Bug,
  Eye,
  Play,
  Square,
  RotateCw,
  Copy,
  SquareTerminal,
  Settings,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import type { Project } from "../../types";
import {
  useUpdateProject,
  useProjectAction,
  useOpenTerminalExec,
} from "../../hooks/useProjects";
import { DevcontainerConfigEditor } from "../devcontainer-config/DevcontainerConfigEditor";
import { EnvironmentTab } from "../env/EnvironmentTab";
import { ProjectEnvSelector } from "../environment/ProjectEnvSelector";

interface ProjectDetailProps {
  project: Project;
  onBack: () => void;
}

export function ProjectDetail({ project, onBack }: ProjectDetailProps) {
  const updateProject = useUpdateProject();
  const action = useProjectAction();
  const openTerminal = useOpenTerminalExec();

  const [dotenvPath, setDotenvPath] = useState(project.dotenv_path || "");
  const [envCommand, setEnvCommand] = useState(project.env_command || "");
  const [watchMode, setWatchMode] = useState(project.watch_mode);
  const [remoteDebug, setRemoteDebug] = useState(project.remote_debug);
  const [debugPort, setDebugPort] = useState(project.debug_port);
  const [ports, setPorts] = useState<string[]>(project.ports.length > 0 ? project.ports : [""]);
  const [startupCommand, setStartupCommand] = useState(project.startup_command || "");
  const [hasChanges, setHasChanges] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [showConfig, setShowConfig] = useState(false);

  // Track changes
  useEffect(() => {
    const changed =
      dotenvPath !== (project.dotenv_path || "") ||
      envCommand !== (project.env_command || "") ||
      watchMode !== project.watch_mode ||
      remoteDebug !== project.remote_debug ||
      debugPort !== project.debug_port ||
      JSON.stringify(ports.filter(Boolean)) !== JSON.stringify(project.ports) ||
      startupCommand !== (project.startup_command || "");
    setHasChanges(changed);
  }, [dotenvPath, envCommand, watchMode, remoteDebug, debugPort, ports, startupCommand, project]);

  // Listen for logs
  useEffect(() => {
    const unlisten = listen<string>(
      `docker-project-log-${project.id}`,
      (event) => {
        if (event.payload === "[done]") {
          setIsRunning(false);
        } else {
          setLogs((prev) => [...prev.slice(-500), event.payload]);
        }
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, [project.id]);

  const buildSaveData = () => ({
    id: project.id,
    name: project.name,
    workspace_path: project.workspace_path,
    project_type: project.project_type,
    env_vars: project.env_vars,
    dotenv_path: dotenvPath || null,
    env_command: envCommand || null,
    watch_mode: watchMode,
    remote_debug: remoteDebug,
    debug_port: debugPort,
    compose_file: project.compose_file,
    dockerfile: project.dockerfile,
    service_name: project.service_name,
    ports: ports.filter(Boolean),
    startup_command: startupCommand || null,
    active_profile: project.active_profile,
    profiles: project.profiles,
    infisical_config: project.infisical_config,
    env_binding: project.env_binding,
  });

  const handleSave = () => {
    updateProject.mutate(buildSaveData());
  };

  const handleAction = async (type: "up" | "stop" | "rebuild") => {
    // Auto-save pending changes before starting/rebuilding
    if ((type === "up" || type === "rebuild") && hasChanges) {
      try {
        await updateProject.mutateAsync(buildSaveData());
      } catch {
        return;
      }
    }
    if (type === "up" || type === "rebuild") {
      setIsRunning(true);
      setLogs([]);
    }
    action.mutate(
      { id: project.id, action: type },
      { onError: () => setIsRunning(false) }
    );
  };

  const typeLabel = {
    compose: "Docker Compose",
    dockerfile: "Dockerfile",
    devcontainer: "DevContainer",
  }[project.project_type] ?? project.project_type;

  const disabled = action.isPending || isRunning;

  if (showConfig && project.project_type === "devcontainer") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => setShowConfig(false)} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <h1 className="text-lg font-semibold">DevContainer Config</h1>
        </div>
        <DevcontainerConfigEditor
          workspacePath={project.workspace_path}
          projectName={project.name}
          onClose={() => setShowConfig(false)}
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header — sticky */}
      <div className="sticky -top-4 z-20 -mx-4 -mt-4 px-4 pt-4 pb-3 glass-panel border-b border-[var(--glass-border)]">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-semibold truncate">{project.name}</h1>
              <Badge variant="outline" className="text-xs shrink-0">
                {typeLabel}
              </Badge>
              {project.status === "running" && (
                <Badge
                  variant="default"
                  className="text-xs shrink-0 bg-[var(--status-running-bg)] text-[var(--status-running-text)] border border-[var(--status-running-border)]"
                >
                  Running
                </Badge>
              )}
            </div>
            <span className="text-xs text-muted-foreground truncate block">
              {project.workspace_path}
            </span>
          </div>
          <div className="flex gap-1 shrink-0">
            {project.project_type === "devcontainer" && (
              <Button size="sm" variant="outline" onClick={() => setShowConfig(true)}>
                <Settings className="h-3.5 w-3.5 mr-1" />
                Config
              </Button>
            )}
            {project.status === "running" ? (
              <>
                <Button
                  size="sm"
                  variant={hasChanges ? "default" : "outline"}
                  onClick={() => handleAction("rebuild")}
                  disabled={disabled}
                >
                  {hasChanges ? (
                    <Save className="h-3.5 w-3.5 mr-1" />
                  ) : (
                    <RotateCw className="h-3.5 w-3.5 mr-1" />
                  )}
                  {hasChanges ? "Save & Rebuild" : "Rebuild"}
                </Button>
                <Button size="sm" variant="outline" onClick={() => handleAction("stop")} disabled={disabled}>
                  <Square className="h-3.5 w-3.5 mr-1" />
                  Stop
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={() => handleAction("up")} disabled={disabled}>
                <Play className="h-3.5 w-3.5 mr-1" />
                Start
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Config sections */}
      <div className="grid gap-4 [&>*]:min-w-0">
        {/* Watch Mode & Remote Debug */}
        <div className="glass-panel rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold">Execution Options</h3>

          <label className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-sm">Watch Mode</span>
                <p className="text-[11px] text-muted-foreground">
                  {project.project_type === "compose"
                    ? "Run with docker compose --watch for live sync"
                    : "Monitor file changes and restart automatically"}
                </p>
              </div>
            </div>
            <button
              className={`relative h-5 w-9 rounded-full transition-colors ${
                watchMode ? "bg-primary" : "bg-muted"
              }`}
              onClick={() => setWatchMode(!watchMode)}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  watchMode ? "translate-x-4" : ""
                }`}
              />
            </button>
          </label>

          <div className="border-t border-[var(--glass-border)]" />

          <label className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bug className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-sm">Remote Debug</span>
                <p className="text-[11px] text-muted-foreground">
                  Expose debug port for remote debugging
                </p>
              </div>
            </div>
            <button
              className={`relative h-5 w-9 rounded-full transition-colors ${
                remoteDebug ? "bg-primary" : "bg-muted"
              }`}
              onClick={() => setRemoteDebug(!remoteDebug)}
            >
              <span
                className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                  remoteDebug ? "translate-x-4" : ""
                }`}
              />
            </button>
          </label>

          {remoteDebug && (
            <div className="pl-6 flex items-center gap-2">
              <label className="text-xs text-muted-foreground">Port:</label>
              <Input
                type="number"
                value={debugPort}
                onChange={(e) => setDebugPort(parseInt(e.target.value) || 9229)}
                className="w-24 h-7 text-xs"
              />
            </div>
          )}

          <div className="border-t border-[var(--glass-border)]" />

          {/* Port Mappings */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Ports</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => setPorts([...ports, ""])}
              >
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            {ports.map((port, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder="8080:8080"
                  value={port}
                  onChange={(e) => {
                    const next = [...ports];
                    next[i] = e.target.value;
                    setPorts(next);
                  }}
                  className="h-7 text-xs font-mono flex-1"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 shrink-0"
                  onClick={() => setPorts(ports.filter((_, j) => j !== i))}
                  disabled={ports.length <= 1}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <p className="text-[10px] text-muted-foreground">
              host:container format (e.g. 3000:3000, 5432:5432)
              {project.project_type === "compose" && " — Added on top of ports defined in compose YAML."}
            </p>
          </div>

          <div className="border-t border-[var(--glass-border)]" />

          {/* Startup Command -- show only for dockerfile type */}
          {project.project_type === "dockerfile" && (
            <div className="space-y-2">
              <span className="text-sm">Startup Command</span>
              <Input
                placeholder="e.g. npm run dev, python manage.py runserver"
                value={startupCommand}
                onChange={(e) => setStartupCommand(e.target.value)}
                className="h-7 text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                Override the default container CMD.
              </p>
            </div>
          )}

          {/* Compose-specific notes */}
          {project.project_type === "compose" && (
            <div className="rounded-md bg-muted/20 px-3 py-2">
              <p className="text-[10px] text-muted-foreground">
                For Compose projects, configure commands and services in your docker-compose.yml.
              </p>
            </div>
          )}
        </div>

        {/* Environment Variables */}
        <div className="glass-panel rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold">Environment Variables</h3>
          <ProjectEnvSelector project={project} />
          <div className="border-t pt-3 mt-3">
            <EnvironmentTab project={project} />
          </div>
        </div>

        {/* Save / Rebuild notice */}
        {hasChanges && project.status === "running" && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 flex items-center justify-between gap-3">
            <p className="text-xs text-amber-200/90">
              Settings changed — rebuild required to apply.
            </p>
            <Button
              size="sm"
              onClick={() => handleAction("rebuild")}
              disabled={disabled}
            >
              {disabled ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
              ) : (
                <Save className="h-3.5 w-3.5 mr-1" />
              )}
              Save & Rebuild
            </Button>
          </div>
        )}
        {hasChanges && project.status !== "running" && (
          <Button
            onClick={handleSave}
            disabled={updateProject.isPending}
            className="w-full"
          >
            {updateProject.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin mr-1" />
            ) : (
              <Save className="h-4 w-4 mr-1" />
            )}
            Save Settings
          </Button>
        )}

        {/* Logs */}
        {(isRunning || logs.length > 0) && (
          <div className="glass-panel rounded-lg p-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Build Log</h3>
              {isRunning && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              )}
            </div>
            <div className="rounded-md bg-black/40 p-2 max-h-64 overflow-y-auto font-mono text-[11px] text-muted-foreground">
              {logs.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
              {logs.length === 0 && isRunning && (
                <div className="text-muted-foreground/50">
                  Waiting for output...
                </div>
              )}
            </div>
          </div>
        )}

        {/* Container Info & Terminal */}
        {project.status === "running" && project.container_ids.length > 0 && (
          <div className="glass-panel rounded-lg p-4 space-y-3">
            <h3 className="text-sm font-semibold">Running Containers</h3>
            <div className="space-y-2">
              {project.container_ids.map((cid) => {
                const execCmd = `docker exec -it ${cid} /bin/sh`;
                return (
                  <div key={cid} className="space-y-1.5">
                    <div className="rounded-md bg-muted/20 px-3 py-2 flex items-center gap-2">
                      <div className="h-2 w-2 rounded-full bg-[var(--status-running-text)] shrink-0" />
                      <code className="text-[11px] font-mono flex-1 truncate">{cid}</code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => openTerminal.mutate(cid)}
                        disabled={openTerminal.isPending}
                        title="Open in external terminal"
                      >
                        <SquareTerminal className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="flex items-center gap-1.5 pl-4">
                      <code className="text-[10px] font-mono bg-black/30 px-2 py-1 rounded flex-1 truncate text-muted-foreground">
                        {execCmd}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => navigator.clipboard.writeText(execCmd)}
                        title="Copy command"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
            {openTerminal.isError && (
              <p className="text-[11px] text-destructive">
                {openTerminal.error instanceof Error ? openTerminal.error.message : "Failed to open terminal. Check Settings > Terminal."}
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
