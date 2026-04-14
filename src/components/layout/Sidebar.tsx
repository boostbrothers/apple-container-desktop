import { useState } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Play, Square, RotateCw, ChevronRight } from "lucide-react";
import { useSystemStatus, useSystemAction } from "../../hooks/useSystemStatus";
import { useContainers } from "../../hooks/useContainers";

export type Page =
  | "containers"
  | "images"
  | "volumes"
  | "networks"
  | "environment"
  // Settings sub-pages
  | "settings/resources"
  | "settings/registry"
  | "settings/domains"
  | "settings/terminal"
  | "settings/update"
  | "settings/appearance";

export type ComposeFilter = string | null;

interface SidebarProps {
  activePage: Page;
  onPageChange: (page: Page) => void;
  composeFilter: ComposeFilter;
  onComposeFilter: (filter: ComposeFilter) => void;
}

export function Sidebar({ activePage, onPageChange, composeFilter, onComposeFilter }: SidebarProps) {
  const { data: status } = useSystemStatus();
  const { data: containers } = useContainers();
  const systemAction = useSystemAction();
  const isLoading = systemAction.isPending;

  const [settingsOpen, setSettingsOpen] = useState(activePage.startsWith("settings/"));

  const isSettingsPage = activePage.startsWith("settings/");

  const navItem = (page: Page, label: string, indent = false) => (
    <button
      key={page}
      onClick={() => {
        onPageChange(page);
        if (page === "containers") onComposeFilter(null);
      }}
      className={cn(
        "glass-nav-item rounded-lg px-3 py-2 text-left text-sm w-full",
        indent && "pl-7 py-1.5 text-xs",
        activePage === page
          ? "text-accent-foreground font-medium"
          : "text-muted-foreground hover:text-foreground"
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="glass-sidebar flex h-full w-52 flex-col p-3">
      {/* System Status */}
      <div className="mb-4 flex flex-col gap-2 px-2">
        <div className="flex items-center gap-2">
          <div
            className={cn("h-2 w-2 rounded-full", status?.running ? "bg-[var(--status-running-text)]" : "bg-gray-400")}
            style={status?.running ? { boxShadow: 'var(--status-running-glow)' } : undefined}
          />
          <span className="text-sm font-medium">Container</span>
          <Badge variant={status?.running ? "default" : "secondary"} className={cn("ml-auto text-xs", status?.running && "bg-[var(--status-running-bg)] text-[var(--status-running-text)] border border-[var(--status-running-border)]")}>
            {isLoading ? "..." : status?.running ? "Running" : "Stopped"}
          </Badge>
        </div>
        <div className="flex gap-1">
          {status?.running ? (
            <>
              <button
                onClick={() => systemAction.mutate("stop")}
                disabled={isLoading}
                className="glass-nav-item flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <Square className="h-3 w-3" /> Stop
              </button>
              <button
                onClick={() => systemAction.mutate("restart")}
                disabled={isLoading}
                className="glass-nav-item flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <RotateCw className="h-3 w-3" /> Restart
              </button>
            </>
          ) : (
            <button
              onClick={() => systemAction.mutate("start")}
              disabled={isLoading}
              className="glass-nav-item flex flex-1 items-center justify-center gap-1 rounded-md px-2 py-1.5 text-xs text-[var(--status-running-text)] hover:bg-[var(--status-running-bg)] disabled:opacity-50"
            >
              <Play className="h-3 w-3" /> Start
            </button>
          )}
        </div>
      </div>

      <nav className="flex flex-col gap-0.5 flex-1 overflow-y-auto">
        {navItem("containers", "Containers")}

        {navItem("images", "Images")}
        {navItem("volumes", "Volumes")}
        {navItem("networks", "Networks")}
        {navItem("environment", "Environment")}

        {/* Settings — expandable */}
        <button
          onClick={() => {
            setSettingsOpen(!settingsOpen);
            if (!isSettingsPage) onPageChange("settings/resources");
          }}
          className={cn(
            "glass-nav-item rounded-lg px-3 py-2 text-left text-sm w-full flex items-center justify-between",
            isSettingsPage
              ? "text-accent-foreground font-medium"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          Settings
          <ChevronRight
            className={cn(
              "h-3 w-3 transition-transform",
              settingsOpen && "rotate-90"
            )}
          />
        </button>
        {settingsOpen && (
          <div className="flex flex-col gap-0.5">
            {navItem("settings/resources", "Resources", true)}
            {navItem("settings/registry", "Registry", true)}
            {navItem("settings/domains", "Domains", true)}
            {navItem("settings/terminal", "Terminal", true)}
            {navItem("settings/update", "Update", true)}
            {navItem("settings/appearance", "Appearance", true)}
          </div>
        )}
      </nav>
    </div>
  );
}
