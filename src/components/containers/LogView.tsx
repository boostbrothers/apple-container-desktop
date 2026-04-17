import { useEffect, useMemo, useRef } from "react";
import { AnsiLine } from "./AnsiLine";
import type { LogEntry } from "./ContainerLogs";

interface LogViewProps {
  entries: LogEntry[];
  query: string;
  activeMatchId: number | null;
  bottomRef: React.RefObject<HTMLDivElement | null>;
}

export function LogView({ entries, query, activeMatchId, bottomRef }: LogViewProps) {
  const activeRef = useRef<HTMLDivElement | null>(null);

  const highlightByEntry = useMemo(() => {
    if (!query) return null;
    return (entryId: number) => ({
      query,
      isActive: entryId === activeMatchId,
    });
  }, [query, activeMatchId]);

  useEffect(() => {
    if (activeMatchId !== null && activeRef.current) {
      activeRef.current.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }, [activeMatchId]);

  return (
    <div className="text-xs text-zinc-200 font-mono whitespace-pre-wrap">
      {entries.map((entry) => {
        const isActive = entry.id === activeMatchId;
        return (
          <div key={entry.id} ref={isActive ? activeRef : undefined}>
            <AnsiLine
              text={entry.text}
              highlight={highlightByEntry ? highlightByEntry(entry.id) : undefined}
            />
          </div>
        );
      })}
      <div ref={bottomRef} />
    </div>
  );
}
