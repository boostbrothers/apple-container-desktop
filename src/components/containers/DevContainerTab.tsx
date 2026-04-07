import { useDevcontainerProjects, useDevcontainerCliCheck } from "../../hooks/useDevcontainers";
import { DevContainerGroup } from "./DevContainerGroup";
import { AddProjectDialog } from "./AddProjectDialog";
import { Button } from "@/components/ui/button";
import { Copy } from "lucide-react";

export function DevContainerTab() {
  const { data: cliAvailable, isLoading: cliChecking } = useDevcontainerCliCheck();
  const { data: projects, isLoading, error } = useDevcontainerProjects();

  if (cliChecking) {
    return <p className="text-sm text-muted-foreground">Checking devcontainer CLI...</p>;
  }

  const installCmd = "npm install -g @devcontainers/cli";

  return (
    <div>
      {cliAvailable === false && (
        <div className="mb-4 rounded-lg border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
          <p className="text-sm font-medium text-yellow-500 mb-1">devcontainer CLI required</p>
          <div className="flex items-center gap-2">
            <code className="text-xs bg-black/30 px-2 py-1 rounded">{installCmd}</code>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              onClick={() => navigator.clipboard.writeText(installCmd)}
            >
              <Copy className="h-3 w-3" />
            </Button>
          </div>
        </div>
      )}

      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm text-muted-foreground">
          {projects?.length ?? 0} project{(projects?.length ?? 0) !== 1 ? "s" : ""} registered
        </span>
        <AddProjectDialog />
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {error && <p className="text-sm text-destructive">Failed to load projects.</p>}

      <div className="flex flex-col gap-2">
        {projects?.map((project) => (
          <DevContainerGroup key={project.id} project={project} />
        ))}
        {projects && projects.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground">
            No dev container projects registered. Click "Add Project" to get started.
          </p>
        )}
      </div>
    </div>
  );
}
