import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CpuSlider, MemorySlider } from "@/components/ui/resource-slider";
import { useRunContainer } from "../../hooks/useContainers";
import { useHostInfo } from "@/hooks/useResourceSettings";

export function ContainerRun() {
  const [image, setImage] = useState("");
  const [name, setName] = useState("");
  const [ports, setPorts] = useState("");
  const [cpus, setCpus] = useState("");
  const [memory, setMemory] = useState("");
  const [expanded, setExpanded] = useState(false);
  const run = useRunContainer();
  const { data: hostInfo } = useHostInfo();

  const handleRun = () => {
    if (!image.trim()) return;
    run.mutate({
      image: image.trim(),
      name: name.trim() || undefined,
      ports: ports.trim() || undefined,
      cpus: cpus.trim() || undefined,
      memory: memory.trim() || undefined,
    });
    setImage("");
    setName("");
    setPorts("");
    setCpus("");
    setMemory("");
    setExpanded(false);
  };

  if (!expanded) {
    return (
      <Button variant="outline" size="sm" onClick={() => setExpanded(true)}>
        Run Container
      </Button>
    );
  }

  return (
    <div className="glass-section p-3 space-y-2">
      <div className="flex gap-2">
        <Input
          placeholder="Image (e.g. nginx:alpine)"
          value={image}
          onChange={(e) => setImage(e.target.value)}
          className="flex-1"
        />
        <Input
          placeholder="Name (optional)"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-40"
        />
      </div>
      <Input
        placeholder="Ports (e.g. 8080:80, 3000:3000)"
        value={ports}
        onChange={(e) => setPorts(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && handleRun()}
      />
      <div className="grid grid-cols-2 gap-4 pt-1">
        <CpuSlider value={cpus} onChange={setCpus} maxCpus={hostInfo?.cpus ?? 16} compact />
        <MemorySlider value={memory} onChange={setMemory} maxMemoryGiB={hostInfo ? Math.floor(hostInfo.memory_gib) : 64} compact />
      </div>
      <div className="flex gap-2 justify-end">
        <Button onClick={handleRun} disabled={run.isPending || !image.trim()}>
          {run.isPending ? "Starting..." : "Run"}
        </Button>
        <Button variant="ghost" onClick={() => setExpanded(false)}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
