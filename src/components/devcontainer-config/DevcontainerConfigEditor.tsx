import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, RotateCcw } from "lucide-react";
import { useDevcontainerJsonConfig, useSaveDevcontainerConfig, parseValidationErrors } from "../../hooks/useProjectConfig";
import { GeneralTab } from "./GeneralTab";
import { FeaturesTab } from "./FeaturesTab";
import { PortsEnvTab } from "./PortsEnvTab";
import { LifecycleTab } from "./LifecycleTab";
import { JsonEditorTab } from "./JsonEditorTab";
import type { ConfigTab, DevcontainerValidationError } from "../../types";

interface DevcontainerConfigEditorProps {
  workspacePath: string;
  projectName: string;
  onClose: () => void;
}

const TABS: { key: ConfigTab; label: string }[] = [
  { key: "general", label: "General" },
  { key: "features", label: "Features" },
  { key: "ports-env", label: "Ports & Env" },
  { key: "lifecycle", label: "Lifecycle" },
  { key: "json", label: "JSON" },
];

export function DevcontainerConfigEditor({
  workspacePath,
  projectName,
  onClose,
}: DevcontainerConfigEditorProps) {
  const { data, isLoading, error } = useDevcontainerJsonConfig(workspacePath);
  const saveMutation = useSaveDevcontainerConfig();

  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [originalConfig, setOriginalConfig] = useState<Record<string, unknown>>({});
  const [activeTab, setActiveTab] = useState<ConfigTab>("general");
  const [jsonParseError, setJsonParseError] = useState(false);
  const [saveErrors, setSaveErrors] = useState<DevcontainerValidationError[]>([]);

  // Load config from backend
  useEffect(() => {
    if (data) {
      setConfig(data.config as Record<string, unknown>);
      setOriginalConfig(data.config as Record<string, unknown>);
    }
  }, [data]);

  const isDirty = JSON.stringify(config) !== JSON.stringify(originalConfig);

  const handleSave = () => {
    setSaveErrors([]);
    saveMutation.mutate(
      { workspacePath, config },
      {
        onSuccess: () => {
          setOriginalConfig(config);
        },
        onError: (err) => {
          const validationErrs = parseValidationErrors(err);
          if (validationErrs.length > 0) {
            setSaveErrors(validationErrs);
          }
        },
      },
    );
  };

  const handleReset = () => {
    setConfig(originalConfig);
    setSaveErrors([]);
    setJsonParseError(false);
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground p-4">Loading configuration...</p>;
  }

  if (error) {
    return (
      <div className="p-4 space-y-2">
        <p className="text-sm text-destructive">Failed to load configuration.</p>
        <Button variant="outline" size="sm" onClick={onClose}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-sm font-semibold">{projectName}</h2>
            <p className="text-[10px] text-muted-foreground">devcontainer.json configuration</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {isDirty && (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Reset
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || jsonParseError || saveMutation.isPending}
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            {saveMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-[var(--glass-border)] pb-1">
        {TABS.map(({ key, label }) => (
          <Button
            key={key}
            variant={activeTab === key ? "default" : "ghost"}
            size="sm"
            className="text-xs"
            onClick={() => setActiveTab(key)}
            disabled={key !== "json" && jsonParseError}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-[400px]">
        {activeTab === "general" && <GeneralTab config={config} onChange={setConfig} />}
        {activeTab === "features" && <FeaturesTab config={config} onChange={setConfig} />}
        {activeTab === "ports-env" && <PortsEnvTab config={config} onChange={setConfig} />}
        {activeTab === "lifecycle" && <LifecycleTab config={config} onChange={setConfig} />}
        {activeTab === "json" && (
          <JsonEditorTab config={config} onChange={setConfig} onParseError={setJsonParseError} />
        )}
      </div>

      {/* Save errors */}
      {saveErrors.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-[10px] uppercase text-destructive font-medium mb-1">
            Save Failed — Validation Errors ({saveErrors.length})
          </p>
          {saveErrors.map((err, i) => (
            <p key={i} className="text-xs text-destructive">
              <span className="font-mono">{err.path || "/"}</span>: {err.message}
            </p>
          ))}
        </div>
      )}

      {/* New file indicator */}
      {data && !data.exists && (
        <div className="rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2">
          <p className="text-xs text-blue-400">
            No existing devcontainer.json found. Saving will create <code className="font-mono">.devcontainer/devcontainer.json</code>.
          </p>
        </div>
      )}
    </div>
  );
}
