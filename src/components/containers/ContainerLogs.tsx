import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import Anser from "anser";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "../../lib/tauri";
import { LogView } from "./LogView";
import { pushBounded } from "@/lib/log-buffer";

interface ContainerLogsProps {
  containerId: string;
  onBack: () => void;
}

export interface LogEntry {
  id: number;
  text: string;
  plainText: string;
}

const MAX_LINES = 5000;

export function ContainerLogs({ containerId, onBack }: ContainerLogsProps) {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const nextId = useRef(0);

  useEffect(() => {
    api.streamContainerLogs(containerId);
    const unlisten = listen<string>(`container-log-${containerId}`, (event) => {
      const text = event.payload;
      const entry: LogEntry = {
        id: nextId.current++,
        text,
        plainText: Anser.ansiToText(text),
      };
      setLogs((prev) => pushBounded(prev, entry, MAX_LINES));
    });
    return () => { unlisten.then((fn) => fn()); };
  }, [containerId]);

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 -mx-4 -mt-4 px-4 pt-4 pb-3 glass-panel border-b border-[var(--glass-border)] flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>← Back</Button>
        <span className="text-sm font-medium">Logs: {containerId.slice(0, 12)}</span>
        <Button variant="outline" size="sm" className="ml-auto" onClick={() => setAutoScroll(!autoScroll)}>
          {autoScroll ? "Auto-scroll: On" : "Auto-scroll: Off"}
        </Button>
      </div>
      <ScrollArea className="flex-1 min-h-0 rounded-xl border border-[var(--glass-border)] bg-black/90 p-3 shadow-lg">
        <LogView
          entries={logs}
          query=""
          activeMatchId={null}
          bottomRef={bottomRef}
        />
      </ScrollArea>
    </div>
  );
}
