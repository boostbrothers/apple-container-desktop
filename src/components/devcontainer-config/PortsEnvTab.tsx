import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { KeyValueTable } from "./KeyValueTable";

interface PortsEnvTabProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function PortsEnvTab({ config, onChange }: PortsEnvTabProps) {
  const forwardPorts = (config.forwardPorts as (number | string)[]) || [];
  const containerEnv = (config.containerEnv as Record<string, string>) || {};
  const remoteEnv = (config.remoteEnv as Record<string, string>) || {};
  const [newPort, setNewPort] = useState("");

  const setField = (key: string, value: unknown) => {
    if (
      value === undefined ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === "object" && value !== null && Object.keys(value).length === 0)
    ) {
      const next = { ...config };
      delete next[key];
      onChange(next);
    } else {
      onChange({ ...config, [key]: value });
    }
  };

  const handleAddPort = () => {
    const port = newPort.trim();
    if (!port) return;
    // Only treat as number if the entire string is digits
    const value = /^\d+$/.test(port) ? parseInt(port, 10) : port;
    if (typeof value === "number" && (value < 0 || value > 65535)) return;
    if (forwardPorts.some((p) => String(p) === String(value))) return;
    setField("forwardPorts", [...forwardPorts, value]);
    setNewPort("");
  };

  const handleRemovePort = (index: number) => {
    const next = forwardPorts.filter((_, i) => i !== index);
    setField("forwardPorts", next.length > 0 ? next : undefined);
  };

  return (
    <div className="space-y-6">
      {/* Forward Ports */}
      <div>
        <label className="text-xs font-medium block mb-2">Forward Ports</label>
        <div className="space-y-1.5">
          {forwardPorts.map((port, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input value={String(port)} readOnly className="flex-1 font-mono text-xs h-8 bg-muted/30" />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => handleRemovePort(i)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input
              value={newPort}
              onChange={(e) => setNewPort(e.target.value)}
              placeholder="3000 or host:port"
              className="flex-1 font-mono text-xs h-8"
              onKeyDown={(e) => e.key === "Enter" && handleAddPort()}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleAddPort}
              disabled={!newPort.trim()}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Container Env */}
      <div>
        <label className="text-xs font-medium block mb-2">Container Environment Variables</label>
        <p className="text-[10px] text-muted-foreground mb-1.5">
          Set at container creation. Requires rebuild to change.
        </p>
        <KeyValueTable
          entries={containerEnv}
          onChange={(env) => setField("containerEnv", env)}
          keyPlaceholder="ENV_NAME"
          valuePlaceholder="value"
        />
      </div>

      {/* Remote Env */}
      <div>
        <label className="text-xs font-medium block mb-2">Remote Environment Variables</label>
        <p className="text-[10px] text-muted-foreground mb-1.5">
          Set for remote processes. Can be updated without rebuild.
        </p>
        <KeyValueTable
          entries={remoteEnv}
          onChange={(env) => setField("remoteEnv", env)}
          keyPlaceholder="ENV_NAME"
          valuePlaceholder="value"
        />
      </div>
    </div>
  );
}
