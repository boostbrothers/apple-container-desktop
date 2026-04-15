import { useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Eye, EyeOff, Lock, Search, ToggleLeft, ToggleRight, RefreshCw, Pencil, Check } from "lucide-react";
import type { GlobalEnvVar, EnvProfile } from "../../types";
import {
  useAddGlobalEnvVar,
  useRemoveGlobalEnvVar,
  useToggleGlobalEnvVar,
  useReimportDotenv,
} from "../../hooks/useEnvStore";
import { api } from "../../lib/tauri";

interface GlobalEnvVarTableProps {
  profile: EnvProfile;
}

export function GlobalEnvVarTable({ profile }: GlobalEnvVarTableProps) {
  const [search, setSearch] = useState("");
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newSecret, setNewSecret] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Map<string, string>>(new Map());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [editSecret, setEditSecret] = useState(false);
  const addEnvVar = useAddGlobalEnvVar();
  const removeEnvVar = useRemoveGlobalEnvVar();
  const toggleEnvVar = useToggleGlobalEnvVar();
  const reimportDotenv = useReimportDotenv();

  const filteredVars = profile.env_vars
    .filter((v) =>
      !search || v.key.toLowerCase().includes(search.toLowerCase()) || v.value.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) => a.key.localeCompare(b.key));

  // Group vars by key to show conflicts
  const keyGroups = new Map<string, GlobalEnvVar[]>();
  for (const v of filteredVars) {
    const existing = keyGroups.get(v.key) || [];
    existing.push(v);
    keyGroups.set(v.key, existing);
  }

  const handleAdd = () => {
    if (!newKey.trim()) return;
    addEnvVar.mutate({
      profileId: profile.id,
      entry: {
        key: newKey.trim(),
        value: newValue,
        source: "manual",
        secret: newSecret,
        source_file: null,
        enabled: true,
      },
    });
    setNewKey("");
    setNewValue("");
    setNewSecret(false);
  };

  const handleRemove = (key: string, source: string) => {
    removeEnvVar.mutate({ profileId: profile.id, key, source });
  };

  const startEdit = async (v: GlobalEnvVar) => {
    setEditingKey(v.key);
    setEditSecret(v.secret);
    if (v.secret) {
      try {
        const decrypted = await api.decryptGlobalEnvSecret(profile.id, v.key);
        setEditValue(decrypted);
      } catch {
        setEditValue("");
      }
    } else {
      setEditValue(v.value);
    }
  };

  const saveEdit = (key: string) => {
    addEnvVar.mutate({
      profileId: profile.id,
      entry: {
        key,
        value: editValue,
        source: "manual",
        secret: editSecret,
        source_file: null,
        enabled: true,
      },
    });
    setEditingKey(null);
  };

  const cancelEdit = () => {
    setEditingKey(null);
  };

  const handleToggle = (key: string, source: string, enabled: boolean) => {
    toggleEnvVar.mutate({ profileId: profile.id, key, source, enabled });
  };

  const toggleReveal = useCallback(async (key: string) => {
    if (revealedKeys.has(key)) {
      setRevealedKeys((prev) => {
        const next = new Map(prev);
        next.delete(key);
        return next;
      });
    } else {
      try {
        const decrypted = await api.decryptGlobalEnvSecret(profile.id, key);
        setRevealedKeys((prev) => new Map(prev).set(key, decrypted));
      } catch {
        setRevealedKeys((prev) => new Map(prev).set(key, "[decrypt error]"));
      }
    }
  }, [revealedKeys, profile.id]);

  // Collect unique dotenv source files for reimport
  const dotenvSources = [...new Set(
    profile.env_vars
      .filter((v) => v.source === "dotenv" && v.source_file)
      .map((v) => v.source_file!)
  )];

  const sourceColor = (source: string) => {
    switch (source) {
      case "infisical":
        return "bg-green-500/10 text-green-400 border-green-500/20";
      case "dotenv":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-2">
      {/* Search bar */}
      <div className="relative">
        <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
        <Input
          placeholder="Search variables..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="h-7 text-xs pl-7"
        />
      </div>

      {/* Dotenv reimport buttons */}
      {dotenvSources.length > 0 && (
        <div className="flex gap-1 flex-wrap">
          {dotenvSources.map((src) => (
            <Button
              key={src}
              variant="outline"
              size="sm"
              className="h-6 text-[10px]"
              onClick={() => reimportDotenv.mutate({ profileId: profile.id, filePath: src })}
            >
              <RefreshCw className="h-3 w-3 mr-1" />
              Reload {src.split("/").pop()}
            </Button>
          ))}
        </div>
      )}

      {/* Env var list */}
      {filteredVars.length > 0 && (
        <div className="space-y-1 max-h-[calc(100vh-360px)] overflow-y-auto">
          {filteredVars.map((v) => {
            const siblings = keyGroups.get(v.key) || [];
            const hasConflict = siblings.length > 1;

            return (
              <div
                key={`${v.key}-${v.source}`}
                className={`flex items-center gap-2 rounded-md px-2 py-1 ${
                  !v.enabled
                    ? "opacity-40 bg-muted/10"
                    : v.secret
                    ? "bg-amber-500/5 border border-amber-500/10"
                    : "bg-muted/20"
                }`}
              >
                {/* Conflict toggle */}
                {hasConflict && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={() => handleToggle(v.key, v.source, !v.enabled)}
                    title={v.enabled ? "Disable (use another source)" : "Enable (use this source)"}
                  >
                    {v.enabled ? (
                      <ToggleRight className="h-3.5 w-3.5 text-green-500" />
                    ) : (
                      <ToggleLeft className="h-3.5 w-3.5" />
                    )}
                  </Button>
                )}

                {v.secret && <Lock className="h-3 w-3 text-amber-400 shrink-0" />}
                <Badge
                  variant="outline"
                  className={`text-[9px] px-1 shrink-0 ${sourceColor(v.source)}`}
                >
                  {v.source}
                </Badge>

                {/* Inline edit for manual entries */}
                {v.source === "manual" && editingKey === v.key ? (
                  <>
                    <code className="text-[11px] font-mono truncate w-32 shrink-0">{v.key}</code>
                    <Input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="h-6 text-[11px] font-mono flex-1"
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveEdit(v.key);
                        if (e.key === "Escape") cancelEdit();
                      }}
                      autoFocus
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0"
                      onClick={() => saveEdit(v.key)}
                    >
                      <Check className="h-3 w-3 text-green-500" />
                    </Button>
                  </>
                ) : (
                  <>
                    <code className="text-[11px] font-mono truncate w-32 shrink-0">
                      {v.key}
                    </code>
                    <code
                      className={`text-[11px] font-mono truncate flex-1 text-muted-foreground ${v.source === "manual" ? "cursor-pointer hover:text-foreground" : ""}`}
                      onClick={() => v.source === "manual" && startEdit(v)}
                      title={v.source === "manual" ? "Click to edit" : undefined}
                    >
                      {v.secret && !revealedKeys.has(v.key) ? "••••••••" : (revealedKeys.get(v.key) ?? v.value)}
                    </code>
                  </>
                )}

                {v.secret && editingKey !== v.key && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={() => toggleReveal(v.key)}
                  >
                    {revealedKeys.has(v.key) ? (
                      <EyeOff className="h-3 w-3" />
                    ) : (
                      <Eye className="h-3 w-3" />
                    )}
                  </Button>
                )}
                {/* Manual entries: edit + delete; imported entries are read-only */}
                {v.source === "manual" && editingKey !== v.key && (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0"
                      onClick={() => startEdit(v)}
                      title="Edit"
                    >
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-5 w-5 shrink-0"
                      onClick={() => handleRemove(v.key, v.source)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      {filteredVars.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-4">
          No environment variables. Add manually or import from .env / Infisical.
        </p>
      )}

      {/* Add new manual env var */}
      <div className="flex items-center gap-2 pt-1 border-t">
        <Input
          placeholder="KEY"
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          className="h-7 text-xs font-mono flex-1"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Input
          placeholder="VALUE"
          value={newValue}
          onChange={(e) => setNewValue(e.target.value)}
          className="h-7 text-xs font-mono flex-1"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button
          variant={newSecret ? "default" : "outline"}
          size="icon"
          className={`h-7 w-7 shrink-0 ${newSecret ? "bg-amber-500/20 border-amber-500/40 text-amber-400 hover:bg-amber-500/30" : ""}`}
          onClick={() => setNewSecret(!newSecret)}
          title={newSecret ? "Secret (encrypted)" : "Not a secret (click to encrypt)"}
        >
          <Lock className={`h-3.5 w-3.5 ${newSecret ? "text-amber-400" : ""}`} />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7 shrink-0"
          onClick={handleAdd}
          disabled={!newKey.trim()}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}
