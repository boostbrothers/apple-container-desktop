import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Trash2 } from "lucide-react";
import { useNetworkSettings, useSaveNetworkSettings } from "@/hooks/useNetworkSettings";

export function NetworkSettingsPanel() {
  const { data: settings, isLoading, error } = useNetworkSettings();
  const saveMutation = useSaveNetworkSettings();

  const [dns, setDns] = useState<string[]>([]);
  const [dnsHosts, setDnsHosts] = useState<{ hostname: string; ip: string }[]>([]);
  const [networkAddress, setNetworkAddress] = useState(false);
  const [networkMode, setNetworkMode] = useState("shared");
  const [gatewayAddress, setGatewayAddress] = useState("");
  const [networkInterface, setNetworkInterface] = useState("en0");
  const [portForwarder, setPortForwarder] = useState("ssh");

  const [newDns, setNewDns] = useState("");
  const [newHostname, setNewHostname] = useState("");
  const [newHostIp, setNewHostIp] = useState("");

  useEffect(() => {
    if (settings) {
      setDns([...settings.dns]);
      setDnsHosts(settings.dns_hosts.map((h) => ({ hostname: h.hostname, ip: h.ip })));
      setNetworkAddress(settings.network_address);
      setNetworkMode(settings.network_mode);
      setGatewayAddress(settings.gateway_address);
      setNetworkInterface(settings.network_interface);
      setPortForwarder(settings.port_forwarder);
    }
  }, [settings]);

  const hasChanges = (() => {
    if (!settings) return false;
    if (networkAddress !== settings.network_address) return true;
    if (networkMode !== settings.network_mode) return true;
    if (gatewayAddress !== settings.gateway_address) return true;
    if (networkInterface !== settings.network_interface) return true;
    if (portForwarder !== settings.port_forwarder) return true;
    if (dns.length !== settings.dns.length) return true;
    for (let i = 0; i < dns.length; i++) {
      if (dns[i] !== settings.dns[i]) return true;
    }
    if (dnsHosts.length !== settings.dns_hosts.length) return true;
    for (let i = 0; i < dnsHosts.length; i++) {
      if (dnsHosts[i].hostname !== settings.dns_hosts[i].hostname) return true;
      if (dnsHosts[i].ip !== settings.dns_hosts[i].ip) return true;
    }
    return false;
  })();

  const handleAddDns = () => {
    const trimmed = newDns.trim();
    if (!trimmed) return;
    setDns([...dns, trimmed]);
    setNewDns("");
  };

  const handleRemoveDns = (index: number) => {
    setDns(dns.filter((_, i) => i !== index));
  };

  const handleAddDnsHost = () => {
    const hostname = newHostname.trim();
    const ip = newHostIp.trim();
    if (!hostname || !ip) return;
    setDnsHosts([...dnsHosts, { hostname, ip }]);
    setNewHostname("");
    setNewHostIp("");
  };

  const handleRemoveDnsHost = (index: number) => {
    setDnsHosts(dnsHosts.filter((_, i) => i !== index));
  };

  const handleSave = () => {
    saveMutation.mutate({
      dns,
      dnsHosts,
      networkAddress,
      networkMode,
      gatewayAddress,
      networkInterface,
      portForwarder,
    });
  };

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Failed to load network settings. Is Colima running?
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-6">
      <h2 className="text-lg font-semibold">DNS & Network Settings</h2>

      <div className="space-y-5">
        {/* DNS Servers */}
        <div className="space-y-2">
          <label className="text-sm font-medium">DNS Servers</label>
          {dns.length === 0 ? (
            <p className="text-xs text-muted-foreground">No DNS servers configured.</p>
          ) : (
            <div className="space-y-2">
              {dns.map((server, index) => (
                <div key={index} className="glass-list-item flex items-center gap-2 p-2">
                  <span className="flex-1 truncate text-sm font-mono">{server}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveDns(index)}
                    disabled={saveMutation.isPending}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              placeholder="e.g. 8.8.8.8"
              value={newDns}
              onChange={(e) => setNewDns(e.target.value)}
              disabled={saveMutation.isPending}
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddDns();
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddDns}
              disabled={!newDns.trim() || saveMutation.isPending}
            >
              Add
            </Button>
          </div>
        </div>

        {/* DNS Host Mappings */}
        <div className="space-y-2">
          <label className="text-sm font-medium">DNS Host Mappings</label>
          {dnsHosts.length === 0 ? (
            <p className="text-xs text-muted-foreground">No host mappings configured.</p>
          ) : (
            <div className="space-y-2">
              {dnsHosts.map((entry, index) => (
                <div key={index} className="glass-list-item flex items-center gap-2 p-2">
                  <span className="flex-1 truncate text-sm font-mono">
                    {entry.hostname} → {entry.ip}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveDnsHost(index)}
                    disabled={saveMutation.isPending}
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2">
            <Input
              placeholder="hostname"
              value={newHostname}
              onChange={(e) => setNewHostname(e.target.value)}
              disabled={saveMutation.isPending}
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddDnsHost();
              }}
            />
            <Input
              placeholder="IP address"
              value={newHostIp}
              onChange={(e) => setNewHostIp(e.target.value)}
              disabled={saveMutation.isPending}
              className="flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleAddDnsHost();
              }}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddDnsHost}
              disabled={!newHostname.trim() || !newHostIp.trim() || saveMutation.isPending}
            >
              Add
            </Button>
          </div>
        </div>

        {/* Network Address */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input
              type="checkbox"
              checked={networkAddress}
              onChange={(e) => setNetworkAddress(e.target.checked)}
              disabled={saveMutation.isPending}
              className="rounded"
            />
            Network Address
          </label>
          <p className="text-xs text-muted-foreground">
            Enable reachable IP address for the VM.
          </p>
        </div>

        {/* Network Mode */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Network Mode</label>
          <div className="flex gap-2">
            {(["shared", "bridged"] as const).map((mode) => (
              <Button
                key={mode}
                variant={networkMode === mode ? "default" : "outline"}
                size="sm"
                onClick={() => setNetworkMode(mode)}
                disabled={saveMutation.isPending}
              >
                {mode}
              </Button>
            ))}
          </div>
        </div>

        {/* Gateway Address */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Gateway Address</label>
          <Input
            placeholder="e.g. 192.168.5.1 (optional)"
            value={gatewayAddress}
            onChange={(e) => setGatewayAddress(e.target.value)}
            disabled={saveMutation.isPending}
          />
        </div>

        {/* Network Interface */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Network Interface</label>
          <Input
            placeholder="e.g. en0"
            value={networkInterface}
            onChange={(e) => setNetworkInterface(e.target.value)}
            disabled={saveMutation.isPending}
          />
        </div>

        {/* Port Forwarder */}
        <div className="space-y-2">
          <label className="text-sm font-medium">Port Forwarder</label>
          <div className="flex gap-2">
            {(["ssh", "grpc", "none"] as const).map((pf) => (
              <Button
                key={pf}
                variant={portForwarder === pf ? "default" : "outline"}
                size="sm"
                onClick={() => setPortForwarder(pf)}
                disabled={saveMutation.isPending}
              >
                {pf}
              </Button>
            ))}
          </div>
        </div>
      </div>

      {/* Save Button */}
      <div className="space-y-2">
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

        {saveMutation.isError && (
          <p className="text-center text-xs text-destructive">
            {saveMutation.error?.message ?? "Failed to save network settings"}
          </p>
        )}

        {saveMutation.isSuccess && (
          <p className="text-center text-xs text-green-600">
            Network settings saved successfully
          </p>
        )}
      </div>
    </div>
  );
}
