import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Loader2, Globe } from "lucide-react";
import { useDomainConfig, useDomainSetConfig } from "../../hooks/useDomains";
import { api } from "../../lib/tauri";
import type { DomainConfig, ProxyStatus } from "../../types";

export function ContainerDomainsSettings() {
  const { data: config, isLoading, error } = useDomainConfig();
  const saveMutation = useDomainSetConfig();
  const queryClient = useQueryClient();

  const [enabled, setEnabled] = useState(false);
  const [autoRegister, setAutoRegister] = useState(true);

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setAutoRegister(config.auto_register);
    }
  }, [config]);

  const hasChanges = (() => {
    if (!config) return false;
    return enabled !== config.enabled || autoRegister !== config.auto_register;
  })();

  const handleSave = () => {
    if (!config) return;
    const updated: DomainConfig = {
      ...config,
      enabled,
      auto_register: autoRegister,
    };
    saveMutation.mutate(updated);
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm">
        Failed to load settings
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <div className="flex items-center gap-2">
        <Globe className="h-5 w-5" />
        <h2 className="text-lg font-semibold">Container Domains</h2>
      </div>

      <p className="text-xs text-muted-foreground">
        Access containers via <code className="text-xs">http://name.colima.local</code> without
        port numbers. Built-in DNS server and reverse proxy.
      </p>

      <div className="space-y-4">
        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            disabled={saveMutation.isPending}
            className="rounded"
          />
          Enable Container Domains
        </label>

        <label className="flex items-center gap-2 text-sm font-medium">
          <input
            type="checkbox"
            checked={autoRegister}
            onChange={(e) => setAutoRegister(e.target.checked)}
            disabled={saveMutation.isPending || !enabled}
            className="rounded"
          />
          Auto-register containers with exposed ports
        </label>

        <Button
          onClick={handleSave}
          disabled={!hasChanges || saveMutation.isPending}
          className="w-full"
        >
          {saveMutation.isPending ? (
            <>
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Saving...
            </>
          ) : (
            "Save"
          )}
        </Button>
      </div>

      {enabled && <ProxySection />}
    </div>
  );
}

function ProxySection() {
  const queryClient = useQueryClient();

  const { data: status } = useQuery({
    queryKey: ["proxy-status"],
    queryFn: () => api.proxyGetStatus(),
    refetchInterval: 5000,
  });

  const startProxy = useMutation({
    mutationFn: () => api.proxyStart(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["proxy-status"] }),
  });
  const stopProxy = useMutation({
    mutationFn: () => api.proxyStop(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["proxy-status"] }),
  });
  const installResolver = useMutation({
    mutationFn: () => api.proxyInstallResolver(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["proxy-status"] }),
  });
  const uninstallResolver = useMutation({
    mutationFn: () => api.proxyUninstallResolver(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["proxy-status"] }),
  });

  const running = status?.running ?? false;
  const gwRunning = status?.gateway_running ?? false;
  const resolverInstalled = status?.resolver_installed ?? false;
  const routes = status?.routes ?? [];
  const suffix = status?.domain_suffix ?? "colima.local";

  return (
    <div className="space-y-4 border-t border-[var(--glass-border)] pt-4">
      {/* DNS Resolver */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${resolverInstalled ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
            <span className="text-sm font-medium">DNS Resolver</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              resolverInstalled ? uninstallResolver.mutate() : installResolver.mutate()
            }
            disabled={installResolver.isPending || uninstallResolver.isPending}
          >
            {installResolver.isPending || uninstallResolver.isPending
              ? "..."
              : resolverInstalled
                ? "Remove"
                : "Install"}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground pl-4">
          {resolverInstalled
            ? `✓ /etc/resolver/${suffix} — *.${suffix} resolves locally`
            : `Creates /etc/resolver/${suffix} (one-time admin password)`}
        </p>
      </div>

      {/* Gateway */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${gwRunning ? "bg-emerald-500" : running ? "bg-amber-500" : "bg-muted-foreground/30"}`} />
            <span className="text-sm font-medium">Gateway</span>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => (running ? stopProxy.mutate() : startProxy.mutate())}
            disabled={startProxy.isPending || stopProxy.isPending}
          >
            {startProxy.isPending || stopProxy.isPending ? "..." : running ? "Stop" : "Start"}
          </Button>
        </div>
        <p className="text-[10px] text-muted-foreground pl-4">
          {gwRunning
            ? "✓ DNS :5553 + Traefik gateway :80 — containers routed via Docker network"
            : running
              ? "DNS running, gateway starting..."
              : "Starts DNS server and Traefik gateway container"}
        </p>
      </div>

      {/* Routes */}
      {routes.length > 0 && (
        <div className="glass-card p-3 space-y-1.5">
          <div className="text-xs font-medium mb-1">Active Routes</div>
          {routes.map((r) => (
            <div key={r.domain} className="flex items-center justify-between text-xs">
              <code className="text-[11px]">http://{r.domain}</code>
              <span className="text-muted-foreground">→ {r.container_name}:{r.target_port}</span>
            </div>
          ))}
        </div>
      )}

      {running && routes.length === 0 && (
        <p className="text-[10px] text-muted-foreground">
          No routes. Containers with exposed ports will be registered automatically.
        </p>
      )}

      {installResolver.isError && (
        <p className="text-xs text-destructive">
          {installResolver.error instanceof Error
            ? installResolver.error.message
            : "Failed to install resolver"}
        </p>
      )}
    </div>
  );
}
