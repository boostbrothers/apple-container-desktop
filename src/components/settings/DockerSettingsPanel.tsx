import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, X } from "lucide-react";
import { useDockerSettings, useSaveDockerSettings } from "@/hooks/useDockerSettings";

export function DockerSettingsPanel() {
  const { data: settings, isLoading, error } = useDockerSettings();
  const saveMutation = useSaveDockerSettings();

  const [insecureRegistries, setInsecureRegistries] = useState<string[]>([]);
  const [registryMirrors, setRegistryMirrors] = useState<string[]>([]);
  const [newRegistry, setNewRegistry] = useState("");
  const [newMirror, setNewMirror] = useState("");

  useEffect(() => {
    if (settings) {
      setInsecureRegistries(settings.insecure_registries);
      setRegistryMirrors(settings.registry_mirrors);
    }
  }, [settings]);

  const hasChanges =
    settings &&
    (JSON.stringify(insecureRegistries) !== JSON.stringify(settings.insecure_registries) ||
      JSON.stringify(registryMirrors) !== JSON.stringify(settings.registry_mirrors));

  const handleAddRegistry = () => {
    const trimmed = newRegistry.trim();
    if (trimmed && !insecureRegistries.includes(trimmed)) {
      setInsecureRegistries([...insecureRegistries, trimmed]);
      setNewRegistry("");
    }
  };

  const handleRemoveRegistry = (index: number) => {
    setInsecureRegistries(insecureRegistries.filter((_, i) => i !== index));
  };

  const handleAddMirror = () => {
    const trimmed = newMirror.trim();
    if (trimmed && !registryMirrors.includes(trimmed)) {
      setRegistryMirrors([...registryMirrors, trimmed]);
      setNewMirror("");
    }
  };

  const handleRemoveMirror = (index: number) => {
    setRegistryMirrors(registryMirrors.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    saveMutation.mutate({
      insecureRegistries,
      registryMirrors,
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Failed to load Docker settings. Is Colima running?
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h2 className="text-lg font-semibold">Docker Daemon Settings</h2>

      <div className="space-y-5">
        {/* Insecure Registries */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Insecure Registries</label>
          <div className="space-y-1">
            {insecureRegistries.map((registry, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="glass-list-item flex-1 px-3 py-1.5 text-sm">
                  {registry}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleRemoveRegistry(index)}
                  disabled={saveMutation.isPending}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="myregistry.local:5000"
              value={newRegistry}
              onChange={(e) => setNewRegistry(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddRegistry()}
              disabled={saveMutation.isPending}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddRegistry}
              disabled={!newRegistry.trim() || saveMutation.isPending}
            >
              Add
            </Button>
          </div>
        </div>

        {/* Registry Mirrors */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Registry Mirrors</label>
          <div className="space-y-1">
            {registryMirrors.map((mirror, index) => (
              <div key={index} className="flex items-center gap-2">
                <span className="glass-list-item flex-1 px-3 py-1.5 text-sm">
                  {mirror}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8"
                  onClick={() => handleRemoveMirror(index)}
                  disabled={saveMutation.isPending}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="https://mirror.gcr.io"
              value={newMirror}
              onChange={(e) => setNewMirror(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddMirror()}
              disabled={saveMutation.isPending}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddMirror}
              disabled={!newMirror.trim() || saveMutation.isPending}
            >
              Add
            </Button>
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="space-y-2">
        <Button
          onClick={handleSave}
          disabled={!hasChanges || saveMutation.isPending}
          className="w-full"
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save"
          )}
        </Button>

        {saveMutation.isError && (
          <p className="text-center text-xs text-destructive">
            {saveMutation.error?.message ?? "Failed to save settings"}
          </p>
        )}

        {saveMutation.isSuccess && (
          <p className="text-center text-xs text-green-600">
            Settings saved successfully
          </p>
        )}
      </div>
    </div>
  );
}
