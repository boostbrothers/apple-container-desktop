import { useVolumes, usePruneVolumes } from "../../hooks/useVolumes";
import { VolumeRow } from "./VolumeRow";
import { VolumeCreate } from "./VolumeCreate";
import { Button } from "@/components/ui/button";

export function VolumeList() {
  const { data: volumes, isLoading, error } = useVolumes();
  const prune = usePruneVolumes();

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Volumes</h1>
          {volumes && (
            <p className="text-xs text-muted-foreground">{volumes.length} volumes</p>
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
      <div className="mb-4"><VolumeCreate /></div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {error && <p className="text-sm text-destructive">Failed to load volumes.</p>}
      <div className="flex flex-col gap-2">
        {volumes?.map((volume) => <VolumeRow key={volume.name} volume={volume} />)}
        {volumes?.length === 0 && !isLoading && <p className="text-sm text-muted-foreground">No volumes found.</p>}
      </div>
    </div>
  );
}
