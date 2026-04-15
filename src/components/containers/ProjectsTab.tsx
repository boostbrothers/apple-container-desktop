import { useState } from "react";
import { useProjects } from "../../hooks/useProjects";
import { ProjectCard } from "./ProjectCard";
import { AddProjectWizard } from "./AddProjectWizard";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import type { Project } from "../../types";

interface ProjectsTabProps {
  onSelectProject: (project: Project) => void;
}

export function ProjectsTab({ onSelectProject }: ProjectsTabProps) {
  const { data: projects, isLoading, error } = useProjects();
  const [showWizard, setShowWizard] = useState(false);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Projects</h1>
        <Button size="sm" onClick={() => setShowWizard(true)}>
          <Plus className="h-4 w-4 mr-1" />
          Add Project
        </Button>
      </div>

      {showWizard && (
        <div className="mb-4">
          <AddProjectWizard onClose={() => setShowWizard(false)} />
        </div>
      )}

      {isLoading && (
        <p className="text-sm text-muted-foreground">Loading projects...</p>
      )}
      {error && (
        <p className="text-sm text-destructive">
          Failed to load projects.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {projects?.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            onSelect={() => onSelectProject(project)}
          />
        ))}
        {projects && projects.length === 0 && !isLoading && !showWizard && (
          <div className="rounded-lg glass-panel p-8 text-center">
            <p className="text-sm text-muted-foreground mb-2">
              No projects registered yet.
            </p>
            <p className="text-xs text-muted-foreground">
              Add a project folder with a Dockerfile to get started.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
