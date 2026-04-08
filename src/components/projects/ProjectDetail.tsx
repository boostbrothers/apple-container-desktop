import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft,
  Plus,
  Trash2,
  FileText,
  Save,
  Loader2,
  Bug,
  Eye,
  Play,
  Square,
  RotateCw,
  Terminal,
} from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { listen } from "@tauri-apps/api/event";
import type { DockerProject, EnvVarEntry } from "../../types";
import {
  useUpdateDockerProject,
  useDockerProjectAction,
  useLoadDotenvFile,
  useRunEnvCommand,
} from "../../hooks/useDockerProjects";

interface ProjectDetailProps {
  project: DockerProject;
  onBack: () => void;
}

export function ProjectDetail({ project, onBack }: ProjectDetailProps) {
  const updateProject = useUpdateDockerProject();
  const action = useDockerProjectAction();
  const loadDotenv = useLoadDotenvFile();
  const runEnvCmd = useRunEnvCommand();

  const [envVars, setEnvVars] = useState<EnvVarEntry[]>(project.env_vars);
  const [dotenvPath, setDotenvPath] = useState(project.dotenv_path || "");
  const [envCommand, setEnvCommand] = useState(project.env_command || "");
  const [watchMode, setWatchMode] = useState(project.watch_mode);
  const [remoteDebug, setRemoteDebug] = useState(project.remote_debug);
  const [debugPort, setDebugPort] = useState(project.debug_port);
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [hasChanges, setHasChanges] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [cmdError, setCmdError] = useState<string | null>(null);

  // Track changes
  useEffect(() => {
    const changed =
      JSON.stringify(envVars) !== JSON.stringify(project.env_vars) ||
      dotenvPath !== (project.dotenv_path || "") ||
      envCommand !== (project.env_command || "") ||
      watchMode !== project.watch_mode ||
      remoteDebug !== project.remote_debug ||
      debugPort !== project.debug_port;
    setHasChanges(changed);
  }, [envVars, dotenvPath, envCommand, watchMode, remoteDebug, debugPort, project]);

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

  const handleSave = () => {
    updateProject.mutate({
      id: project.id,
      name: project.name,
      workspace_path: project.workspace_path,
      project_type: project.project_type,
      env_vars: envVars,
      dotenv_path: dotenvPath || null,
      env_command: envCommand || null,
      watch_mode: watchMode,
      remote_debug: remoteDebug,
      debug_port: debugPort,
      compose_file: project.compose_file,
      dockerfile: project.dockerfile,
      service_name: project.service_name,
    });
  };

  const handleAddEnvVar = () => {
    if (!newKey.trim()) return;
    setEnvVars([
      ...envVars,
      { key: newKey.trim(), value: newValue, source: "manual" as const },
    ]);
    setNewKey("");
    setNewValue("");
  };

  const handleRemoveEnvVar = (index: number) => {
    setEnvVars(envVars.filter((_, i) => i !== index));
  };

  const handleLoadDotenv = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Env Files", extensions: ["env", "*"] }],
      defaultPath: project.workspace_path,
    });
    if (!selected) return;

    const path = typeof selected === "string" ? selected : selected[0];
    if (!path) return;

    // Set relative path if inside workspace
    if (path.startsWith(project.workspace_path)) {
      setDotenvPath(path.slice(project.workspace_path.length + 1));
    } else {
      setDotenvPath(path);
    }

    loadDotenv.mutate(path, {
      onSuccess: (entries) => {
        // Merge with existing manual entries, dotenv entries replace
        const manualVars = envVars.filter((v) => v.source === "manual");
        setEnvVars([...entries, ...manualVars]);
      },
    });
  };

  const handleRunEnvCommand = () => {
    if (!envCommand.trim()) return;
    setCmdError(null);
    runEnvCmd.mutate(
      { command: envCommand.trim(), workspacePath: project.workspace_path },
      {
        onSuccess: (entries) => {
          const manualVars = envVars.filter((v) => v.source === "manual");
          setEnvVars([...entries, ...manualVars]);
        },
        onError: (err) => {
          setCmdError(err instanceof Error ? err.message : String(err));
        },
      }
    );
  };

  const handleAction = (type: "up" | "stop" | "rebuild") => {
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

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold truncate">{project.name}</h1>
            <Badge variant="outline" className="text-xs">
              {typeLabel}
            </Badge>
            {project.status === "running" && (
              <Badge
                variant="default"
                className="text-xs bg-[var(--status-running-bg)] text-[var(--status-running-text)] border border-[var(--status-running-border)]"
              >
                Running
              </Badge>
            )}
          </div>
          <span className="text-xs text-muted-foreground truncate block">
            {project.workspace_path}
          </span>
        </div>
        <div className="flex gap-1">
          {project.status === "running" ? (
            <>
              <Button size="sm" variant="outline" onClick={() => handleAction("rebuild")} disabled={disabled}>
                <RotateCw className="h-3.5 w-3.5 mr-1" />
                Rebuild
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

      {/* Config sections */}
      <div className="grid gap-4">
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
        </div>

        {/* Environment Variables */}
        <div className="glass-panel rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Environment Variables</h3>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={handleLoadDotenv}>
                <FileText className="h-3.5 w-3.5 mr-1" />
                .env File
              </Button>
            </div>
          </div>

          {/* Command to fetch env vars */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
              <Input
                placeholder="e.g. infisical export, doppler secrets download --no-file --format env"
                value={envCommand}
                onChange={(e) => setEnvCommand(e.target.value)}
                className="h-7 text-xs font-mono flex-1"
                onKeyDown={(e) => e.key === "Enter" && handleRunEnvCommand()}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={handleRunEnvCommand}
                disabled={runEnvCmd.isPending || !envCommand.trim()}
                className="shrink-0"
              >
                {runEnvCmd.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5 mr-1" />
                )}
                {runEnvCmd.isPending ? "Running..." : "Run"}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground pl-5.5">
              Run a command that outputs KEY=VALUE lines (infisical, doppler, vault, aws ssm, etc.)
            </p>
            {cmdError && (
              <p className="text-[11px] text-destructive pl-5.5">{cmdError}</p>
            )}
          </div>

          {dotenvPath && (
            <div className="rounded-md bg-muted/30 px-3 py-2 flex items-center justify-between">
              <div>
                <div className="text-[10px] uppercase text-muted-foreground">
                  Dotenv File
                </div>
                <div className="text-xs">{dotenvPath}</div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6"
                onClick={() => {
                  setDotenvPath("");
                  setEnvVars(envVars.filter((v) => v.source !== "dotenv"));
                }}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Env var list */}
          {envVars.length > 0 && (
            <div className="space-y-1 max-h-48 overflow-y-auto">
              {envVars.map((v, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 rounded-md bg-muted/20 px-2 py-1"
                >
                  <Badge
                    variant="outline"
                    className="text-[9px] px-1 shrink-0"
                  >
                    {v.source}
                  </Badge>
                  <code className="text-[11px] font-mono truncate flex-1">
                    {v.key}
                  </code>
                  <code className="text-[11px] font-mono truncate flex-1 text-muted-foreground">
                    {v.value}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={() => handleRemoveEnvVar(i)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Add new env var */}
          <div className="flex items-center gap-2">
            <Input
              placeholder="KEY"
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              className="h-7 text-xs font-mono flex-1"
              onKeyDown={(e) => e.key === "Enter" && handleAddEnvVar()}
            />
            <Input
              placeholder="VALUE"
              value={newValue}
              onChange={(e) => setNewValue(e.target.value)}
              className="h-7 text-xs font-mono flex-1"
              onKeyDown={(e) => e.key === "Enter" && handleAddEnvVar()}
            />
            <Button
              variant="outline"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={handleAddEnvVar}
              disabled={!newKey.trim()}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>

        {/* Save Button */}
        {hasChanges && (
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

        {/* Container Info */}
        {project.status === "running" && project.container_ids.length > 0 && (
          <div className="glass-panel rounded-lg p-4 space-y-2">
            <h3 className="text-sm font-semibold">Running Containers</h3>
            <div className="space-y-1">
              {project.container_ids.map((cid) => (
                <div
                  key={cid}
                  className="rounded-md bg-muted/20 px-3 py-1.5 flex items-center gap-2"
                >
                  <div className="h-2 w-2 rounded-full bg-[var(--status-running-text)]" />
                  <code className="text-[11px] font-mono">{cid}</code>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
