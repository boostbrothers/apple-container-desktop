import { Button } from "@/components/ui/button";
import {
  SquareTerminal,
  Square,
  Play,
  RotateCcw,
  ScrollText,
  Search,
  Trash2,
  Globe,
  Copy,
  ExternalLink,
} from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { Container } from "../../types";
import { useContainerAction } from "../../hooks/useContainers";
import { useOpenTerminalExec } from "../../hooks/useProjects";
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
  domainUrl?: string | null;
}

export function ContainerRow({
  container,
  onViewLogs,
  onInspect,
  showServiceName,
  compact,
  domainUrl,
}: ContainerRowProps) {
  const action = useContainerAction();
  const openTerminal = useOpenTerminalExec();
  const isRunning = container.state === "running";
  const displayName = container.name;
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
        <div className="flex items-center gap-1.5">
          <span className="font-medium text-sm truncate">{displayName}</span>
          <span className="text-xs text-muted-foreground truncate">
            {abbreviateImage(container.image)}
          </span>
        </div>
        {hostPorts.length > 0 && (
          <div className="flex items-center gap-1.5 mt-1">
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
        {domainUrl && domainUrl.includes(".") && (
          <div className="flex items-center gap-1 mt-1">
            <Globe className="h-3 w-3 text-[#2997ff] shrink-0" />
            <span
              className="text-[10px] font-mono text-[#2997ff] truncate cursor-pointer hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                openUrl(`http://${domainUrl}`);
              }}
              title={`http://${domainUrl}`}
            >
              {domainUrl}
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-4 w-4 shrink-0 opacity-0 group-hover/row:opacity-100 transition-opacity"
              onClick={(e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(domainUrl);
              }}
              title="Copy domain"
            >
              <Copy className="h-2.5 w-2.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Action buttons */}
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

    </div>
  );
}
