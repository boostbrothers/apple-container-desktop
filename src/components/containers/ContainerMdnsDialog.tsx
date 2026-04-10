import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Copy, ExternalLink, Check } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import type { ContainerMdnsOverride, MdnsServiceEntry } from "../../types";
import { useMdnsSetOverride, useMdnsRemoveOverride } from "../../hooks/useMdns";

interface ContainerMdnsDialogProps {
  containerName: string;
  currentOverride: ContainerMdnsOverride | undefined;
  currentService: MdnsServiceEntry | undefined;
  defaultServiceType: string;
  onClose: () => void;
}

export function ContainerMdnsDialog({
  containerName,
  currentOverride,
  currentService,
  defaultServiceType,
  onClose,
}: ContainerMdnsDialogProps) {
  const setOverride = useMdnsSetOverride();
  const removeOverride = useMdnsRemoveOverride();
  const [copied, setCopied] = useState(false);

  const [enabled, setEnabled] = useState(currentOverride?.enabled ?? true);
  const [hostname, setHostname] = useState(currentOverride?.hostname ?? "");
  const [serviceType, setServiceType] = useState(
    currentOverride?.service_type ?? ""
  );
  const [port, setPort] = useState(
    currentOverride?.port?.toString() ?? ""
  );

  useEffect(() => {
    if (currentOverride) {
      setEnabled(currentOverride.enabled);
      setHostname(currentOverride.hostname ?? "");
      setServiceType(currentOverride.service_type ?? "");
      setPort(currentOverride.port?.toString() ?? "");
    }
  }, [currentOverride]);

  const resolvedHostname = currentService?.hostname ?? (hostname.trim() || containerName);
  const resolvedPort = currentService?.port ?? (port.trim() ? parseInt(port, 10) : null);
  const mdnsAddress = resolvedPort ? `${resolvedHostname}.local:${resolvedPort}` : null;
  const mdnsUrl = resolvedPort ? `http://${resolvedHostname}.local:${resolvedPort}` : null;
  const isRegistered = currentService?.registered ?? false;

  const handleCopy = async () => {
    if (!mdnsAddress) return;
    await navigator.clipboard.writeText(mdnsAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleOpen = async () => {
    if (!mdnsUrl) return;
    try {
      await openUrl(mdnsUrl);
    } catch {
      window.open(mdnsUrl, "_blank");
    }
  };

  const handleSave = () => {
    setOverride.mutate(
      {
        containerName,
        overrideConfig: {
          enabled,
          hostname: hostname.trim() || null,
          service_type: serviceType.trim() || null,
          port: port.trim() ? parseInt(port, 10) : null,
        },
      },
      { onSuccess: onClose }
    );
  };

  const handleRemove = () => {
    removeOverride.mutate(containerName, { onSuccess: onClose });
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-md rounded-xl border border-[var(--glass-border)] bg-background/95 backdrop-blur-xl p-6 space-y-4 shadow-xl">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">
            mDNS: {containerName}
          </h3>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {isRegistered && mdnsAddress && (
          <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-emerald-700 dark:text-emerald-400">
                Active mDNS Address
              </span>
              {currentService?.auto_registered && (
                <span className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
                  auto
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm font-mono font-semibold text-emerald-800 dark:text-emerald-300 truncate">
                {mdnsAddress}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={handleCopy}
                title="Copy address"
              >
                {copied ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 shrink-0"
                onClick={handleOpen}
                title="Open in browser"
              >
                <ExternalLink className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        )}

        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => setEnabled(e.target.checked)}
            className="rounded"
          />
          Enable mDNS for this container
        </label>

        <div className="space-y-3">
          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Hostname
            </label>
            <Input
              placeholder={containerName}
              value={hostname}
              onChange={(e) => setHostname(e.target.value)}
              disabled={!enabled}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to use container name
            </p>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Service Type
            </label>
            <Input
              placeholder={defaultServiceType}
              value={serviceType}
              onChange={(e) => setServiceType(e.target.value)}
              disabled={!enabled}
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Port
            </label>
            <Input
              placeholder="Auto-detect"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              type="number"
              disabled={!enabled}
            />
            <p className="text-xs text-muted-foreground">
              Leave empty to auto-detect from exposed ports
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2">
          <Button
            onClick={handleSave}
            disabled={setOverride.isPending}
            className="flex-1"
          >
            {setOverride.isPending ? "Saving..." : "Save"}
          </Button>
          {currentOverride && (
            <Button
              variant="outline"
              onClick={handleRemove}
              disabled={removeOverride.isPending}
              className="text-destructive"
            >
              Remove Override
            </Button>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
