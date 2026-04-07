import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Trash2 } from "lucide-react";
import { useMountSettings, useSaveMountSettings } from "@/hooks/useMounts";

interface MountEntryLocal {
  location: string;
  writable: boolean;
}

export function MountSettings() {
  const { data: settings, isLoading, error } = useMountSettings();
  const saveMutation = useSaveMountSettings();

  const [mounts, setMounts] = useState<MountEntryLocal[]>([]);
  const [mountType, setMountType] = useState("sshfs");
  const [mountInotify, setMountInotify] = useState(false);

  const [newLocation, setNewLocation] = useState("");
  const [newWritable, setNewWritable] = useState(true);

  useEffect(() => {
    if (settings) {
      setMounts(settings.mounts.map((m) => ({ location: m.location, writable: m.writable })));
      setMountType(settings.mount_type);
      setMountInotify(settings.mount_inotify);
    }
  }, [settings]);

  const hasChanges = (() => {
    if (!settings) return false;
    if (mountType !== settings.mount_type) return true;
    if (mountInotify !== settings.mount_inotify) return true;
    if (mounts.length !== settings.mounts.length) return true;
    for (let i = 0; i < mounts.length; i++) {
      if (mounts[i].location !== settings.mounts[i].location) return true;
      if (mounts[i].writable !== settings.mounts[i].writable) return true;
    }
    return false;
  })();

  const handleAddMount = () => {
    const trimmed = newLocation.trim();
    if (!trimmed) return;
    setMounts([...mounts, { location: trimmed, writable: newWritable }]);
    setNewLocation("");
    setNewWritable(true);
  };

  const handleRemoveMount = (index: number) => {
    setMounts(mounts.filter((_, i) => i !== index));
  };

  const handleToggleWritable = (index: number) => {
    setMounts(mounts.map((m, i) => (i === index ? { ...m, writable: !m.writable } : m)));
  };

  const handleSave = () => {
    saveMutation.mutate({
      mounts,
      mountType,
      mountInotify,
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
        Failed to load mount settings. Is Colima running?
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h2 className="text-lg font-semibold">Mount Settings</h2>

      <div className="space-y-5">
        {/* Current Mounts */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Mounts</label>
          {mounts.length === 0 ? (
            <p className="text-xs text-muted-foreground">No mounts configured.</p>
          ) : (
            <div className="space-y-2">
              {mounts.map((mount, index) => (
                <div key={index} className="glass-list-item flex items-center gap-2 p-2">
                  <span className="flex-1 truncate text-sm font-mono">{mount.location}</span>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={mount.writable}
                      onChange={() => handleToggleWritable(index)}
                      disabled={saveMutation.isPending}
                      className="rounded"
                    />
                    writable
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveMount(index)}
                    disabled={saveMutation.isPending}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add Mount */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Add Mount</label>
          <div className="flex items-center gap-2">
            <Input
              placeholder="~/code or /path/to/dir"
              value={newLocation}
              onChange={(e) => setNewLocation(e.target.value)}
              disabled={saveMutation.isPending}
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddMount();
              }}
            />
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={newWritable}
                onChange={(e) => setNewWritable(e.target.checked)}
                disabled={saveMutation.isPending}
                className="rounded"
              />
              writable
            </label>
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddMount}
              disabled={!newLocation.trim() || saveMutation.isPending}
            >
              Add
            </Button>
          </div>
        </div>

        {/* Mount Type */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Mount Type</label>
          <div className="flex gap-2">
            {(["sshfs", "9p", "virtiofs"] as const).map((t) => (
              <Button
                key={t}
                variant={mountType === t ? "default" : "outline"}
                size="sm"
                onClick={() => setMountType(t)}
                disabled={saveMutation.isPending}
              >
                {t}
              </Button>
            ))}
          </div>
        </div>

        {/* Mount Inotify */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={mountInotify}
              onChange={(e) => setMountInotify(e.target.checked)}
              disabled={saveMutation.isPending}
              className="rounded"
            />
            Mount Inotify
          </label>
          <p className="text-xs text-muted-foreground">
            Enable inotify for mounted directories. May impact performance.
          </p>
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
            {saveMutation.error?.message ?? "Failed to save mount settings"}
          </p>
        )}

        {saveMutation.isSuccess && (
          <p className="text-center text-xs text-green-600">
            Mount settings saved successfully
          </p>
        )}
      </div>
    </div>
  );
}
