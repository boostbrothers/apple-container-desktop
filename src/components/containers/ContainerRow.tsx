import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SquareTerminal } from "lucide-react";
import type { Container } from "../../types";
import { useContainerAction } from "../../hooks/useContainers";
import { useOpenTerminalExec } from "../../hooks/useProjects";

interface ContainerRowProps {
  container: Container;
  onViewLogs: (id: string) => void;
  onInspect?: (id: string) => void;
  showServiceName?: boolean;
}

export function ContainerRow({ container, onViewLogs, onInspect, showServiceName }: ContainerRowProps) {
  const action = useContainerAction();
  const openTerminal = useOpenTerminalExec();
  const isRunning = container.state === "running";
  const displayName = showServiceName && container.compose_service
    ? container.compose_service
    : container.name;

  return (
    <div className="glass-card flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{displayName}</span>
          <Badge variant={isRunning ? "default" : "secondary"} className="text-xs">
            {container.state}
          </Badge>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="truncate">{container.image}</span>
          {container.ports && <span>{container.ports}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {isRunning && (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            onClick={() => openTerminal.mutate(container.id)}
            disabled={openTerminal.isPending}
            title="Open terminal"
          >
            <SquareTerminal className="h-4 w-4" />
          </Button>
        )}
        {isRunning ? (
          <Button variant="ghost" size="sm" onClick={() => action.mutate({ id: container.id, action: "stop" })} disabled={action.isPending}>Stop</Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => action.mutate({ id: container.id, action: "start" })} disabled={action.isPending}>Start</Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => action.mutate({ id: container.id, action: "restart" })} disabled={action.isPending}>Restart</Button>
        <Button variant="ghost" size="sm" onClick={() => onViewLogs(container.id)}>Logs</Button>
        {onInspect && <Button variant="ghost" size="sm" onClick={() => onInspect(container.id)}>Inspect</Button>}
        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => action.mutate({ id: container.id, action: "remove" })} disabled={action.isPending}>Remove</Button>
      </div>
    </div>
  );
}
