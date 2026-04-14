import { useNetworks, usePruneNetworks } from "../../hooks/useNetworks";
import { NetworkRow } from "./NetworkRow";
import { NetworkCreate } from "./NetworkCreate";
import { Button } from "@/components/ui/button";

export function NetworkList() {
  const { data: networks, isLoading, error } = useNetworks();
  const prune = usePruneNetworks();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Networks</h1>
          {networks && (
            <p className="text-xs text-muted-foreground">{networks.length} networks</p>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="text-destructive"
          onClick={() => prune.mutate()}
          disabled={prune.isPending}
        >
          {prune.isPending ? "Pruning..." : "Prune Unused"}
        </Button>
      </div>
      <div className="mb-4"><NetworkCreate /></div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {error && <p className="text-sm text-destructive">Failed to load networks.</p>}
      <div className="flex flex-col gap-2">
        {networks?.map((network) => <NetworkRow key={network.id} network={network} />)}
        {networks?.length === 0 && !isLoading && <p className="text-sm text-muted-foreground">No networks found.</p>}
      </div>
    </div>
  );
}
