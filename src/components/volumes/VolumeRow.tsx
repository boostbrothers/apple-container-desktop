import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Volume } from "../../types";
import { useRemoveVolume } from "../../hooks/useVolumes";

interface VolumeRowProps {
  volume: Volume;
}

export function VolumeRow({ volume }: VolumeRowProps) {
  const remove = useRemoveVolume();

  return (
    <div className="glass-card flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{volume.name}</span>
          <Badge variant="outline" className="text-xs">{volume.driver}</Badge>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span>{volume.scope}</span>
          {volume.size && volume.size !== "N/A" && <span>{volume.size}</span>}
          <span className="truncate">{volume.mountpoint}</span>
        </div>
      </div>
      <Button
        variant="ghost"
        size="sm"
        className="text-destructive"
        onClick={() => remove.mutate(volume.name)}
        disabled={remove.isPending}
      >
        Remove
      </Button>
    </div>
  );
}
