import { useImages, usePruneImages } from "../../hooks/useImages";
import { ImageRow } from "./ImageRow";
import { ImagePull } from "./ImagePull";
import { Button } from "@/components/ui/button";

export function ImageList() {
  const { data: images, isLoading, error } = useImages();
  const prune = usePruneImages();

  const totalSize = images
    ?.map((img) => {
      const match = img.size.match(/([\d.]+)(GB|MB|KB)/);
      if (!match) return 0;
      const val = parseFloat(match[1]);
      if (match[2] === "GB") return val;
      if (match[2] === "MB") return val / 1024;
      return val / 1_048_576;
    })
    .reduce((sum, v) => sum + v, 0);

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold">Images</h1>
          {totalSize !== undefined && (
            <p className="text-xs text-muted-foreground">Total: {totalSize.toFixed(2)} GB ({images?.length} images)</p>
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
      <div className="mb-4"><ImagePull /></div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {error && <p className="text-sm text-destructive">Failed to load images.</p>}
      <div className="flex flex-col gap-2">
        {images?.map((image) => <ImageRow key={image.id} image={image} />)}
        {images?.length === 0 && !isLoading && <p className="text-sm text-muted-foreground">No images found.</p>}
      </div>
    </div>
  );
}
