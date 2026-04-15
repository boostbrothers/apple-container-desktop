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
  Play,
  Square,
  RotateCw,
  Copy,
  SquareTerminal,
  Image as ImageIcon,
  Network,
  Terminal,
  HardDrive,
  Eye,
  FolderOpen,
  ChevronDown,
  Layers,
  ChevronRight,
  Upload,
  Download,
  Globe,
} from "lucide-react";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Project, VolumeMount, Service } from "../../types";
import {
  useUpdateProject,
  useProjectAction,
  useOpenTerminalExec,
  useAddService,
  useUpdateService,
  useRemoveService,
  useImportCompose,
  useExportCompose,
} from "../../hooks/useProjects";
import { useNetworks, useCreateNetwork } from "../../hooks/useNetworks";
import { useVolumes } from "../../hooks/useVolumes";
import { useDnsList } from "../../hooks/useDns";
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
  const { data: networkList = [] } = useNetworks();
  const { data: volumeList = [] } = useVolumes();
  const { data: dnsList } = useDnsList();
  const createNetwork = useCreateNetwork();
  const addServiceMut = useAddService();
  const updateServiceMut = useUpdateService();
  const removeServiceMut = useRemoveService();
  const importComposeMut = useImportCompose();
  const exportComposeMut = useExportCompose();
  const [expandedService, setExpandedService] = useState<string | null>(null);

  const [dotenvPath, setDotenvPath] = useState(project.dotenv_path || "");
  const [envCommand, setEnvCommand] = useState(project.env_command || "");
  const [remoteDebug, setRemoteDebug] = useState(project.remote_debug);
  const [debugPort, setDebugPort] = useState(project.debug_port);
  const [ports, setPorts] = useState<string[]>(project.ports.length > 0 ? project.ports : [""]);
  const [startupCommand, setStartupCommand] = useState(project.startup_command || "");
  const [dnsDomain, setDnsDomain] = useState(project.dns_domain || "");
  const [dnsHostname, setDnsHostname] = useState(project.dns_hostname || "");
  const [hasChanges, setHasChanges] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [isRunning, setIsRunning] = useState(false);

  // New fields
  const [imageSource, setImageSource] = useState<"dockerfile" | "image">(
    project.image ? "image" : "dockerfile"
  );
  const [imageName, setImageName] = useState(project.image || "");
  const [dockerfile, setDockerfile] = useState(project.dockerfile || "Dockerfile");
  const [selectedNetwork, setSelectedNetwork] = useState(project.network || "");
  const [newNetworkName, setNewNetworkName] = useState("");
  const [showNewNetwork, setShowNewNetwork] = useState(false);
  const [initCommands, setInitCommands] = useState<string[]>(
    project.init_commands.length > 0 ? project.init_commands : [""]
  );
  const [watchMode, setWatchMode] = useState(project.watch_mode);
  const [volumeMounts, setVolumeMounts] = useState<VolumeMount[]>(project.volumes);

  // Track changes
  useEffect(() => {
    const changed =
      dotenvPath !== (project.dotenv_path || "") ||
      envCommand !== (project.env_command || "") ||
      remoteDebug !== project.remote_debug ||
      debugPort !== project.debug_port ||
      JSON.stringify(ports.filter(Boolean)) !== JSON.stringify(project.ports) ||
      startupCommand !== (project.startup_command || "") ||
      dnsDomain !== (project.dns_domain || "") ||
      dnsHostname !== (project.dns_hostname || "") ||
      (imageSource === "image" ? imageName : "") !== (project.image || "") ||
      (imageSource === "dockerfile" ? dockerfile : "") !== (project.dockerfile || "Dockerfile") ||
      selectedNetwork !== (project.network || "") ||
      JSON.stringify(initCommands.filter(Boolean)) !== JSON.stringify(project.init_commands) ||
      watchMode !== project.watch_mode ||
      JSON.stringify(volumeMounts) !== JSON.stringify(project.volumes);
    setHasChanges(changed);
  }, [dotenvPath, envCommand, remoteDebug, debugPort, ports, startupCommand, dnsDomain, dnsHostname, imageSource, imageName, dockerfile, selectedNetwork, initCommands, watchMode, volumeMounts, project]);

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
    remote_debug: remoteDebug,
    debug_port: debugPort,
    dockerfile: imageSource === "dockerfile" ? dockerfile || null : project.dockerfile,
    ports: ports.filter(Boolean),
    startup_command: startupCommand || null,
    active_profile: project.active_profile,
    profiles: project.profiles,
    infisical_config: project.infisical_config,
    env_binding: project.env_binding,
    dns_domain: dnsDomain || null,
    dns_hostname: dnsHostname || null,
    image: imageSource === "image" ? imageName || null : null,
    network: selectedNetwork || null,
    init_commands: initCommands.filter(Boolean),
    volumes: volumeMounts.filter((v) => v.source.trim() && v.target.trim()),
    watch_mode: watchMode,
    services: project.services,
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

  const typeLabel = "Dockerfile";

  const disabled = action.isPending || isRunning;

  return (
    <div className="space-y-4">
      {/* Header -- sticky */}
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
        {/* DNS Domain */}
        <div className="glass-panel rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">DNS Domain</h3>
          </div>
          <div className="space-y-2">
            <div className="relative">
              <select
                value={dnsDomain}
                onChange={(e) => setDnsDomain(e.target.value)}
                className="w-full h-7 text-xs font-mono bg-transparent border border-[var(--glass-border)] rounded-md px-2 pr-7 appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
              >
                <option value="">
                  {dnsList?.default_domain
                    ? `Default (${dnsList.default_domain})`
                    : "Default"}
                </option>
                {dnsList?.domains
                  .filter((d) => d !== dnsList.default_domain)
                  .map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
              </select>
              <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
            </div>
            <Input
              placeholder="e.g. my-app"
              value={dnsHostname}
              onChange={(e) => setDnsHostname(e.target.value)}
              className="h-7 text-xs font-mono"
            />
            <p className="text-[10px] text-muted-foreground">
              {dnsHostname
                ? <>Access via <code className="text-[10px]">http://{dnsHostname}.{dnsDomain || dnsList?.default_domain || "container.local"}</code></>
                : "Set a hostname to access this project via DNS"}
            </p>
          </div>
        </div>

        {/* Image Source */}
        <div className="glass-panel rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <ImageIcon className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Image Source</h3>
          </div>
          <div className="flex gap-2">
            <button
              className={`flex-1 text-xs px-3 py-1.5 rounded-md border transition-colors ${
                imageSource === "dockerfile"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/30 border-[var(--glass-border)] hover:bg-muted/50"
              }`}
              onClick={() => setImageSource("dockerfile")}
            >
              Build from Dockerfile
            </button>
            <button
              className={`flex-1 text-xs px-3 py-1.5 rounded-md border transition-colors ${
                imageSource === "image"
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-muted/30 border-[var(--glass-border)] hover:bg-muted/50"
              }`}
              onClick={() => setImageSource("image")}
            >
              Use Existing Image
            </button>
          </div>
          {imageSource === "dockerfile" ? (
            <div className="space-y-1">
              <Input
                placeholder="Dockerfile"
                value={dockerfile}
                onChange={(e) => setDockerfile(e.target.value)}
                className="h-7 text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                Dockerfile path relative to workspace
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <Input
                placeholder="e.g. node:20-alpine, ubuntu:24.04"
                value={imageName}
                onChange={(e) => setImageName(e.target.value)}
                className="h-7 text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                Image name with tag (skips Dockerfile build)
              </p>
            </div>
          )}
        </div>

        {/* Network */}
        <div className="glass-panel rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Network</h3>
          </div>
          <div className="relative">
            <select
              value={selectedNetwork}
              onChange={(e) => setSelectedNetwork(e.target.value)}
              className="w-full h-7 text-xs font-mono bg-transparent border border-[var(--glass-border)] rounded-md px-2 pr-7 appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">None (default)</option>
              {networkList.map((net) => (
                <option key={net.id} value={net.name}>
                  {net.name} ({net.driver})
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
          </div>
          {!showNewNetwork ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setShowNewNetwork(true)}
            >
              <Plus className="h-3 w-3 mr-1" /> Create Network
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Input
                placeholder="Network name"
                value={newNetworkName}
                onChange={(e) => setNewNetworkName(e.target.value)}
                className="h-7 text-xs font-mono flex-1"
                autoFocus
              />
              <Button
                size="sm"
                className="h-7 text-xs"
                disabled={!newNetworkName.trim() || createNetwork.isPending}
                onClick={() => {
                  createNetwork.mutate(
                    { name: newNetworkName.trim() },
                    {
                      onSuccess: () => {
                        setSelectedNetwork(newNetworkName.trim());
                        setNewNetworkName("");
                        setShowNewNetwork(false);
                      },
                    }
                  );
                }}
              >
                {createNetwork.isPending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  "Create"
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  setNewNetworkName("");
                  setShowNewNetwork(false);
                }}
              >
                Cancel
              </Button>
            </div>
          )}
        </div>

        {/* Initialize Commands */}
        <div className="glass-panel rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Initialize Commands</h3>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs"
              onClick={() => setInitCommands([...initCommands, ""])}
            >
              <Plus className="h-3 w-3 mr-1" /> Add
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground">
            Commands run sequentially on the host before container start.
          </p>
          {initCommands.map((cmd, i) => (
            <div key={i} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-4 text-right shrink-0">
                {i + 1}.
              </span>
              <Input
                placeholder="e.g. npm install, make build"
                value={cmd}
                onChange={(e) => {
                  const next = [...initCommands];
                  next[i] = e.target.value;
                  setInitCommands(next);
                }}
                className="h-7 text-xs font-mono flex-1"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => setInitCommands(initCommands.filter((_, j) => j !== i))}
                disabled={initCommands.length <= 1}
              >
                <Trash2 className="h-3 w-3" />
              </Button>
            </div>
          ))}
        </div>

        {/* Volumes */}
        <div className="glass-panel rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Volumes</h3>
          </div>

          {/* Watch Mode Toggle */}
          <label className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="h-4 w-4 text-muted-foreground" />
              <div>
                <span className="text-sm">Watch Mode</span>
                <p className="text-[11px] text-muted-foreground">
                  Mount workspace to /app for live file sync
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

          {/* Additional Volume Mounts */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm">Additional Mounts</span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() =>
                  setVolumeMounts([
                    ...volumeMounts,
                    { mount_type: "bind", source: "", target: "", readonly: false },
                  ])
                }
              >
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            {volumeMounts.length === 0 && (
              <p className="text-[10px] text-muted-foreground">
                No additional mounts configured.
              </p>
            )}
            {volumeMounts.map((vol, i) => (
              <div key={i} className="space-y-1.5 rounded-md bg-muted/10 p-2">
                <div className="flex items-center gap-2">
                  <select
                    value={vol.mount_type}
                    onChange={(e) => {
                      const next = [...volumeMounts];
                      next[i] = { ...vol, mount_type: e.target.value as "bind" | "volume", source: "" };
                      setVolumeMounts(next);
                    }}
                    className="h-7 text-xs bg-transparent border border-[var(--glass-border)] rounded-md px-2 appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="bind">Bind Mount</option>
                    <option value="volume">Named Volume</option>
                  </select>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 ml-auto"
                    onClick={() => setVolumeMounts(volumeMounts.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  {vol.mount_type === "bind" ? (
                    <div className="flex-1 flex items-center gap-1">
                      <FolderOpen className="h-3 w-3 text-muted-foreground shrink-0" />
                      <Input
                        placeholder="Host path (e.g. /data/db)"
                        value={vol.source}
                        onChange={(e) => {
                          const next = [...volumeMounts];
                          next[i] = { ...vol, source: e.target.value };
                          setVolumeMounts(next);
                        }}
                        className="h-7 text-xs font-mono flex-1"
                      />
                    </div>
                  ) : (
                    <div className="flex-1 relative">
                      <select
                        value={vol.source}
                        onChange={(e) => {
                          const next = [...volumeMounts];
                          next[i] = { ...vol, source: e.target.value };
                          setVolumeMounts(next);
                        }}
                        className="w-full h-7 text-xs font-mono bg-transparent border border-[var(--glass-border)] rounded-md px-2 pr-7 appearance-none cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
                      >
                        <option value="">Select volume...</option>
                        {volumeList.map((v) => (
                          <option key={v.name} value={v.name}>
                            {v.name}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
                    </div>
                  )}
                  <span className="text-[10px] text-muted-foreground shrink-0">→</span>
                  <Input
                    placeholder="Container path (e.g. /data)"
                    value={vol.target}
                    onChange={(e) => {
                      const next = [...volumeMounts];
                      next[i] = { ...vol, target: e.target.value };
                      setVolumeMounts(next);
                    }}
                    className="h-7 text-xs font-mono flex-1"
                  />
                </div>
                <label className="flex items-center gap-1.5 pl-1">
                  <input
                    type="checkbox"
                    checked={vol.readonly}
                    onChange={(e) => {
                      const next = [...volumeMounts];
                      next[i] = { ...vol, readonly: e.target.checked };
                      setVolumeMounts(next);
                    }}
                    className="h-3 w-3 rounded border-[var(--glass-border)]"
                  />
                  <span className="text-[10px] text-muted-foreground">Read-only</span>
                </label>
              </div>
            ))}
          </div>
        </div>

        {/* Services (multi-container) */}
        <div className="glass-panel rounded-lg p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-muted-foreground" />
              <h3 className="text-sm font-semibold">Services</h3>
              {project.services.length > 0 && (
                <Badge variant="outline" className="text-[10px]">
                  {project.services.length}
                </Badge>
              )}
            </div>
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={async () => {
                  const filePath = await open({
                    filters: [{ name: "Compose", extensions: ["yml", "yaml"] }],
                  });
                  if (filePath) {
                    importComposeMut.mutate({ projectId: project.id, filePath: filePath as string });
                  }
                }}
                disabled={importComposeMut.isPending}
              >
                <Upload className="h-3 w-3 mr-1" /> Import
              </Button>
              {project.services.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 text-xs"
                  onClick={async () => {
                    const filePath = await save({
                      defaultPath: "docker-compose.yml",
                      filters: [{ name: "Compose", extensions: ["yml", "yaml"] }],
                    });
                    if (filePath) {
                      exportComposeMut.mutate({ projectId: project.id, filePath });
                    }
                  }}
                  disabled={exportComposeMut.isPending}
                >
                  <Download className="h-3 w-3 mr-1" /> Export
                </Button>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="h-6 text-xs"
                onClick={() => {
                  const id = crypto.randomUUID();
                  addServiceMut.mutate({
                    projectId: project.id,
                    service: {
                      id,
                      name: `service-${project.services.length + 1}`,
                      image: null,
                      dockerfile: null,
                      ports: [],
                      volumes: null,
                      watch_mode: null,
                      startup_command: null,
                      remote_debug: null,
                      debug_port: null,
                      env_vars: [],
                      network: null,
                    },
                  });
                  setExpandedService(id);
                }}
                disabled={addServiceMut.isPending}
              >
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
          </div>

          {project.services.length === 0 ? (
            <p className="text-[10px] text-muted-foreground">
              No services defined. Add services for multi-container mode, or import from a Compose file.
              {project.services.length === 0 && " Using single-container mode with project defaults."}
            </p>
          ) : (
            <>
              <p className="text-[10px] text-muted-foreground">
                Multi-service mode active. Project-level settings act as defaults for each service.
              </p>
              <div className="space-y-2">
                {project.services.map((svc) => {
                  const svcStatus = project.service_statuses?.find((s) => s.service_id === svc.id);
                  const isExpanded = expandedService === svc.id;
                  return (
                    <ServiceCard
                      key={svc.id}
                      service={svc}
                      status={svcStatus?.status}
                      containerId={svcStatus?.container_id}
                      isExpanded={isExpanded}
                      onToggle={() => setExpandedService(isExpanded ? null : svc.id)}
                      onUpdate={(updated) =>
                        updateServiceMut.mutate({ projectId: project.id, service: updated })
                      }
                      onRemove={() =>
                        removeServiceMut.mutate({ projectId: project.id, serviceId: svc.id })
                      }
                      onOpenTerminal={(cid) => openTerminal.mutate(cid)}
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Execution Options */}
        <div className="glass-panel rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold">Execution Options</h3>

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
            </p>
          </div>

          <div className="border-t border-[var(--glass-border)]" />

          {/* Startup Command */}
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
              Settings changed -- rebuild required to apply.
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

// ─── ServiceCard ─────────────────────────────────────────────────────────────

interface ServiceCardProps {
  service: Service;
  status?: string;
  containerId?: string | null;
  isExpanded: boolean;
  onToggle: () => void;
  onUpdate: (service: Service) => void;
  onRemove: () => void;
  onOpenTerminal: (containerId: string) => void;
}

function ServiceCard({
  service,
  status,
  containerId,
  isExpanded,
  onToggle,
  onUpdate,
  onRemove,
  onOpenTerminal,
}: ServiceCardProps) {
  const [name, setName] = useState(service.name);
  const [imageSource, setImageSource] = useState<"dockerfile" | "image">(
    service.image ? "image" : "dockerfile"
  );
  const [imageName, setImageName] = useState(service.image || "");
  const [dockerfile, setDockerfile] = useState(service.dockerfile || "");
  const [ports, setPorts] = useState<string[]>(
    service.ports.length > 0 ? service.ports : [""]
  );
  const [startupCmd, setStartupCmd] = useState(service.startup_command || "");
  const [network, setNetwork] = useState(service.network || "");

  const handleSave = () => {
    onUpdate({
      ...service,
      name,
      image: imageSource === "image" ? imageName || null : null,
      dockerfile: imageSource === "dockerfile" ? dockerfile || null : null,
      ports: ports.filter(Boolean),
      startup_command: startupCmd || null,
      network: network || null,
    });
  };

  const statusColor =
    status === "running"
      ? "bg-[var(--status-running-text)]"
      : status === "stopped"
        ? "bg-yellow-500"
        : "bg-muted-foreground/30";

  return (
    <div className="rounded-md border border-[var(--glass-border)] bg-muted/10">
      {/* Header */}
      <button
        className="w-full flex items-center gap-2 px-3 py-2 text-left"
        onClick={onToggle}
      >
        <ChevronRight
          className={`h-3 w-3 text-muted-foreground transition-transform ${
            isExpanded ? "rotate-90" : ""
          }`}
        />
        <div className={`h-2 w-2 rounded-full ${statusColor} shrink-0`} />
        <span className="text-xs font-medium flex-1 truncate">{service.name}</span>
        <span className="text-[10px] text-muted-foreground truncate">
          {service.image || service.dockerfile || "Dockerfile"}
        </span>
        {status && (
          <Badge variant="outline" className="text-[9px] shrink-0">
            {status}
          </Badge>
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-3 pb-3 space-y-3 border-t border-[var(--glass-border)]">
          <div className="pt-2 space-y-2">
            {/* Name */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Service Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-7 text-xs font-mono"
              />
            </div>

            {/* Image Source */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Image Source</label>
              <div className="flex gap-1">
                <button
                  className={`flex-1 text-[10px] px-2 py-1 rounded border transition-colors ${
                    imageSource === "dockerfile"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/30 border-[var(--glass-border)]"
                  }`}
                  onClick={() => setImageSource("dockerfile")}
                >
                  Dockerfile
                </button>
                <button
                  className={`flex-1 text-[10px] px-2 py-1 rounded border transition-colors ${
                    imageSource === "image"
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-muted/30 border-[var(--glass-border)]"
                  }`}
                  onClick={() => setImageSource("image")}
                >
                  Image
                </button>
              </div>
              {imageSource === "dockerfile" ? (
                <Input
                  placeholder="Dockerfile (inherit from project)"
                  value={dockerfile}
                  onChange={(e) => setDockerfile(e.target.value)}
                  className="h-7 text-xs font-mono"
                />
              ) : (
                <Input
                  placeholder="e.g. postgres:16, redis:7-alpine"
                  value={imageName}
                  onChange={(e) => setImageName(e.target.value)}
                  className="h-7 text-xs font-mono"
                />
              )}
            </div>

            {/* Ports */}
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="text-[10px] text-muted-foreground">Ports</label>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[10px] px-1"
                  onClick={() => setPorts([...ports, ""])}
                >
                  <Plus className="h-2.5 w-2.5" />
                </Button>
              </div>
              {ports.map((port, i) => (
                <div key={i} className="flex items-center gap-1">
                  <Input
                    placeholder="5432:5432"
                    value={port}
                    onChange={(e) => {
                      const next = [...ports];
                      next[i] = e.target.value;
                      setPorts(next);
                    }}
                    className="h-6 text-[10px] font-mono flex-1"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => setPorts(ports.filter((_, j) => j !== i))}
                    disabled={ports.length <= 1}
                  >
                    <Trash2 className="h-2.5 w-2.5" />
                  </Button>
                </div>
              ))}
            </div>

            {/* Startup Command */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Startup Command</label>
              <Input
                placeholder="Override CMD"
                value={startupCmd}
                onChange={(e) => setStartupCmd(e.target.value)}
                className="h-7 text-xs font-mono"
              />
            </div>

            {/* Network override */}
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">
                Network <span className="text-muted-foreground/50">(empty = inherit)</span>
              </label>
              <Input
                placeholder="Inherit from project"
                value={network}
                onChange={(e) => setNetwork(e.target.value)}
                className="h-7 text-xs font-mono"
              />
            </div>
          </div>

          {/* Container info */}
          {containerId && status === "running" && (
            <div className="flex items-center gap-2 rounded bg-muted/20 px-2 py-1.5">
              <code className="text-[10px] font-mono flex-1 truncate">{containerId}</code>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5"
                onClick={() => onOpenTerminal(containerId)}
              >
                <SquareTerminal className="h-3 w-3" />
              </Button>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <Button size="sm" className="h-6 text-[10px] flex-1" onClick={handleSave}>
              <Save className="h-3 w-3 mr-1" /> Save
            </Button>
            <Button
              size="sm"
              variant="destructive"
              className="h-6 text-[10px]"
              onClick={onRemove}
            >
              <Trash2 className="h-3 w-3 mr-1" /> Remove
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
