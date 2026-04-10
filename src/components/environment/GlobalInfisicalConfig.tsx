import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, CheckCircle, XCircle, RefreshCw } from "lucide-react";
import type { InfisicalConfig as InfisicalConfigType } from "../../types";
import {
  useCheckInfisicalInstalled,
} from "../../hooks/useEnvSecrets";
import {
  useConfigureProfileInfisical,
  useSyncProfileInfisical,
  useTestProfileInfisical,
} from "../../hooks/useEnvStore";

interface GlobalInfisicalConfigProps {
  profileId: string;
  config: InfisicalConfigType | null;
}

export function GlobalInfisicalConfig({ profileId, config }: GlobalInfisicalConfigProps) {
  const { data: isInstalled } = useCheckInfisicalInstalled();
  const configureInfisical = useConfigureProfileInfisical();
  const syncInfisical = useSyncProfileInfisical();
  const testConnection = useTestProfileInfisical();

  const [projectIdInput, setProjectIdInput] = useState(config?.project_id ?? "");
  const [environment, setEnvironment] = useState(config?.environment ?? "dev");
  const [secretPath, setSecretPath] = useState(config?.secret_path ?? "/");
  const [autoSync, setAutoSync] = useState(config?.auto_sync ?? false);
  const [token, setToken] = useState(config?.token ?? "");

  useEffect(() => {
    setProjectIdInput(config?.project_id ?? "");
    setEnvironment(config?.environment ?? "dev");
    setSecretPath(config?.secret_path ?? "/");
    setAutoSync(config?.auto_sync ?? false);
    setToken(config?.token ?? "");
  }, [config]);

  const buildConfig = (): InfisicalConfigType => ({
    project_id: projectIdInput,
    environment,
    secret_path: secretPath,
    auto_sync: autoSync,
    profile_mapping: {},
    token: token || null,
  });

  const handleSave = () => {
    configureInfisical.mutate({ profileId, config: buildConfig() });
  };

  const saveAndThen = (action: () => void) => {
    configureInfisical.mutate(
      { profileId, config: buildConfig() },
      { onSuccess: () => action() }
    );
  };

  const handleSync = () => {
    saveAndThen(() => syncInfisical.mutate(profileId));
  };

  const handleTest = () => {
    saveAndThen(() => testConnection.mutate(profileId));
  };

  if (isInstalled === false) {
    return (
      <div className="rounded-md bg-muted/20 px-3 py-2">
        <p className="text-xs text-muted-foreground">
          Infisical CLI not found. Install it to enable secret syncing.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3 border-t pt-3">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold">Infisical</h4>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px]"
            onClick={handleTest}
            disabled={testConnection.isPending || !projectIdInput}
          >
            {testConnection.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : testConnection.data === true ? (
              <CheckCircle className="h-3 w-3 text-green-500 mr-1" />
            ) : testConnection.data === false ? (
              <XCircle className="h-3 w-3 text-destructive mr-1" />
            ) : null}
            Test
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-6 text-[10px]"
            onClick={handleSync}
            disabled={syncInfisical.isPending || !projectIdInput}
          >
            {syncInfisical.isPending ? (
              <Loader2 className="h-3 w-3 animate-spin mr-1" />
            ) : (
              <RefreshCw className="h-3 w-3 mr-1" />
            )}
            Sync Now
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="text-[10px] text-muted-foreground">Project ID</label>
          <Input
            value={projectIdInput}
            onChange={(e) => setProjectIdInput(e.target.value)}
            className="h-7 text-xs font-mono"
            placeholder="infisical project id"
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Environment</label>
          <Input
            value={environment}
            onChange={(e) => setEnvironment(e.target.value)}
            className="h-7 text-xs font-mono"
            placeholder="dev"
          />
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground">Secret Path</label>
          <Input
            value={secretPath}
            onChange={(e) => setSecretPath(e.target.value)}
            className="h-7 text-xs font-mono"
            placeholder="/"
          />
        </div>
        <div className="flex items-end">
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => setAutoSync(e.target.checked)}
              className="rounded"
            />
            Auto-sync on start
          </label>
        </div>
      </div>

      <div>
        <label className="text-[10px] text-muted-foreground">Service Token</label>
        <Input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className="h-7 text-xs font-mono"
          placeholder="st.xxx... (Service Token or Machine Identity Access Token)"
        />
      </div>

      <Button
        variant="outline"
        size="sm"
        className="w-full h-7 text-xs"
        onClick={handleSave}
        disabled={configureInfisical.isPending || !projectIdInput}
      >
        Save Infisical Config
      </Button>
    </div>
  );
}
