import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  SquareTerminal,
  Square,
  Play,
  RotateCcw,
  ScrollText,
  Search,
  Trash2,
} from "lucide-react";
import type {
  Container,
  MdnsServiceEntry,
  ContainerMdnsOverride,
} from "../../types";
import { useContainerAction } from "../../hooks/useContainers";
import { useOpenTerminalExec } from "../../hooks/useProjects";
import { ContainerMdnsBadge } from "./ContainerMdnsBadge";
import { ContainerMdnsDialog } from "./ContainerMdnsDialog";
import { cn } from "@/lib/utils";

function parseHostPorts(ports: string): string[] {
  if (!ports) return [];
  return ports
    .split(",")
    .map((p) => {
      const match = p.trim().match(/:(\d+)->/);
      return match ? match[1] : null;
    })
    .filter((p): p is string => p !== null);
}

function abbreviateImage(image: string): string {
  const parts = image.split("/");
  return parts.length > 2 ? parts.slice(-2).join("/") : image;
}

interface ContainerRowProps {
  container: Container;
  onViewLogs: (id: string) => void;
  onInspect?: (id: string) => void;
  showServiceName?: boolean;
  compact?: boolean;
  mdnsService?: MdnsServiceEntry;
  mdnsOverride?: ContainerMdnsOverride;
  mdnsEnabled?: boolean;
  defaultServiceType?: string;
}

export function ContainerRow({
  container,
  onViewLogs,
  onInspect,
  showServiceName,
  compact,
  mdnsService,
  mdnsOverride,
  mdnsEnabled,
  defaultServiceType,
}: ContainerRowProps) {
  const action = useContainerAction();
  const openTerminal = useOpenTerminalExec();
  const [showMdnsDialog, setShowMdnsDialog] = useState(false);
  const isRunning = container.state === "running";
  const displayName =
    showServiceName && container.compose_service
      ? container.compose_service
      : container.name;
  const hostPorts = parseHostPorts(container.ports);

  return (
    <div
      className={cn(
        "group/row flex items-center gap-3 px-4 py-2.5 transition-colors",
        compact ? "hover:bg-[var(--glass-bg-hover)]" : "glass-card"
      )}
    >
      {/* Status dot */}
      <div
        className={cn(
          "h-2 w-2 rounded-full shrink-0",
          isRunning
            ? "bg-[var(--status-running-text)] shadow-[var(--status-running-glow)]"
            : "bg-[var(--status-stopped-text)]"
        )}
      />

      {/* Container info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{displayName}</span>
          {hostPorts.length > 0 && (
            <div className="flex items-center gap-1 shrink-0">
              {hostPorts.slice(0, 3).map((port, i) => (
                <span
                  key={i}
                  className="text-[10px] font-mono text-muted-foreground bg-[var(--glass-bg)] border border-[var(--glass-border)] px-1.5 py-0.5 rounded-md leading-none"
                >
                  :{port}
                </span>
              ))}
              {hostPorts.length > 3 && (
                <span className="text-[10px] text-muted-foreground">
                  +{hostPorts.length - 3}
                </span>
              )}
            </div>
          )}
          {mdnsEnabled && isRunning && (
            <ContainerMdnsBadge
              service={mdnsService}
              onConfigure={() => setShowMdnsDialog(true)}
            />
          )}
        </div>
        <span className="text-xs text-muted-foreground truncate block mt-0.5">
          {abbreviateImage(container.image)}
        </span>
      </div>

      {/* Action buttons — icon-only, secondary actions revealed on hover */}
      <div className="flex items-center gap-0.5 shrink-0">
        {isRunning && (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => openTerminal.mutate(container.id)}
            disabled={openTerminal.isPending}
            title="Open terminal"
          >
            <SquareTerminal className="h-3.5 w-3.5" />
          </Button>
        )}
        {isRunning ? (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() =>
              action.mutate({ id: container.id, action: "stop" })
            }
            disabled={action.isPending}
            title="Stop"
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() =>
              action.mutate({ id: container.id, action: "start" })
            }
            disabled={action.isPending}
            title="Start"
          >
            <Play className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() =>
            action.mutate({ id: container.id, action: "restart" })
          }
          disabled={action.isPending}
          title="Restart"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={() => onViewLogs(container.id)}
          title="Logs"
        >
          <ScrollText className="h-3.5 w-3.5" />
        </Button>
        {onInspect && (
          <Button
            variant="ghost"
            size="icon-xs"
            className="opacity-0 group-hover/row:opacity-100 transition-opacity"
            onClick={() => onInspect(container.id)}
            title="Inspect"
          >
            <Search className="h-3.5 w-3.5" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-xs"
          className="opacity-0 group-hover/row:opacity-100 transition-opacity text-destructive hover:text-destructive"
          onClick={() =>
            action.mutate({ id: container.id, action: "remove" })
          }
          disabled={action.isPending}
          title="Remove"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {showMdnsDialog && (
        <ContainerMdnsDialog
          containerName={container.name}
          currentOverride={mdnsOverride}
          currentService={mdnsService}
          defaultServiceType={defaultServiceType ?? "_http._tcp.local."}
          onClose={() => setShowMdnsDialog(false)}
        />
      )}
    </div>
  );
}
