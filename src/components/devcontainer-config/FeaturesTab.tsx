import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { KeyValueTable } from "./KeyValueTable";

interface FeaturesTabProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function FeaturesTab({ config, onChange }: FeaturesTabProps) {
  const features = (config.features as Record<string, Record<string, string>>) || {};
  const [newFeatureId, setNewFeatureId] = useState("");
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);

  const setFeatures = (next: Record<string, unknown>) => {
    if (Object.keys(next).length === 0) {
      const updated = { ...config };
      delete updated.features;
      onChange(updated);
    } else {
      onChange({ ...config, features: next });
    }
  };

  const handleAdd = () => {
    const id = newFeatureId.trim();
    if (!id) return;
    setFeatures({ ...features, [id]: {} });
    setNewFeatureId("");
    setExpandedFeature(id);
  };

  const handleRemove = (id: string) => {
    const next = { ...features };
    delete next[id];
    setFeatures(next);
    if (expandedFeature === id) setExpandedFeature(null);
  };

  const handleOptionsChange = (id: string, options: Record<string, string>) => {
    setFeatures({
      ...features,
      [id]: Object.keys(options).length > 0 ? options : {},
    });
  };

  const featureEntries = Object.entries(features);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Add dev container features by their ID (e.g., ghcr.io/devcontainers/features/node:1).
      </p>

      {featureEntries.map(([id, options]) => (
        <div key={id} className="glass-card overflow-hidden">
          <div
            className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[var(--glass-bg-hover)] transition-all"
            onClick={() => setExpandedFeature(expandedFeature === id ? null : id)}
          >
            {expandedFeature === id ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <span className="text-xs font-mono truncate flex-1">{id}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(id);
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          {expandedFeature === id && (
            <div className="border-t border-[var(--glass-border)] px-3 py-2">
              <label className="text-[10px] uppercase text-muted-foreground block mb-1">Options</label>
              <KeyValueTable
                entries={(options as Record<string, string>) || {}}
                onChange={(opts) => handleOptionsChange(id, opts)}
                keyPlaceholder="option"
                valuePlaceholder="value"
              />
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2">
        <Input
          value={newFeatureId}
          onChange={(e) => setNewFeatureId(e.target.value)}
          placeholder="ghcr.io/devcontainers/features/node:1"
          className="flex-1 font-mono text-xs h-8"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleAdd}
          disabled={!newFeatureId.trim()}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {featureEntries.length === 0 && (
        <p className="text-xs text-muted-foreground">No features added.</p>
      )}
    </div>
  );
}
