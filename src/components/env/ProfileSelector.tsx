import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, ChevronDown } from "lucide-react";
import { useCreateProfile, useDeleteProfile, useSwitchProfile } from "../../hooks/useEnvSecrets";

interface ProfileSelectorProps {
  projectId: string;
  activeProfile: string;
  profiles: string[];
}

export function ProfileSelector({ projectId, activeProfile, profiles }: ProfileSelectorProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newName, setNewName] = useState("");
  const [open, setOpen] = useState(false);
  const createProfile = useCreateProfile();
  const deleteProfile = useDeleteProfile();
  const switchProfile = useSwitchProfile();

  const handleCreate = () => {
    if (!newName.trim()) return;
    createProfile.mutate(
      { projectId, profileName: newName.trim() },
      {
        onSuccess: () => {
          setNewName("");
          setIsAdding(false);
        },
      }
    );
  };

  const handleSwitch = (name: string) => {
    if (name === activeProfile) return;
    switchProfile.mutate({ projectId, profileName: name });
    setOpen(false);
  };

  const handleDelete = (name: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteProfile.mutate({ projectId, profileName: name });
  };

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-muted-foreground">Profile:</span>
      <div className="relative">
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs min-w-[100px] justify-between"
          onClick={() => setOpen(!open)}
        >
          {activeProfile}
          <ChevronDown className="h-3 w-3 ml-1" />
        </Button>
        {open && (
          <div className="absolute top-full left-0 mt-1 z-50 w-48 rounded-md border bg-popover p-1 shadow-md">
            {profiles.map((p) => (
              <div
                key={p}
                className={`flex items-center justify-between rounded-sm px-2 py-1.5 text-xs cursor-pointer hover:bg-accent ${
                  p === activeProfile ? "bg-accent" : ""
                }`}
                onClick={() => handleSwitch(p)}
              >
                <span>{p}</span>
                {p !== "default" && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 shrink-0"
                    onClick={(e) => handleDelete(p, e)}
                  >
                    <Trash2 className="h-3 w-3" />
                  </Button>
                )}
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
