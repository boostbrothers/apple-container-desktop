import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import Anser from "anser";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "../../lib/tauri";
import { LogView } from "./LogView";
import { LogToolbar } from "./LogToolbar";
import { ContainerHeader } from "./ContainerHeader";
import { pushBounded } from "@/lib/log-buffer";
import { copyLogs, exportLogs } from "@/lib/log-export";

interface ContainerLogsProps {
  containerId: string;
  onBack: () => void;
  onViewInspect?: () => void;
  onNavigateToProject?: (projectId: string) => void;
}

export interface LogEntry {
  id: number;
  text: string;
  plainText: string;
}

const MAX_LINES = 5000;

export function ContainerLogs({ containerId, onBack, onViewInspect, onNavigateToProject }: ContainerLogsProps) {
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

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isFind = (e.metaKey || e.ctrlKey) && (e.key === "f" || e.key === "F");
      if (isFind) {
        e.preventDefault();
        setSearchOpen(true);
        requestAnimationFrame(() => searchInputRef.current?.focus());
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const activeMatchId = matches.length > 0 ? matches[activeIndex] ?? null : null;

  const handleSearchToggle = useCallback(() => {
    setSearchOpen((prev) => !prev);
  }, []);

  const handleSearchClose = useCallback(() => {
    setSearchOpen(false);
    setActiveIndex(0);
    setAutoScroll(false);
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

  const handleCopy = useCallback(async () => {
    await copyLogs(visibleLogs);
  }, [visibleLogs]);

  const handleExport = useCallback(async () => {
    await exportLogs(visibleLogs, containerId);
  }, [visibleLogs, containerId]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <ContainerHeader
        containerId={containerId}
        view="logs"
        onBack={onBack}
        onViewInspect={onViewInspect}
        onNavigateToProject={onNavigateToProject}
      />
      <div className="shrink-0 mt-3">
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
          onCopy={handleCopy}
          onExport={handleExport}
          exportDisabled={visibleLogs.length === 0}
        />
      </div>
      <ScrollArea className="flex-1 min-h-0 mt-2 rounded-xl border border-[var(--glass-border)] bg-black/90 p-3 shadow-lg">
        <LogView
          entries={visibleLogs}
          query={searchActive ? searchQuery : ""}
          activeMatchId={activeMatchId}
          bottomRef={bottomRef}
        />
      </ScrollArea>
      <div className="shrink-0 mt-2 flex items-center justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setAutoScroll(!autoScroll)}
          disabled={searchActive}
          title={searchActive ? "Auto-scroll paused while searching" : undefined}
        >
          {autoScroll ? "Auto-scroll: On" : "Auto-scroll: Off"}
        </Button>
      </div>
    </div>
  );
}
