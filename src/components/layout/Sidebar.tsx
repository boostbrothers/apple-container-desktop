import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Play, Square, RotateCw } from "lucide-react";
import { useColimaStatus, useColimaAction } from "../../hooks/useColimaStatus";

type Page = "containers" | "images" | "volumes" | "networks" | "settings";

interface SidebarProps {
  activePage: Page;
  onPageChange: (page: Page) => void;
}

export function Sidebar({ activePage, onPageChange }: SidebarProps) {
  const { data: status } = useColimaStatus();
  const colimaAction = useColimaAction();
  const isLoading = colimaAction.isPending;

  return (
    <div className="glass-sidebar flex h-full w-52 flex-col p-3">
      <div className="mb-4 flex flex-col gap-2 px-2">
        <div className="flex items-center gap-2">
          <div
            className={cn("h-2 w-2 rounded-full", status?.running ? "bg-[var(--status-running-text)]" : "bg-gray-400")}
            style={status?.running ? { boxShadow: 'var(--status-running-glow)' } : undefined}
          />
          <span className="text-sm font-medium">Colima</span>
          <Badge variant={status?.running ? "default" : "secondary"} className={cn("ml-auto text-xs", status?.running && "bg-[var(--status-running-bg)] text-[var(--status-running-text)] border border-[var(--status-running-border)]")}>
            {isLoading ? "..." : status?.running ? "Running" : "Stopped"}
          </Badge>
        </div>
        <div className="flex gap-1">
          {status?.running ? (
            <>
              <button
                onClick={() => colimaAction.mutate("stop")}
                disabled={isLoading}
                className="glass-nav-item flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                title="Stop Colima"
              >
                <Square className="h-3 w-3" />
                Stop
              </button>
              <button
                onClick={() => colimaAction.mutate("restart")}
                disabled={isLoading}
                className="glass-nav-item flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
                title="Restart Colima"
              >
                <RotateCw className="h-3 w-3" />
                Restart
              </button>
            </>
          ) : (
            <button
              onClick={() => colimaAction.mutate("start")}
              disabled={isLoading}
              className="glass-nav-item flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs text-[var(--status-running-text)] hover:bg-[var(--status-running-bg)] disabled:opacity-50"
              title="Start Colima"
            >
              <Play className="h-3 w-3" />
              Start
            </button>
          )}
        </div>
      </div>
      <nav className="flex flex-col gap-1">
        <button
          onClick={() => onPageChange("containers")}
          data-active={activePage === "containers"}
          className={cn("glass-nav-item rounded-lg px-3 py-2 text-left text-sm",
            activePage === "containers" ? "text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Containers
        </button>
        <button
          onClick={() => onPageChange("images")}
          data-active={activePage === "images"}
          className={cn("glass-nav-item rounded-lg px-3 py-2 text-left text-sm",
            activePage === "images" ? "text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Images
        </button>
        <button
          onClick={() => onPageChange("volumes")}
          data-active={activePage === "volumes"}
          className={cn("glass-nav-item rounded-lg px-3 py-2 text-left text-sm",
            activePage === "volumes" ? "text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Volumes
        </button>
        <button
          onClick={() => onPageChange("networks")}
          data-active={activePage === "networks"}
          className={cn("glass-nav-item rounded-lg px-3 py-2 text-left text-sm",
            activePage === "networks" ? "text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Networks
        </button>
        <button
          onClick={() => onPageChange("settings")}
          data-active={activePage === "settings"}
          className={cn("glass-nav-item rounded-lg px-3 py-2 text-left text-sm",
            activePage === "settings" ? "text-accent-foreground font-medium" : "text-muted-foreground hover:text-foreground"
          )}
        >
          Settings
        </button>
      </nav>
    </div>
  );
}
