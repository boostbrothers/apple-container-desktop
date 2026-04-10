import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { KeyValueTable } from "./KeyValueTable";
import type { DevcontainerSourceType } from "../../types";

interface GeneralTabProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function GeneralTab({ config, onChange }: GeneralTabProps) {
  const sourceType: DevcontainerSourceType =
    config.build && typeof config.build === "object" ? "dockerfile" : "image";

  const build = (config.build as Record<string, unknown>) || {};

  const setField = (key: string, value: unknown) => {
    if (value === "" || value === undefined) {
      const next = { ...config };
      delete next[key];
      onChange(next);
    } else {
      onChange({ ...config, [key]: value });
    }
  };

  const setBuildField = (key: string, value: unknown) => {
    const nextBuild = { ...build };
    if (value === "" || value === undefined) {
      delete nextBuild[key];
    } else {
      nextBuild[key] = value;
    }
    if (Object.keys(nextBuild).length === 0) {
      const next = { ...config };
      delete next.build;
      onChange(next);
    } else {
      onChange({ ...config, build: nextBuild });
    }
  };

  const switchSource = (type: DevcontainerSourceType) => {
    const next = { ...config };
    if (type === "image") {
      delete next.build;
      if (!next.image) next.image = "mcr.microsoft.com/devcontainers/base:ubuntu";
    } else {
      delete next.image;
      next.build = { dockerfile: "Dockerfile" };
    }
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {/* Name */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Name</label>
        <Input
          value={(config.name as string) || ""}
          onChange={(e) => setField("name", e.target.value)}
          placeholder="My Dev Container"
          className="h-8 text-sm"
        />
      </div>

      {/* Source Type */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Source</label>
        <div className="flex gap-1">
          <Button variant={sourceType === "image" ? "default" : "outline"} size="sm" onClick={() => switchSource("image")}>
            Image
          </Button>
          <Button variant={sourceType === "dockerfile" ? "default" : "outline"} size="sm" onClick={() => switchSource("dockerfile")}>
            Dockerfile
          </Button>
        </div>
      </div>

      {/* Image fields */}
      {sourceType === "image" && (
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Image</label>
          <Input
            value={(config.image as string) || ""}
            onChange={(e) => setField("image", e.target.value)}
            placeholder="mcr.microsoft.com/devcontainers/base:ubuntu"
            className="h-8 text-sm font-mono"
          />
        </div>
      )}

      {/* Dockerfile fields */}
      {sourceType === "dockerfile" && (
        <>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Dockerfile</label>
            <Input
              value={(build.dockerfile as string) || ""}
              onChange={(e) => setBuildField("dockerfile", e.target.value)}
              placeholder="Dockerfile"
              className="h-8 text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Context</label>
            <Input
              value={(build.context as string) || ""}
              onChange={(e) => setBuildField("context", e.target.value)}
              placeholder="."
              className="h-8 text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Target</label>
            <Input
              value={(build.target as string) || ""}
              onChange={(e) => setBuildField("target", e.target.value)}
              placeholder="(optional)"
              className="h-8 text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Build Args</label>
            <KeyValueTable
              entries={(build.args as Record<string, string>) || {}}
              onChange={(args) => setBuildField("args", Object.keys(args).length > 0 ? args : undefined)}
              keyPlaceholder="ARG_NAME"
              valuePlaceholder="value"
            />
          </div>
        </>
      )}

      {/* Common fields */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Workspace Folder</label>
        <Input
          value={(config.workspaceFolder as string) || ""}
          onChange={(e) => setField("workspaceFolder", e.target.value)}
          placeholder="/workspaces/project"
          className="h-8 text-sm font-mono"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Remote User</label>
        <Input
          value={(config.remoteUser as string) || ""}
          onChange={(e) => setField("remoteUser", e.target.value)}
          placeholder="vscode"
          className="h-8 text-sm"
        />
      </div>

      {/* Shutdown Action */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Shutdown Action</label>
        <div className="flex gap-1">
          {(["none", "stopContainer"] as const).map((val) => (
            <Button
              key={val}
              variant={(config.shutdownAction || "stopContainer") === val ? "default" : "outline"}
              size="sm"
              onClick={() => setField("shutdownAction", val === "stopContainer" ? undefined : val)}
            >
              {val}
            </Button>
          ))}
        </div>
      </div>

      {/* Override Command */}
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground">Override Command</label>
        <button
          type="button"
          role="switch"
          aria-checked={config.overrideCommand !== false}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            config.overrideCommand !== false ? "bg-primary" : "bg-muted"
          }`}
          onClick={() => setField("overrideCommand", config.overrideCommand === false ? undefined : false)}
        >
          <span
            className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
              config.overrideCommand !== false ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
