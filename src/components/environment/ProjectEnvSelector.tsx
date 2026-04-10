import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, Check, Lock, Search } from "lucide-react";
import type { Project, ProjectEnvBinding } from "../../types";
import { useEnvProfiles, useResolvedEnvVars } from "../../hooks/useEnvStore";
import { api } from "../../lib/tauri";
import { useQueryClient } from "@tanstack/react-query";

interface ProjectEnvSelectorProps {
  project: Project;
}

export function ProjectEnvSelector({ project }: ProjectEnvSelectorProps) {
  const { data: profiles } = useEnvProfiles();
  const queryClient = useQueryClient();
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);
  const [search, setSearch] = useState("");

  // Local optimistic state for immediate UI feedback
  const [localBinding, setLocalBinding] = useState<ProjectEnvBinding>(project.env_binding);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Sync from server when project prop changes (after query refetch)
  useEffect(() => {
    setLocalBinding(project.env_binding);
  }, [project.env_binding]);

  const selectedProfile = profiles?.find((p) => p.id === localBinding.profile_id);
  const { data: resolvedVars } = useResolvedEnvVars(localBinding.profile_id ?? null);

  const updateBinding = (newBinding: Partial<ProjectEnvBinding>) => {
    const merged = { ...localBinding, ...newBinding };
    setLocalBinding(merged); // Optimistic update

    // Debounce backend save
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      const updated = { ...project, env_binding: merged };
      const { status, container_ids, ...projectData } = updated;
      await api.updateProject(projectData);
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    }, 300);
  };

  const isKeySelected = (key: string) => {
    if (localBinding.select_all) {
      return !localBinding.excluded_keys.includes(key);
    }
    return localBinding.selected_keys.includes(key);
  };

  const toggleKey = (key: string) => {
    if (localBinding.select_all) {
      const excluded = localBinding.excluded_keys.includes(key)
        ? localBinding.excluded_keys.filter((k) => k !== key)
        : [...localBinding.excluded_keys, key];
      updateBinding({ excluded_keys: excluded });
    } else {
      const selected = localBinding.selected_keys.includes(key)
        ? localBinding.selected_keys.filter((k) => k !== key)
        : [...localBinding.selected_keys, key];
      updateBinding({ selected_keys: selected });
    }
  };

  const toggleSelectAll = () => {
    updateBinding({
      select_all: !localBinding.select_all,
      selected_keys: [],
      excluded_keys: [],
    });
  };

  const selectedCount = resolvedVars
    ? resolvedVars.filter((v) => isKeySelected(v.key)).length
    : 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold">Environment Variables</h4>
        {selectedProfile && (
          <Badge variant="outline" className="text-[9px]">
            {selectedCount} / {resolvedVars?.length ?? 0} selected
          </Badge>
        )}
      </div>

      {/* Profile selector */}
      <div className="flex items-center gap-2">
        <span className="text-[10px] text-muted-foreground">Global Profile:</span>
        <div className="relative">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs min-w-[120px] justify-between"
            onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
          >
            {selectedProfile?.name ?? "None"}
            <ChevronDown className="h-3 w-3 ml-1" />
          </Button>
          {profileDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 z-50 w-48 rounded-md border bg-popover p-1 shadow-md">
              <div
                className="rounded-sm px-2 py-1.5 text-xs cursor-pointer hover:bg-accent"
                onClick={() => {
                  updateBinding({ profile_id: null, selected_keys: [], excluded_keys: [] });
                  setProfileDropdownOpen(false);
                }}
              >
                None
              </div>
              {profiles?.map((p) => (
                <div
                  key={p.id}
                  className={`flex items-center justify-between rounded-sm px-2 py-1.5 text-xs cursor-pointer hover:bg-accent ${
                    p.id === localBinding.profile_id ? "bg-accent" : ""
                  }`}
                  onClick={() => {
                    updateBinding({ profile_id: p.id, selected_keys: [], excluded_keys: [] });
                    setProfileDropdownOpen(false);
                  }}
                >
                  <span>{p.name}</span>
                  <Badge variant="outline" className="text-[9px] px-1">
                    {p.env_vars.filter((v) => v.enabled).length}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Search + Select all toggle + var list */}
      {selectedProfile && resolvedVars && resolvedVars.length > 0 && (
        <>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search variables..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-7 text-xs pl-7"
            />
          </div>

          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-xs cursor-pointer">
              <input
                type="checkbox"
                checked={localBinding.select_all}
                onChange={toggleSelectAll}
                className="rounded"
              />
              Select all
            </label>
          </div>

          <div className="space-y-1 max-h-48 overflow-y-auto">
            {resolvedVars.filter((v) =>
              !search || v.key.toLowerCase().includes(search.toLowerCase())
            ).map((v) => (
              <div
                key={v.key}
                className={`flex items-center gap-2 rounded-md px-2 py-1 cursor-pointer hover:bg-muted/30 ${
                  isKeySelected(v.key)
                    ? "bg-muted/20"
                    : "opacity-40"
                }`}
                onClick={() => toggleKey(v.key)}
              >
                <div className={`h-4 w-4 rounded border flex items-center justify-center shrink-0 ${
                  isKeySelected(v.key)
                    ? "bg-primary border-primary"
                    : "border-muted-foreground"
                }`}>
                  {isKeySelected(v.key) && <Check className="h-3 w-3 text-primary-foreground" />}
                </div>
                {v.secret && <Lock className="h-3 w-3 text-amber-400 shrink-0" />}
                <code className="text-[11px] font-mono truncate">
                  {v.key}
                </code>
                <Badge variant="outline" className="text-[9px] px-1 ml-auto shrink-0">
                  {v.source}
                </Badge>
              </div>
            ))}
          </div>
        </>
      )}

      {localBinding.profile_id && resolvedVars && resolvedVars.length === 0 && (
        <p className="text-[10px] text-muted-foreground">
          No enabled env vars in this profile. Go to Environment page to add some.
        </p>
      )}

      {!localBinding.profile_id && (
        <p className="text-[10px] text-muted-foreground">
          Select a global profile to inject environment variables into this project's containers.
        </p>
      )}
    </div>
  );
}
