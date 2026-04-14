import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Globe } from "lucide-react";
import { useDomainConfig, useDomainSetConfig, useDomainStatus, useDomainSetup, useDomainTeardown } from "../../hooks/useDomains";
import type { DomainConfig } from "../../types";

export function ContainerDomainsSettings() {
  const { data: config, isLoading, error } = useDomainConfig();
  const saveMutation = useDomainSetConfig();

  const [enabled, setEnabled] = useState(false);
  const [autoRegister, setAutoRegister] = useState(true);
  const [domainSuffix, setDomainSuffix] = useState("container.local");

  useEffect(() => {
    if (config) {
      setEnabled(config.enabled);
      setAutoRegister(config.auto_register);
      setDomainSuffix(config.domain_suffix || "container.local");
    }
  }, [config]);

  const hasChanges = (() => {
    if (!config) return false;
    return (
      enabled !== config.enabled ||
      autoRegister !== config.auto_register ||
      domainSuffix !== (config.domain_suffix || "container.local")
    );
  })();

  const handleSave = () => {
    if (!config) return;
    const updated: DomainConfig = {
      ...config,
      enabled,
      auto_register: autoRegister,
      domain_suffix: domainSuffix,
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
        Access containers via <code className="text-xs">http://name.container.local</code> without
        port numbers. Uses built-in DNS with Apple Container.
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

        <div className="space-y-1.5">
          <label className="text-sm font-medium">Domain Suffix</label>
          <Input
            value={domainSuffix}
            onChange={(e) => setDomainSuffix(e.target.value)}
            disabled={saveMutation.isPending || !enabled}
            placeholder="container.local"
            className="font-mono text-sm"
          />
          <p className="text-[10px] text-muted-foreground">
            Containers will be accessible at <code className="text-[10px]">name.{domainSuffix}</code>
          </p>
        </div>

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

      {enabled && <DnsSection domainSuffix={domainSuffix} />}
    </div>
  );
}

function DnsSection({ domainSuffix }: { domainSuffix: string }) {
  const { data: status } = useDomainStatus();
  const setupMutation = useDomainSetup();
  const teardownMutation = useDomainTeardown();

  const hasDns = status?.dns_domains && status.dns_domains.length > 0;

  return (
    <div className="space-y-4 border-t border-[var(--glass-border)] pt-4">
      {/* DNS Status */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${hasDns ? "bg-emerald-500" : "bg-muted-foreground/30"}`} />
            <span className="text-sm font-medium">DNS</span>
          </div>
          <div className="flex gap-1">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setupMutation.mutate(domainSuffix)}
              disabled={setupMutation.isPending || teardownMutation.isPending}
            >
              {setupMutation.isPending ? "..." : "Setup DNS"}
            </Button>
            {hasDns && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => teardownMutation.mutate(domainSuffix)}
                disabled={setupMutation.isPending || teardownMutation.isPending}
              >
                {teardownMutation.isPending ? "..." : "Remove"}
              </Button>
            )}
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground pl-4">
          {hasDns
            ? `DNS configured for: ${status?.dns_domains.join(", ")}`
            : "Set up DNS to resolve container domains locally (requires admin password)"}
        </p>
      </div>

      {setupMutation.isError && (
        <p className="text-xs text-destructive">
          {setupMutation.error instanceof Error
            ? setupMutation.error.message
            : "Failed to setup DNS"}
        </p>
      )}
      {teardownMutation.isError && (
        <p className="text-xs text-destructive">
          {teardownMutation.error instanceof Error
            ? teardownMutation.error.message
            : "Failed to teardown DNS"}
        </p>
      )}
    </div>
  );
}
