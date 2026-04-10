import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";

interface KeyValueTableProps {
  entries: Record<string, string>;
  onChange: (entries: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  readOnly?: boolean;
}

export function KeyValueTable({
  entries,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  readOnly = false,
}: KeyValueTableProps) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const pairs = Object.entries(entries);

  const handleAdd = () => {
    const key = newKey.trim();
    if (!key) return;
    onChange({ ...entries, [key]: newValue });
    setNewKey("");
    setNewValue("");
  };

  const handleRemove = (key: string) => {
    const next = { ...entries };
    delete next[key];
    onChange(next);
  };

  const handleValueChange = (key: string, value: string) => {
    onChange({ ...entries, [key]: value });
  };

  return (
    <div className="space-y-1.5">
      {pairs.map(([key, value]) => (
        <div key={key} className="flex items-center gap-2">
          <Input value={key} readOnly className="flex-1 font-mono text-xs h-8 bg-muted/30" />
          <Input
            value={value}
            onChange={(e) => handleValueChange(key, e.target.value)}
            readOnly={readOnly}
            className="flex-1 font-mono text-xs h-8"
          />
          {!readOnly && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => handleRemove(key)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}
      {!readOnly && (
        <div className="flex items-center gap-2">
          <Input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder={keyPlaceholder}
            className="flex-1 font-mono text-xs h-8"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder={valuePlaceholder}
            className="flex-1 font-mono text-xs h-8"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleAdd}
            disabled={!newKey.trim()}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
      {pairs.length === 0 && readOnly && (
        <p className="text-xs text-muted-foreground">No entries.</p>
      )}
    </div>
  );
}
