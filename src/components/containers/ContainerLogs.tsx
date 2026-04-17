import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import Anser from "anser";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "../../lib/tauri";
import { LogView } from "./LogView";
import { LogToolbar } from "./LogToolbar";
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
  const [filter, setFilter] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
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

  const visibleLogs = useMemo(() => {
    if (!filter) return logs;
    const needle = filter.toLowerCase();
    return logs.filter((l) => l.plainText.toLowerCase().includes(needle));
  }, [logs, filter]);

  const matches = useMemo(() => {
    if (!searchOpen || !searchQuery) return [] as number[];
    const needle = searchQuery.toLowerCase();
    const result: number[] = [];
    for (const entry of visibleLogs) {
      if (entry.plainText.toLowerCase().includes(needle)) result.push(entry.id);
    }
    return result;
  }, [visibleLogs, searchOpen, searchQuery]);

  // Reset activeIndex when query/filter/logs invalidate current position
  useEffect(() => {
    if (activeIndex >= matches.length) setActiveIndex(0);
  }, [matches, activeIndex]);

  const searchActive = searchOpen && searchQuery.length > 0;
  const effectiveAutoScroll = autoScroll && !searchActive;

  useEffect(() => {
    if (effectiveAutoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [visibleLogs, effectiveAutoScroll]);

  const activeMatchId = matches.length > 0 ? matches[activeIndex] ?? null : null;

  const handleSearchToggle = useCallback(() => {
    setSearchOpen((prev) => !prev);
  }, []);

  const handleSearchClose = useCallback(() => {
    setSearchOpen(false);
    setActiveIndex(0);
  }, []);

  const handleSearchQueryChange = useCallback((value: string) => {
    setSearchQuery(value);
    setActiveIndex(0);
  }, []);

  const handleSearchNext = useCallback(() => {
    if (matches.length === 0) return;
    setActiveIndex((prev) => (prev + 1) % matches.length);
  }, [matches.length]);

  const handleSearchPrev = useCallback(() => {
    if (matches.length === 0) return;
    setActiveIndex((prev) => (prev - 1 + matches.length) % matches.length);
  }, [matches.length]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 -mx-4 -mt-4 px-4 pt-4 pb-3 glass-panel border-b border-[var(--glass-border)] flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>← Back</Button>
          <span className="text-sm font-medium">Logs: {containerId.slice(0, 12)}</span>
          <Button
            variant="outline"
            size="sm"
            className="ml-auto"
            onClick={() => setAutoScroll(!autoScroll)}
            disabled={searchActive}
            title={searchActive ? "Auto-scroll paused while searching" : undefined}
          >
            {autoScroll ? "Auto-scroll: On" : "Auto-scroll: Off"}
          </Button>
        </div>
        <LogToolbar
          filter={filter}
          onFilterChange={setFilter}
          showingCount={visibleLogs.length}
          totalCount={logs.length}
          searchOpen={searchOpen}
          onSearchToggle={handleSearchToggle}
          searchQuery={searchQuery}
          onSearchQueryChange={handleSearchQueryChange}
          matchCount={matches.length}
          activeIndex={activeIndex}
          onSearchPrev={handleSearchPrev}
          onSearchNext={handleSearchNext}
          onSearchClose={handleSearchClose}
          searchInputRef={searchInputRef}
        />
      </div>
      <ScrollArea className="flex-1 min-h-0 rounded-xl border border-[var(--glass-border)] bg-black/90 p-3 shadow-lg">
        <LogView
          entries={visibleLogs}
          query={searchActive ? searchQuery : ""}
          activeMatchId={activeMatchId}
          bottomRef={bottomRef}
        />
      </ScrollArea>
    </div>
  );
}
