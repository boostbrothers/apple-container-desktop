import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface LifecycleTabProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

const LIFECYCLE_COMMANDS = [
  { key: "initializeCommand", label: "Initialize Command", description: "Runs on the host before container creation." },
  { key: "onCreateCommand", label: "On Create Command", description: "Runs inside container after first creation." },
  { key: "updateContentCommand", label: "Update Content Command", description: "Runs after content update (e.g., git pull)." },
  { key: "postCreateCommand", label: "Post Create Command", description: "Runs after onCreateCommand completes." },
  { key: "postStartCommand", label: "Post Start Command", description: "Runs each time the container starts." },
  { key: "postAttachCommand", label: "Post Attach Command", description: "Runs each time a tool attaches." },
] as const;

const WAIT_FOR_OPTIONS = [
  "initializeCommand",
  "onCreateCommand",
  "updateContentCommand",
  "postCreateCommand",
  "postStartCommand",
] as const;

export function LifecycleTab({ config, onChange }: LifecycleTabProps) {
  const setField = (key: string, value: unknown) => {
    if (value === "" || value === undefined) {
      const next = { ...config };
      delete next[key];
      onChange(next);
    } else {
      onChange({ ...config, [key]: value });
    }
  };

  return (
    <div className="space-y-4">
      {LIFECYCLE_COMMANDS.map(({ key, label, description }) => (
        <div key={key}>
          <label className="text-xs font-medium block mb-0.5">{label}</label>
          <p className="text-[10px] text-muted-foreground mb-1">{description}</p>
          <Input
            value={(config[key] as string) || ""}
            onChange={(e) => setField(key, e.target.value)}
            placeholder="e.g., npm install"
            className="h-8 text-sm font-mono"
          />
        </div>
      ))}

      {/* waitFor */}
      <div>
        <label className="text-xs font-medium block mb-0.5">Wait For</label>
        <p className="text-[10px] text-muted-foreground mb-1">
          Which lifecycle step to complete before showing UI.
        </p>
        <div className="flex gap-1 flex-wrap">
          {WAIT_FOR_OPTIONS.map((val) => (
            <Button
              key={val}
              variant={(config.waitFor || "updateContentCommand") === val ? "default" : "outline"}
              size="sm"
              className="text-[11px]"
              onClick={() => setField("waitFor", val === "updateContentCommand" ? undefined : val)}
            >
              {val.replace("Command", "")}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
