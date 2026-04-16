import { useCallback, useMemo } from "react";

// ─── CPU Slider ────────────────────────────────────────────────────────────

interface CpuSliderProps {
  value: string; // "" | "1" | "2" | ...
  onChange: (value: string) => void;
  maxCpus?: number;
  compact?: boolean;
}

export function CpuSlider({ value, onChange, maxCpus = 16, compact = false }: CpuSliderProps) {
  // Steps: 0 (auto), 1, 2, 3, ... maxCpus
  const steps = useMemo(() => {
    const s = [0];
    for (let i = 1; i <= maxCpus; i++) s.push(i);
    return s;
  }, [maxCpus]);

  const currentIndex = useMemo(() => {
    if (!value) return 0;
    const n = parseFloat(value);
    if (isNaN(n) || n <= 0) return 0;
    const idx = steps.findIndex((s) => s >= n);
    return idx >= 0 ? idx : steps.length - 1;
  }, [value, steps]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const idx = parseInt(e.target.value, 10);
      const v = steps[idx];
      onChange(v === 0 ? "" : String(v));
    },
    [steps, onChange],
  );

  const label = currentIndex === 0 ? "Auto" : `${steps[currentIndex]} CPUs`;

  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <div className="flex items-center justify-between">
        <label className="text-[10px] text-muted-foreground">CPUs</label>
        <span className="text-[11px] font-mono font-medium tabular-nums">{label}</span>
      </div>
      <input
        type="range"
        min={0}
        max={steps.length - 1}
        step={1}
        value={currentIndex}
        onChange={handleChange}
        className="resource-slider w-full"
      />
      <div className="flex justify-between text-[9px] text-muted-foreground/60">
        <span>Auto</span>
        <span>{maxCpus}</span>
      </div>
    </div>
  );
}

// ─── Memory Slider ─────────────────────────────────────────────────────────

const MEMORY_STEPS = [
  { value: "", label: "Auto" },
  { value: "128M", label: "128M" },
  { value: "256M", label: "256M" },
  { value: "512M", label: "512M" },
  { value: "1G", label: "1G" },
  { value: "2G", label: "2G" },
  { value: "4G", label: "4G" },
  { value: "8G", label: "8G" },
  { value: "16G", label: "16G" },
  { value: "32G", label: "32G" },
  { value: "64G", label: "64G" },
];

function memoryToMb(v: string): number {
  if (!v) return 0;
  const match = v.match(/^(\d+(?:\.\d+)?)\s*(K|M|G|T|Ki|Mi|Gi|Ti|KiB|MiB|GiB|TiB|KB|MB|GB|TB)?$/i);
  if (!match) return 0;
  const num = parseFloat(match[1]);
  const unit = (match[2] || "M").toUpperCase();
  if (unit.startsWith("K")) return num / 1024;
  if (unit.startsWith("G")) return num * 1024;
  if (unit.startsWith("T")) return num * 1024 * 1024;
  return num; // M
}

function stepToMb(step: { value: string }): number {
  return memoryToMb(step.value);
}

interface MemorySliderProps {
  value: string; // "" | "512M" | "1G" | ...
  onChange: (value: string) => void;
  maxMemoryGiB?: number;
  compact?: boolean;
}

export function MemorySlider({ value, onChange, maxMemoryGiB = 64, compact = false }: MemorySliderProps) {
  const steps = useMemo(() => {
    const maxMb = maxMemoryGiB * 1024;
    return MEMORY_STEPS.filter((s) => s.value === "" || stepToMb(s) <= maxMb);
  }, [maxMemoryGiB]);

  const currentIndex = useMemo(() => {
    if (!value) return 0;
    const mb = memoryToMb(value);
    if (mb <= 0) return 0;
    // Find closest step
    let closest = 0;
    let minDist = Infinity;
    for (let i = 0; i < steps.length; i++) {
      const sMb = stepToMb(steps[i]);
      const dist = Math.abs(sMb - mb);
      if (dist < minDist) {
        minDist = dist;
        closest = i;
      }
    }
    return closest;
  }, [value, steps]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const idx = parseInt(e.target.value, 10);
      onChange(steps[idx].value);
    },
    [steps, onChange],
  );

  const label = steps[currentIndex].label;

  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <div className="flex items-center justify-between">
        <label className="text-[10px] text-muted-foreground">Memory</label>
        <span className="text-[11px] font-mono font-medium tabular-nums">{label}</span>
      </div>
      <input
        type="range"
        min={0}
        max={steps.length - 1}
        step={1}
        value={currentIndex}
        onChange={handleChange}
        className="resource-slider w-full"
      />
      <div className="flex justify-between text-[9px] text-muted-foreground/60">
        <span>Auto</span>
        <span>{steps[steps.length - 1].label}</span>
      </div>
    </div>
  );
}
