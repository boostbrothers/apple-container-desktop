import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Network } from "../../types";
import { useRemoveNetwork } from "../../hooks/useNetworks";

interface NetworkRowProps {
  network: Network;
}

const DEFAULT_NETWORKS = ["bridge", "host", "none"];

export function NetworkRow({ network }: NetworkRowProps) {
  const remove = useRemoveNetwork();
  const isDefault = DEFAULT_NETWORKS.includes(network.name);

  return (
    <div className="glass-card flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{network.name}</span>
          <Badge variant="outline" className="text-xs">{network.driver}</Badge>
          {network.internal && <Badge variant="secondary" className="text-xs">Internal</Badge>}
          {network.ipv6 && <Badge variant="secondary" className="text-xs">IPv6</Badge>}
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span>{network.scope}</span>
          <span>{network.id.slice(0, 12)}</span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive"
        onClick={() => remove.mutate(network.id)}
        disabled={remove.isPending || isDefault}
      >
        Remove
      </Button>
    </div>
  );
}
