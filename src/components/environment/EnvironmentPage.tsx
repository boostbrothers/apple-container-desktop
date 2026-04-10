import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { useEnvProfiles } from "../../hooks/useEnvStore";
import { GlobalProfileSelector } from "./GlobalProfileSelector";
import { GlobalEnvVarTable } from "./GlobalEnvVarTable";
import { DotenvImport } from "./DotenvImport";
import { GlobalInfisicalConfig } from "./GlobalInfisicalConfig";

export function EnvironmentPage() {
  const { data: profiles, isLoading } = useEnvProfiles();
  const [activeProfileId, setActiveProfileId] = useState<string>("");

  // Set default profile on first load
  useEffect(() => {
    if (profiles && profiles.length > 0 && !activeProfileId) {
      setActiveProfileId(profiles[0].id);
    }
  }, [profiles, activeProfileId]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!profiles || profiles.length === 0) {
    return (
      <div className="flex items-center justify-center h-32">
        <p className="text-sm text-muted-foreground">No profiles found.</p>
      </div>
    );
  }

  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  if (!activeProfile) {
    return null;
  }

  const envCount = activeProfile.env_vars.filter((v) => !v.secret && v.enabled).length;
  const secretCount = activeProfile.env_vars.filter((v) => v.secret && v.enabled).length;
  const conflictCount = (() => {
    const keyCounts = new Map<string, number>();
    for (const v of activeProfile.env_vars) {
      keyCounts.set(v.key, (keyCounts.get(v.key) || 0) + 1);
    }
    return [...keyCounts.values()].filter((c) => c > 1).length;
  })();

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <GlobalProfileSelector
          profiles={profiles}
          activeProfileId={activeProfileId}
          onProfileChange={setActiveProfileId}
        />
        <DotenvImport profileId={activeProfile.id} />
      </div>

      <div className="flex gap-2 text-[10px] text-muted-foreground">
        <span>{envCount} env vars</span>
        {secretCount > 0 && <span>· {secretCount} secrets</span>}
        {conflictCount > 0 && (
          <Badge variant="outline" className="text-[9px] px-1 bg-amber-500/10 text-amber-400 border-amber-500/20">
            {conflictCount} conflicts
          </Badge>
        )}
      </div>

      <GlobalEnvVarTable profile={activeProfile} />

      <GlobalInfisicalConfig
        profileId={activeProfile.id}
        config={activeProfile.infisical_config}
      />
    </div>
  );
}
