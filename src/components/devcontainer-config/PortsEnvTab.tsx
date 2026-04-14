import { KeyValueTable } from "./KeyValueTable";

interface PortsEnvTabProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function PortsEnvTab({ config, onChange }: PortsEnvTabProps) {
  const containerEnv = (config.containerEnv as Record<string, string>) || {};
  const remoteEnv = (config.remoteEnv as Record<string, string>) || {};

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

  return (
    <div className="space-y-6">
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
