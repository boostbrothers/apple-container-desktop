import { useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { FolderOpen, Check, X } from "lucide-react";
import { api } from "../../lib/tauri";
import { useAddProject } from "../../hooks/useProjects";
import type { ProjectTypeDetection } from "../../types";

interface AddProjectWizardProps {
  onClose: () => void;
}

export function AddProjectWizard({ onClose }: AddProjectWizardProps) {
  const addProject = useAddProject();
  const [step, setStep] = useState<"select" | "configure">("select");
  const [workspacePath, setWorkspacePath] = useState("");
  const [detection, setDetection] = useState<ProjectTypeDetection | null>(null);
  const [name, setName] = useState("");
  const [dockerfile, setDockerfile] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);

  const handleSelectFolder = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (!selected) return;

    const path = typeof selected === "string" ? selected : selected[0];
    if (!path) return;

    setWorkspacePath(path);
    setDetecting(true);
    setError(null);

    try {
      const result = await api.detectProjectType(path);
      setDetection(result);

      // Auto-set name from folder
      const folderName = path.split("/").pop() || "project";
      setName(folderName);

      // Auto-select dockerfile
      if (result.has_dockerfile) {
        setDockerfile(result.dockerfiles[0] || "Dockerfile");
      }

      setStep("configure");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDetecting(false);
    }
  };

  const handleAdd = () => {
    setError(null);
    addProject.mutate(
      {
        name,
        workspacePath,
        dockerfile: dockerfile || undefined,
      },
      {
        onSuccess: () => onClose(),
        onError: (err) => {
          setError(err instanceof Error ? err.message : String(err));
        },
      }
    );
  };

  const canDetect = !!detection;

  return (
    <div className="glass-panel rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Add Project</h3>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </div>

      {step === "select" && (
        <div className="space-y-3">
          <Button
            variant="outline"
            onClick={handleSelectFolder}
            disabled={detecting}
            className="w-full justify-start"
          >
            <FolderOpen className="h-4 w-4 mr-2" />
            {detecting ? "Detecting project type..." : "Select Project Folder"}
          </Button>
          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}

      {step === "configure" && detection && (
        <div className="space-y-4">
          <div className="rounded-md bg-muted/30 px-3 py-2">
            <div className="text-xs text-muted-foreground mb-1">Path</div>
            <div className="text-sm truncate">{workspacePath}</div>
          </div>

          {/* Detection results */}
          <div className="flex gap-2">
            {detection.has_dockerfile && (
              <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-400 border-blue-500/20">
                <Check className="h-3 w-3 mr-1" /> Dockerfile
              </Badge>
            )}
            {!canDetect && (
              <Badge variant="destructive" className="text-xs">
                No Dockerfile found
              </Badge>
            )}
          </div>

          {canDetect && (
            <>
              {/* Name */}
              <div>
                <label className="text-xs text-muted-foreground block mb-1">
                  Project Name
                </label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="my-project"
                />
              </div>

              {/* Dockerfile selection */}
              {detection.dockerfiles.length > 1 && (
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">
                    Dockerfile
                  </label>
                  <div className="flex gap-1 flex-wrap">
                    {detection.dockerfiles.map((f) => (
                      <Button
                        key={f}
                        variant={dockerfile === f ? "default" : "outline"}
                        size="sm"
                        onClick={() => setDockerfile(f)}
                      >
                        {f}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {/* Dotenv info */}
              {detection.dotenv_files.length > 0 && (
                <div className="rounded-md bg-muted/30 px-3 py-2">
                  <div className="text-[10px] uppercase text-muted-foreground mb-1">
                    Detected .env files
                  </div>
                  <div className="text-xs">
                    {detection.dotenv_files.join(", ")}
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-1">
                    Configure in project settings after adding.
                  </div>
                </div>
              )}

              <div className="flex gap-2 pt-2">
                <Button onClick={handleAdd} disabled={addProject.isPending || !name}>
                  {addProject.isPending ? "Adding..." : "Add Project"}
                </Button>
                <Button variant="outline" onClick={onClose}>
                  Cancel
                </Button>
              </div>
            </>
          )}

          {!canDetect && (
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={() => { setStep("select"); setDetection(null); }}>
                Choose Another Folder
              </Button>
              <Button variant="outline" onClick={onClose}>
                Cancel
              </Button>
            </div>
          )}

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>
      )}
    </div>
  );
}
