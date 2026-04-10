import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ChevronRight,
  ChevronDown,
  Play,
  Square,
  RotateCcw,
  Trash2,
} from "lucide-react";
import type { Container, MdnsServiceEntry, MdnsConfig } from "../../types";
import { useContainerAction } from "../../hooks/useContainers";
import { ContainerRow } from "./ContainerRow";
import { cn } from "@/lib/utils";

interface ComposeGroupProps {
  project: string;
  containers: Container[];
  onViewLogs: (id: string) => void;
  onInspect?: (id: string) => void;
  mdnsServiceMap?: Map<string, MdnsServiceEntry>;
  mdnsConfig?: MdnsConfig;
}

export function ComposeGroup({
  project,
  containers,
  onViewLogs,
  onInspect,
  mdnsServiceMap,
  mdnsConfig,
}: ComposeGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const action = useContainerAction();

  const runningCount = containers.filter((c) => c.state === "running").length;
  const totalCount = containers.length;
  const allRunning = runningCount === totalCount;
  const allStopped = runningCount === 0;

  const handleGroupAction = async (
    type: "start" | "stop" | "restart" | "remove"
  ) => {
    const targets = containers.filter((c) => {
      if (type === "start") return c.state !== "running";
      if (type === "stop") return c.state === "running";
      return true;
    });
    for (const c of targets) {
      action.mutate({ id: c.id, action: type });
    }
  };

  return (
    <div className="glass-group overflow-hidden">
      {/* Group header */}
      <div
        className="group/header flex items-center gap-2 px-4 py-2.5 cursor-pointer hover:bg-[var(--glass-bg-hover)] transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        )}
        <span className="font-medium text-sm">{project}</span>
        <span
          className={cn(
            "text-xs tabular-nums",
            allRunning
              ? "text-[var(--status-running-text)]"
              : allStopped
                ? "text-[var(--status-stopped-text)]"
                : "text-muted-foreground"
          )}
        >
          {runningCount}/{totalCount}
        </span>

        {/* Group actions — revealed on hover */}
        <div
          className="ml-auto flex items-center gap-0.5 opacity-0 group-hover/header:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => handleGroupAction("start")}
            disabled={action.isPending || allRunning}
            title="Start All"
          >
            <Play className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => handleGroupAction("stop")}
            disabled={action.isPending || allStopped}
            title="Stop All"
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            onClick={() => handleGroupAction("restart")}
            disabled={action.isPending}
            title="Restart All"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            className="text-destructive hover:text-destructive"
            onClick={() => handleGroupAction("remove")}
            disabled={action.isPending}
            title="Remove All"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* Expanded container list — flat dividers, no nested cards */}
      {expanded && (
        <div className="border-t border-[var(--glass-border)] divide-y divide-[var(--glass-border)]">
          {containers.map((container) => (
            <ContainerRow
              key={container.id}
              container={container}
              onViewLogs={onViewLogs}
              onInspect={onInspect}
              showServiceName
              compact
              mdnsService={mdnsServiceMap?.get(container.name)}
              mdnsOverride={
                mdnsConfig?.container_overrides?.[container.name]
              }
              mdnsEnabled={mdnsConfig?.enabled}
              defaultServiceType={mdnsConfig?.default_service_type}
            />
          ))}
        </div>
      )}
    </div>
  );
}
