import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Eye, EyeOff, Lock, Pencil, Check } from "lucide-react";
import type { EnvVarEntry } from "../../types";
import { useSetEnvVar, useRemoveEnvVar } from "../../hooks/useEnvSecrets";

interface EnvVarTableProps {
  projectId: string;
  envVars: EnvVarEntry[];
  activeProfile: string;
}

export function EnvVarTable({ projectId, envVars, activeProfile }: EnvVarTableProps) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");
  const [newSecret, setNewSecret] = useState(false);
  const [revealedKeys, setRevealedKeys] = useState<Set<string>>(new Set());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const setEnvVar = useSetEnvVar();
  const removeEnvVar = useRemoveEnvVar();

  const profileVars = envVars
    .filter((v) => v.profile === activeProfile)
    .sort((a, b) => a.key.localeCompare(b.key));

  const handleAdd = () => {
    if (!newKey.trim()) return;
    setEnvVar.mutate({
      projectId,
      entry: {
        key: newKey.trim(),
        value: newValue,
        source: "manual",
        secret: newSecret,
        profile: activeProfile,
      },
    });
    setNewKey("");
    setNewValue("");
    setNewSecret(false);
  };

  const handleRemove = (key: string) => {
    removeEnvVar.mutate({ projectId, key, profile: activeProfile });
  };

  const startEdit = (v: { key: string; value: string }) => {
    setEditingKey(v.key);
    setEditValue(v.value);
  };

  const saveEdit = (key: string, secret: boolean) => {
    setEnvVar.mutate({
      projectId,
      entry: {
        key,
        value: editValue,
        source: "manual",
        secret,
        profile: activeProfile,
      },
    });
    setEditingKey(null);
  };

  const cancelEdit = () => {
    setEditingKey(null);
  };

  const toggleReveal = (key: string) => {
    setRevealedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const sourceColor = (source: string) => {
    switch (source) {
      case "infisical":
        return "bg-green-500/10 text-green-400 border-green-500/20";
      case "command":
        return "bg-orange-500/10 text-orange-400 border-orange-500/20";
      case "dotenv":
        return "bg-blue-500/10 text-blue-400 border-blue-500/20";
      default:
        return "";
    }
  };

  return (
    <div className="space-y-1">
      {profileVars.length > 0 && (
        <div className="space-y-1 max-h-64 overflow-y-auto">
          {profileVars.map((v) => (
            <div
              key={v.key}
              className={`flex items-center gap-2 rounded-md px-2 py-1 ${
                v.secret
                  ? "bg-amber-500/5 border border-amber-500/10"
                  : "bg-muted/20"
              }`}
            >
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
                      if (e.key === "Enter") saveEdit(v.key, v.secret);
                      if (e.key === "Escape") cancelEdit();
                    }}
                    autoFocus
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={() => saveEdit(v.key, v.secret)}
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
                    {v.secret && !revealedKeys.has(v.key) ? "••••••••" : v.value}
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
              {v.source === "manual" && editingKey !== v.key && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0"
                  onClick={() => startEdit(v)}
                  title="Edit"
                >
                  <Pencil className="h-3 w-3" />
                </Button>
              )}
              {v.source !== "command" && editingKey !== v.key && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-5 w-5 shrink-0"
                  onClick={() => handleRemove(v.key)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {profileVars.some((v) => v.source === "command") && (
        <p className="text-[10px] text-orange-400/80">
          Command-sourced vars are previews only. Fresh values are fetched on each start.
        </p>
      )}

      {/* Add new env var */}
      <div className="flex items-center gap-2">
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
          className="h-7 w-7 shrink-0"
          onClick={() => setNewSecret(!newSecret)}
          title={newSecret ? "Secret (will use Compose secrets)" : "Not a secret"}
        >
          <Lock className="h-3.5 w-3.5" />
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
