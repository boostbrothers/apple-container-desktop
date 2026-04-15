import React, { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, SquareTerminal, Copy, Globe } from "lucide-react";
import { useContainerDetail, useContainerStats } from "../../hooks/useContainerDetail";
import { useOpenTerminalExec, useProjects } from "../../hooks/useProjects";
import { useDnsList } from "../../hooks/useDns";

interface ContainerDetailProps {
  containerId: string;
  onBack: () => void;
}

export function ContainerDetail({ containerId, onBack }: ContainerDetailProps) {
  const { data: detail, isLoading, error } = useContainerDetail(containerId);
  const { data: stats } = useContainerStats(containerId);
  const openTerminal = useOpenTerminalExec();
  const { data: projects } = useProjects();
  const { data: dnsList } = useDnsList();

  const [showRaw, setShowRaw] = useState(false);

  const domainUrl = useMemo(() => {
    if (!projects) return null;
    const project = projects.find(
      (p) => p.container_ids.includes(containerId) && p.dns_hostname
    );
    if (!project) return null;
    const domain = project.dns_domain || dnsList?.default_domain;
    return domain ? `${project.dns_hostname}.${domain}` : null;
  }, [projects, containerId, dnsList]);

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
    <div className="min-w-0">
      <div className="sticky -top-4 z-20 -mx-4 -mt-4 px-4 pt-4 pb-3 glass-panel border-b border-[var(--glass-border)] flex items-center gap-3">
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
          <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
            <span className="text-muted-foreground">Image</span>
            <span className="truncate" title={detail.image}>{detail.image}</span>
            {domainUrl && (
              <>
                <span className="text-muted-foreground">Domain</span>
                <span className="inline-flex items-center gap-1.5">
                  <Globe className="h-3.5 w-3.5 text-[#2997ff]" />
                  <a
                    href={`http://${domainUrl}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[#2997ff] hover:underline font-mono text-xs"
                  >
                    {domainUrl}
                  </a>
                </span>
              </>
            )}
            {detail.hostname && (
              <>
                <span className="text-muted-foreground">Hostname</span>
                <span className="font-mono text-xs">{detail.hostname}</span>
              </>
            )}
            <span className="text-muted-foreground">Platform</span>
            <span>{detail.platform || "-"}</span>
            <span className="text-muted-foreground">Created</span>
            <span>{detail.created}</span>
            <span className="text-muted-foreground">Status</span>
            <span>{detail.status}</span>
            <span className="text-muted-foreground">Entrypoint</span>
            <span className="font-mono text-xs truncate" title={detail.entrypoint || "-"}>{detail.entrypoint || "-"}</span>
            <span className="text-muted-foreground">Command</span>
            <span className="font-mono text-xs truncate" title={detail.cmd || "-"}>{detail.cmd || "-"}</span>
            {detail.working_dir && (
              <>
                <span className="text-muted-foreground">Working Dir</span>
                <span className="font-mono text-xs truncate" title={detail.working_dir}>{detail.working_dir}</span>
              </>
            )}
            {detail.user && (
              <>
                <span className="text-muted-foreground">User</span>
                <span className="font-mono text-xs">{detail.user}</span>
              </>
            )}
            {detail.restart_policy && (
              <>
                <span className="text-muted-foreground">Restart Policy</span>
                <span>{detail.restart_policy}</span>
              </>
            )}
            {detail.pid != null && (
              <>
                <span className="text-muted-foreground">PID</span>
                <span className="font-mono text-xs">{detail.pid}</span>
              </>
            )}
          </div>
        </section>

        {/* Resource Usage */}
        {stats && (
          <section className="glass-section p-4">
            <h2 className="mb-3 text-sm font-semibold">Resource Usage</h2>
            <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-sm">
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
            <div className="flex flex-col gap-2">
              {detail.networks.map((net, i) => (
                <div key={i} className="rounded-lg bg-black/10 p-3">
                  <div className="text-xs font-semibold mb-1.5">{net.name}</div>
                  <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs">
                    {net.hostname && (
                      <>
                        <span className="text-muted-foreground">Hostname</span>
                        <span className="font-mono">{net.hostname}</span>
                      </>
                    )}
                    <span className="text-muted-foreground">IPv4</span>
                    <span className="font-mono">{net.ip_address || "-"}</span>
                    {net.gateway && (
                      <>
                        <span className="text-muted-foreground">Gateway</span>
                        <span className="font-mono">{net.gateway}</span>
                      </>
                    )}
                    {net.mac_address && (
                      <>
                        <span className="text-muted-foreground">MAC</span>
                        <span className="font-mono">{net.mac_address}</span>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Labels */}
        {detail.labels.length > 0 && (
          <section className="glass-section p-4">
            <h2 className="mb-3 text-sm font-semibold">Labels</h2>
            <div className="max-h-60 overflow-y-auto rounded-lg bg-black/10">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-white/5">
                    <th className="text-left font-medium text-muted-foreground px-3 py-1.5">Key</th>
                    <th className="text-left font-medium text-muted-foreground px-3 py-1.5">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {detail.labels.map((label, i) => (
                    <tr key={i} className="border-b border-white/5 last:border-0">
                      <td className="font-mono px-3 py-1.5 text-muted-foreground whitespace-nowrap">{label.key}</td>
                      <td className="font-mono px-3 py-1.5 break-all">{label.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {/* Raw Inspect */}
        {detail.raw_json && (
          <section className="glass-section p-4">
            <button
              className="flex items-center gap-2 text-sm font-semibold w-full text-left"
              onClick={() => setShowRaw(!showRaw)}
            >
              <span className={`transition-transform ${showRaw ? 'rotate-90' : ''}`}>&#9654;</span>
              Raw Inspect
            </button>
            {showRaw && (
              <pre className="mt-3 text-[11px] font-mono bg-black/20 p-3 rounded-lg overflow-x-auto max-h-96 overflow-y-auto whitespace-pre-wrap break-all">
                {detail.raw_json}
              </pre>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
