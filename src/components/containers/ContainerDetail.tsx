import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, SquareTerminal, Copy } from "lucide-react";
import { useContainerDetail, useContainerStats } from "../../hooks/useContainerDetail";
import { useOpenTerminalExec } from "../../hooks/useDockerProjects";

interface ContainerDetailProps {
  containerId: string;
  onBack: () => void;
}

export function ContainerDetail({ containerId, onBack }: ContainerDetailProps) {
  const { data: detail, isLoading, error } = useContainerDetail(containerId);
  const { data: stats } = useContainerStats(containerId);
  const openTerminal = useOpenTerminalExec();

  if (isLoading) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <p className="text-sm text-muted-foreground">Loading container details...</p>
      </div>
    );
  }

  if (error || !detail) {
    return (
      <div>
        <Button variant="ghost" size="sm" onClick={onBack} className="mb-4">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <p className="text-sm text-destructive">Failed to load container details.</p>
      </div>
    );
  }

  const isRunning = detail.state === "running";

  return (
    <div>
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="mr-1 h-4 w-4" /> Back
        </Button>
        <h1 className="text-lg font-semibold">{detail.name}</h1>
        <Badge variant={isRunning ? "default" : "secondary"}>{detail.state}</Badge>
        {isRunning && (
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => openTerminal.mutate(containerId)}
            disabled={openTerminal.isPending}
          >
            <SquareTerminal className="h-3.5 w-3.5 mr-1" />
            Terminal
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-4">
        {/* Terminal Exec */}
        {isRunning && (
          <section className="glass-section p-4">
            <h2 className="mb-2 text-sm font-semibold">Terminal Access</h2>
            <div className="flex items-center gap-1.5">
              <code className="text-[11px] font-mono bg-black/30 px-2 py-1 rounded flex-1 truncate text-muted-foreground">
                docker exec -it {containerId.slice(0, 12)} /bin/sh
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => navigator.clipboard.writeText(`docker exec -it ${containerId} /bin/sh`)}
                title="Copy command"
              >
                <Copy className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={() => openTerminal.mutate(containerId)}
                disabled={openTerminal.isPending}
                title="Open in external terminal"
              >
                <SquareTerminal className="h-3.5 w-3.5" />
              </Button>
            </div>
            {openTerminal.isError && (
              <p className="text-[11px] text-destructive mt-1">
                Failed to open terminal. Check Settings &gt; Terminal.
              </p>
            )}
          </section>
        )}

        {/* Overview */}
        <section className="glass-section p-4">
          <h2 className="mb-3 text-sm font-semibold">Overview</h2>
          <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <span className="text-muted-foreground">Image</span>
            <span>{detail.image}</span>
            <span className="text-muted-foreground">Platform</span>
            <span>{detail.platform || "-"}</span>
            <span className="text-muted-foreground">Created</span>
            <span>{detail.created}</span>
            <span className="text-muted-foreground">Status</span>
            <span>{detail.status}</span>
            <span className="text-muted-foreground">Entrypoint</span>
            <span className="font-mono text-xs">{detail.entrypoint || "-"}</span>
            <span className="text-muted-foreground">Command</span>
            <span className="font-mono text-xs">{detail.cmd || "-"}</span>
          </div>
        </section>

        {/* Resource Usage */}
        {stats && (
          <section className="glass-section p-4">
            <h2 className="mb-3 text-sm font-semibold">Resource Usage</h2>
            <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <span className="text-muted-foreground">CPU</span>
              <span>{stats.cpu_percent}</span>
              <span className="text-muted-foreground">Memory</span>
              <span>{stats.memory_usage} / {stats.memory_limit} ({stats.memory_percent})</span>
              <span className="text-muted-foreground">Net I/O</span>
              <span>{stats.net_io}</span>
              <span className="text-muted-foreground">Block I/O</span>
              <span>{stats.block_io}</span>
              <span className="text-muted-foreground">PIDs</span>
              <span>{stats.pids}</span>
            </div>
          </section>
        )}

        {/* Environment Variables */}
        {detail.env_vars.length > 0 && (
          <section className="glass-section p-4">
            <h2 className="mb-3 text-sm font-semibold">Environment Variables</h2>
            <div className="max-h-48 overflow-y-auto">
              <div className="flex flex-col gap-1">
                {detail.env_vars.map((env, i) => (
                  <span key={i} className="font-mono text-xs break-all">{env}</span>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Ports */}
        {detail.ports.length > 0 && (
          <section className="glass-section p-4">
            <h2 className="mb-3 text-sm font-semibold">Ports</h2>
            <div className="flex flex-col gap-1 text-sm">
              {detail.ports.map((port, i) => (
                <span key={i} className="font-mono text-xs">
                  {port.container_port}/{port.protocol}
                  {port.host_port ? ` \u2192 0.0.0.0:${port.host_port}` : ""}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Mounts */}
        {detail.mounts.length > 0 && (
          <section className="glass-section p-4">
            <h2 className="mb-3 text-sm font-semibold">Mounts</h2>
            <div className="flex flex-col gap-1 text-sm">
              {detail.mounts.map((mount, i) => (
                <span key={i} className="font-mono text-xs break-all">
                  {mount.mount_type}: {mount.source} \u2192 {mount.destination}
                  {mount.mode ? ` (${mount.mode})` : ""}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Networks */}
        {detail.networks.length > 0 && (
          <section className="glass-section p-4">
            <h2 className="mb-3 text-sm font-semibold">Networks</h2>
            <div className="flex flex-col gap-1 text-sm">
              {detail.networks.map((net, i) => (
                <span key={i} className="font-mono text-xs">
                  {net.name}: {net.ip_address}
                  {net.gateway ? ` (gw: ${net.gateway})` : ""}
                </span>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
