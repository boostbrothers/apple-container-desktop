import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useColimaStatus } from "../../hooks/useColimaStatus";

type Page = "containers" | "images" | "settings";

interface SidebarProps {
  activePage: Page;
  onPageChange: (page: Page) => void;
}

export function Sidebar({ activePage, onPageChange }: SidebarProps) {
  const { data: status } = useColimaStatus();

  return (
    <div className="flex h-full w-52 flex-col border-r bg-muted/30 p-3">
      <div className="mb-4 flex items-center gap-2 px-2">
        <div className={cn("h-2 w-2 rounded-full", status?.running ? "bg-green-500" : "bg-gray-400")} />
        <span className="text-sm font-medium">Colima</span>
        <Badge variant={status?.running ? "default" : "secondary"} className="ml-auto text-xs">
          {status?.running ? "Running" : "Stopped"}
        </Badge>
      </div>
      <nav className="flex flex-col gap-1">
        <button
          onClick={() => onPageChange("containers")}
          className={cn("rounded-md px-3 py-2 text-left text-sm transition-colors",
            activePage === "containers" ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
          )}
        >
          Containers
        </button>
        <button
          onClick={() => onPageChange("images")}
          className={cn("rounded-md px-3 py-2 text-left text-sm transition-colors",
            activePage === "images" ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
          )}
        >
          Images
        </button>
        <button
          onClick={() => onPageChange("settings")}
          className={cn("rounded-md px-3 py-2 text-left text-sm transition-colors",
            activePage === "settings" ? "bg-accent text-accent-foreground" : "hover:bg-accent/50"
          )}
        >
          Settings
        </button>
      </nav>
    </div>
  );
}
