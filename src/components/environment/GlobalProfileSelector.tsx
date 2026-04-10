import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ChevronDown, Pencil } from "lucide-react";
import type { EnvProfile } from "../../types";
import {
  useCreateEnvProfile,
  useDeleteEnvProfile,
  useRenameEnvProfile,
} from "../../hooks/useEnvStore";

interface GlobalProfileSelectorProps {
  profiles: EnvProfile[];
  activeProfileId: string;
  onProfileChange: (profileId: string) => void;
}

export function GlobalProfileSelector({
  profiles,
  activeProfileId,
  onProfileChange,
}: GlobalProfileSelectorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const createProfile = useCreateEnvProfile();
  const deleteProfile = useDeleteEnvProfile();
  const renameProfile = useRenameEnvProfile();

  const activeProfile = profiles.find((p) => p.id === activeProfileId);

  const handleCreate = () => {
    if (!newName.trim()) return;
    createProfile.mutate(newName.trim(), {
      onSuccess: (profile) => {
        setNewName("");
        setIsAdding(false);
        onProfileChange(profile.id);
      },
    });
  };

  const handleDelete = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteProfile.mutate(id, {
      onSuccess: () => {
        if (activeProfileId === id && profiles.length > 1) {
          const fallback = profiles.find((p) => p.id !== id);
          if (fallback) onProfileChange(fallback.id);
        }
      },
    });
  };

  const handleRename = (id: string) => {
    if (!editName.trim()) return;
    renameProfile.mutate(
      { profileId: id, newName: editName.trim() },
      { onSuccess: () => setEditingId(null) }
    );
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Profile:</span>
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs min-w-[120px] justify-between"
          onClick={() => setOpen(!open)}
        >
          {activeProfile?.name ?? "Select..."}
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
        {open && (
          <div className="absolute top-full left-0 mt-1 z-50 w-56 rounded-md border bg-popover p-1 shadow-md">
            {profiles.map((p) => (
              <div
                key={p.id}
                className={`flex items-center justify-between rounded-sm px-2 py-1.5 text-xs cursor-pointer hover:bg-accent ${
                  p.id === activeProfileId ? "bg-accent" : ""
                }`}
                onClick={() => {
                  onProfileChange(p.id);
                  setOpen(false);
                }}
              >
                {editingId === p.id ? (
                  <Input
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="h-5 text-xs w-28"
                    onKeyDown={(e) => {
                      if (e.key === "Enter") handleRename(p.id);
                      if (e.key === "Escape") setEditingId(null);
                    }}
                    onClick={(e) => e.stopPropagation()}
                    autoFocus
                  />
                ) : (
                  <span className="flex items-center gap-1.5">
                    {p.name}
                    <Badge variant="outline" className="text-[9px] px-1">
                      {p.env_vars.length}
                    </Badge>
                  </span>
                )}
                <div className="flex items-center gap-0.5">
                  {p.name !== "default" && editingId !== p.id && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 shrink-0"
                        onClick={(e) => {
                          e.stopPropagation();
                          setEditingId(p.id);
                          setEditName(p.name);
                        }}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 shrink-0"
                        onClick={(e) => handleDelete(p.id, e)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {isAdding ? (
        <div className="flex items-center gap-1">
          <Input
            placeholder="Profile name"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            className="h-7 text-xs w-28"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleCreate();
              if (e.key === "Escape") setIsAdding(false);
            }}
            autoFocus
          />
          <Button variant="outline" size="icon" className="h-7 w-7" onClick={handleCreate}>
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      ) : (
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setIsAdding(true)}>
          <Plus className="h-3 w-3 mr-1" />
          New
        </Button>
      )}
    </div>
  );
}
