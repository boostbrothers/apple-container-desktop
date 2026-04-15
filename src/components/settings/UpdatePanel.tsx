import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import { useContainerVersion } from "@/hooks/useContainerVersion";

export function UpdatePanel() {
  const { data: version, isLoading: versionLoading, error: versionError } = useContainerVersion();

  if (versionLoading) {
    return (
      <div className="mx-auto max-w-lg flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (versionError) {
    return (
      <div className="mx-auto max-w-lg glass-section border-destructive p-4 text-destructive">
        Failed to load version info: {versionError.message}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      {/* Version Info */}
      <div>
        <h2 className="text-lg font-semibold">Version Info</h2>
        <div className="mt-2 glass-section p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Container Runtime Version</span>
            <span className="text-sm font-medium">{version?.version ?? "-"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
