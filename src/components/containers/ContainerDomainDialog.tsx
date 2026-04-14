import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { X, Globe, ExternalLink, Copy } from "lucide-react";
import type { ContainerDomainOverride } from "../../types";

const DOMAIN_SUFFIX = "container.local";

interface ContainerDomainDialogProps {
  containerName: string;
  override?: ContainerDomainOverride;
  open: boolean;
  onClose: () => void;
}

export function ContainerDomainDialog({
  containerName,
  override,
  open,
  onClose,
}: ContainerDomainDialogProps) {
  const [enabled, setEnabled] = useState(override?.enabled ?? true);
  const [hostname, setHostname] = useState(override?.hostname ?? "");
  const [port, setPort] = useState(override?.port?.toString() ?? "");

  useEffect(() => {
    if (open) {
      setEnabled(override?.enabled ?? true);
      setHostname(override?.hostname ?? "");
      setPort(override?.port?.toString() ?? "");
    }
  }, [open, override]);

  if (!open) return null;

  const effectiveHostname = hostname || containerName;
  const domain = `${effectiveHostname}.${DOMAIN_SUFFIX}`;
  const url = `http://${domain}`;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="glass-panel rounded-xl p-5 w-[360px] space-y-4 shadow-xl border border-[var(--glass-border)]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4" />
            <h3 className="text-sm font-semibold">Container Domain</h3>
          </div>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onClose}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>

        <div className="rounded-md bg-muted/20 px-3 py-2">
          <code className="text-[11px] font-mono">{containerName}</code>
        </div>

        {/* Enable toggle */}
        <label className="flex items-center justify-between">
          <span className="text-sm">Enable Domain</span>
          <button
            className={`relative h-5 w-9 rounded-full transition-colors ${
              enabled ? "bg-primary" : "bg-muted"
            }`}
            onClick={() => setEnabled(!enabled)}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white transition-transform ${
                enabled ? "translate-x-4" : ""
              }`}
            />
          </button>
        </label>

        {enabled && (
          <>
            {/* Hostname */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">Hostname</label>
              <Input
                value={hostname}
                onChange={(e) => setHostname(e.target.value)}
                placeholder={containerName}
                className="h-8 text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                Domain: <code className="text-[10px]">{domain}</code>
              </p>
            </div>

            {/* Port */}
            <div className="space-y-1.5">
              <label className="text-xs text-muted-foreground">
                Container Port
              </label>
              <Input
                type="number"
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="e.g. 3001, 8080"
                className="h-8 text-xs font-mono"
              />
              <p className="text-[10px] text-muted-foreground">
                The port your app listens on inside the container.
              </p>
            </div>

            {/* Preview URL */}
            <div className="rounded-md bg-muted/20 border border-[var(--glass-border)] px-3 py-2 flex items-center justify-between">
              <code className="text-[11px] font-mono text-muted-foreground">{url}</code>
              <div className="flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => navigator.clipboard.writeText(url)}
                  title="Copy URL"
                >
                  <Copy className="h-3 w-3" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => openUrl(url)}
                  title="Open in browser"
                >
                  <ExternalLink className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </>
        )}

        {/* Actions */}
        <div className="flex gap-2 pt-1">
          <Button size="sm" onClick={onClose} className="flex-1">
            Close
          </Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
