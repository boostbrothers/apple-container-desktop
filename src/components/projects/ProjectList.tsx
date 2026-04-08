import { useState } from "react";
import { useDockerProjects } from "../../hooks/useDockerProjects";
import { ProjectCard } from "./ProjectCard";
import { AddProjectWizard } from "./AddProjectWizard";
import { ProjectDetail } from "./ProjectDetail";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export function ProjectList() {
  const { data: projects, isLoading, error } = useDockerProjects();
  const [showAdd, setShowAdd] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selectedProject = projects?.find((p) => p.id === selectedId);

  if (selectedProject) {
    return (
      <ProjectDetail
        project={selectedProject}
        onBack={() => setSelectedId(null)}
      />
    );
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Projects</h1>
        <Button size="sm" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Project
        </Button>
      </div>

      {showAdd && (
        <div className="mb-4">
          <AddProjectWizard onClose={() => setShowAdd(false)} />
        </div>
      )}

      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading projects...</p>
      )}
      {error && (
        <p className="text-sm text-destructive">
          Failed to load projects. Is Colima running?
        </p>
      )}

      <div className="flex flex-col gap-2">
        {projects?.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onSelect={() => setSelectedId(project.id)}
          />
        ))}
        {projects && projects.length === 0 && !isLoading && !showAdd && (
          <div className="rounded-lg glass-panel p-8 text-center">
            <p className="text-sm text-muted-foreground mb-2">
              No projects registered yet.
            </p>
            <p className="text-xs text-muted-foreground">
              Add a project folder with a Dockerfile, docker-compose.yml, or
              devcontainer.json to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
