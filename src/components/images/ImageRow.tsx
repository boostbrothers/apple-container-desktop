import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Image } from "../../types";
import { useRemoveImage } from "../../hooks/useImages";

interface ImageRowProps {
  image: Image;
}

export function ImageRow({ image }: ImageRowProps) {
  const remove = useRemoveImage();

  return (
    <div className="glass-card flex items-center gap-3 px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{image.repository}:{image.tag}</span>
          {image.in_use && <Badge variant="outline" className="text-xs">In use</Badge>}
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span>{image.size}</span>
          <span>{image.id.slice(0, 12)}</span>
        </div>
      </div>
      <Button variant="ghost" size="sm" className="text-destructive" onClick={() => remove.mutate(image.id)} disabled={remove.isPending || image.in_use}>
        Remove
      </Button>
    </div>
  );
}
