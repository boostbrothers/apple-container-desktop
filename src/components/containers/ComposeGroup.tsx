import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { Container } from "../../types";
import { useContainerAction } from "../../hooks/useContainers";
import { ContainerRow } from "./ContainerRow";

interface ComposeGroupProps {
  project: string;
  containers: Container[];
  onViewLogs: (id: string) => void;
}

export function ComposeGroup({ project, containers, onViewLogs }: ComposeGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const action = useContainerAction();

  const runningCount = containers.filter((c) => c.state === "running").length;
  const totalCount = containers.length;
  const allRunning = runningCount === totalCount;
  const allStopped = runningCount === 0;

  const handleGroupAction = async (type: "start" | "stop" | "restart" | "remove") => {
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
    <div className="rounded-md border">
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <span className="font-medium text-sm">{project}</span>
        <Badge variant={allRunning ? "default" : allStopped ? "secondary" : "outline"} className="text-xs">
          {runningCount}/{totalCount} running
        </Badge>
        <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => handleGroupAction("start")} disabled={action.isPending || allRunning}>
            Start
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleGroupAction("stop")} disabled={action.isPending || allStopped}>
            Stop
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleGroupAction("restart")} disabled={action.isPending}>
            Restart
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleGroupAction("remove")} disabled={action.isPending}>
            Remove
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="border-t">
          {containers.map((container) => (
            <div key={container.id} className="pl-6">
              <ContainerRow container={container} onViewLogs={onViewLogs} showServiceName />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
