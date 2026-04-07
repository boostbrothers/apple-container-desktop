import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, RefreshCw, Download, CheckCircle, AlertCircle } from "lucide-react";
import { useColimaVersion, useVersionCheck, useUpdateRuntime } from "@/hooks/useColimaVersion";

export function UpdatePanel() {
  const { data: version, isLoading: versionLoading, error: versionError } = useColimaVersion();
  const { data: versionCheck, isLoading: checkLoading, refetch: recheckVersion } = useVersionCheck();
  const updateMutation = useUpdateRuntime();

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
            <span className="text-sm text-muted-foreground">Colima Version</span>
            <span className="text-sm font-medium">{version?.version ?? "-"}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Git Commit</span>
            <code className="text-xs font-mono bg-[var(--glass-bg)] px-2 py-0.5 rounded-md border border-[var(--glass-border)]">
              {version?.git_commit ?? "-"}
            </code>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Status</span>
            {checkLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : versionCheck?.update_available ? (
              <Badge variant="outline" className="border-orange-400 text-orange-500">
                Update available: {versionCheck.latest}
              </Badge>
            ) : (
              <Badge variant="outline" className="border-green-400 text-green-500">
                Up to date
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Runtime Versions */}
      <div>
        <h2 className="text-lg font-semibold">Runtime Versions</h2>
        <div className="mt-2 glass-section p-4">
          {version?.runtime_versions && version.runtime_versions.length > 0 ? (
            <div className="space-y-2">
              {version.runtime_versions.map((rv) => (
                <div key={rv.name} className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">{rv.name}</span>
                  <span className="text-sm font-medium">{rv.version}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No runtime version info available.</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div>
        <h2 className="text-lg font-semibold">Actions</h2>
        <div className="mt-2 glass-section p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Button
              onClick={() => updateMutation.mutate()}
              disabled={updateMutation.isPending}
              className="flex-1"
            >
              {updateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Update Runtime
                </>
              )}
            </Button>
            <Button
              variant="outline"
              onClick={() => recheckVersion()}
              disabled={checkLoading}
            >
              {checkLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
            </Button>
          </div>

          {updateMutation.isSuccess && (
            <div className="flex items-center gap-2 text-sm text-green-600">
              <CheckCircle className="h-4 w-4" />
              <span>{updateMutation.data}</span>
            </div>
          )}
          {updateMutation.isError && (
            <div className="flex items-center gap-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              <span>{(updateMutation.error as Error).message}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
