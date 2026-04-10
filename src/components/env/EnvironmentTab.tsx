import { Button } from "@/components/ui/button";
import { FileText, Download } from "lucide-react";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { Project } from "../../types";
import { ProfileSelector } from "./ProfileSelector";
import { EnvVarTable } from "./EnvVarTable";
import { useLoadDotenvForProfile, useExportProfileToDotenv } from "../../hooks/useEnvSecrets";

interface EnvironmentTabProps {
  project: Project;
}

export function EnvironmentTab({ project }: EnvironmentTabProps) {
  const loadDotenv = useLoadDotenvForProfile();
  const exportDotenv = useExportProfileToDotenv();

  const handleImportDotenv = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Env Files", extensions: ["env", "*"] }],
      defaultPath: project.workspace_path,
    });
    if (!selected) return;
    const path = typeof selected === "string" ? selected : selected[0];
    if (!path) return;

    loadDotenv.mutate({
      projectId: project.id,
      filePath: path,
      profile: project.active_profile,
    });
  };

  const handleExportDotenv = async () => {
    const path = await save({
      defaultPath: `${project.workspace_path}/.env.${project.active_profile}`,
      filters: [{ name: "Env Files", extensions: ["env"] }],
    });
    if (!path) return;

    exportDotenv.mutate({
      projectId: project.id,
      profile: project.active_profile,
      filePath: path,
    });
  };

  const envCount = project.env_vars.filter(
    (v) => v.profile === project.active_profile && !v.secret
  ).length;
  const secretCount = project.env_vars.filter(
    (v) => v.profile === project.active_profile && v.secret
  ).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <ProfileSelector
          projectId={project.id}
          activeProfile={project.active_profile}
          profiles={project.profiles}
        />
        <div className="flex gap-1">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleImportDotenv}>
            <FileText className="h-3.5 w-3.5 mr-1" />
            Import .env
          </Button>
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleExportDotenv}>
            <Download className="h-3.5 w-3.5 mr-1" />
            Export .env
          </Button>
        </div>
      </div>

      <div className="flex gap-2 text-[10px] text-muted-foreground">
        <span>{envCount} env vars</span>
        {secretCount > 0 && <span>· {secretCount} secrets</span>}
      </div>

      <EnvVarTable
        projectId={project.id}
        envVars={project.env_vars}
        activeProfile={project.active_profile}
      />

    </div>
  );
}
