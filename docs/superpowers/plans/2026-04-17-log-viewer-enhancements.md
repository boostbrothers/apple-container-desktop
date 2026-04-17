# Log Viewer Enhancements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 컨테이너 로그 뷰어에 성능 개선(memo + 버퍼 상한), ANSI decoration 완성도(hidden), 어두운 배경 팔레트 보정, 검색(Cmd+F 스타일), 필터(서브스트링) 기능을 추가한다.

**Architecture:** 순수 유틸(`log-buffer.ts`, `ansi-palette.ts`) → 개선된 `AnsiLine`(memo + hidden + 하이라이트) → `LogEntry` 상태 리팩토링(id/plainText 추가, 버퍼 상한) → `LogView`·`LogToolbar` 컴포넌트 분리 → 필터/검색 동작 배선 → 키보드 단축키. 백엔드 변경 없음.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, Lucide icons, `anser` 2.x

---

## File Structure

**신규**
- `src/lib/log-buffer.ts` — `pushBounded(arr, item, max)` 순수 함수
- `src/lib/ansi-palette.ts` — `brightenForDarkBg(rgb)` 색상 보정
- `src/components/containers/LogView.tsx` — `visibleLogs`/`activeMatchId`/`query`를 받아 라인 렌더 (scrollIntoView용 ref 관리)
- `src/components/containers/LogToolbar.tsx` — 검색·필터 UI

**수정**
- `src/components/containers/AnsiLine.tsx` — `React.memo`, `hidden` decoration, 팔레트 적용, `highlight` prop
- `src/components/containers/ContainerLogs.tsx` — `LogEntry` 상태, pushBounded, LogToolbar+LogView 배치, hotkey, 검색/필터 상태

---

## Task 1: Add pure utilities (log-buffer, ansi-palette)

**Files:**
- Create: `src/lib/log-buffer.ts`
- Create: `src/lib/ansi-palette.ts`

- [ ] **Step 1: Create `src/lib/log-buffer.ts`**

Create with exact content:

```ts
export function pushBounded<T>(arr: readonly T[], item: T, max: number): T[] {
  if (max <= 0) return [];
  if (arr.length < max) return [...arr, item];
  return [...arr.slice(arr.length - max + 1), item];
}
```

Note: `arr.slice(arr.length - max + 1)` keeps last `max - 1` items, then appends. This handles cases where `arr.length` already exceeds `max` (e.g., after a max decrease) — not a current scenario but safer.

- [ ] **Step 2: Create `src/lib/ansi-palette.ts`**

Create with exact content:

```ts
const RGB_PATTERN = /^\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*$/;
const MIN_CHANNEL_FOR_DARK_BG = 110;

export function brightenForDarkBg(rgb: string | null | undefined): string | null {
  if (!rgb) return rgb ?? null;
  const m = RGB_PATTERN.exec(rgb);
  if (!m) return rgb;
  const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const maxChannel = Math.max(r, g, b);
  if (maxChannel >= MIN_CHANNEL_FOR_DARK_BG) return rgb;
  const lift = MIN_CHANNEL_FOR_DARK_BG - maxChannel;
  const clamp = (c: number) => Math.min(255, c + lift);
  return `${clamp(r)}, ${clamp(g)}, ${clamp(b)}`;
}
```

Behavior: if any channel is already ≥110, color is bright enough — return untouched. Otherwise add a uniform lift so the brightest channel reaches 110, preserving color ratios.

- [ ] **Step 3: Typecheck**

Run:
```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/lib/log-buffer.ts src/lib/ansi-palette.ts
git commit -m "feat: add log-buffer and ansi-palette utilities"
```

---

## Task 2: Enhance AnsiLine (memo, hidden, palette, highlight)

**Files:**
- Modify: `src/components/containers/AnsiLine.tsx`

- [ ] **Step 1: Replace AnsiLine.tsx with full new version**

Overwrite `src/components/containers/AnsiLine.tsx` with:

```tsx
import Anser, { type AnserJsonEntry } from "anser";
import { memo, type CSSProperties } from "react";
import { brightenForDarkBg } from "@/lib/ansi-palette";

interface AnsiLineProps {
  text: string;
  highlight?: {
    query: string;
    isActive: boolean;
  };
}

const LINE_STYLE: CSSProperties = { minHeight: "1em" };

function rgbOrUndefined(value: string | null | undefined): string | undefined {
  if (!value) return undefined;
  return `rgb(${value})`;
}

function entryStyle(entry: AnserJsonEntry): CSSProperties {
  const style: CSSProperties = {};
  let color = rgbOrUndefined(brightenForDarkBg(entry.fg));
  let background = rgbOrUndefined(entry.bg);

  const decorations = entry.decorations ?? [];

  if (decorations.includes("reverse")) {
    [color, background] = [background, color];
  }

  if (color) style.color = color;
  if (background) style.backgroundColor = background;

  if (decorations.includes("bold")) style.fontWeight = 600;
  if (decorations.includes("italic")) style.fontStyle = "italic";
  if (decorations.includes("underline")) style.textDecoration = "underline";
  if (decorations.includes("dim")) style.opacity = 0.6;
  if (decorations.includes("strikethrough")) {
    style.textDecoration = style.textDecoration
      ? `${style.textDecoration} line-through`
      : "line-through";
  }
  // `hidden`: keep layout (visibility), content invisible
  if (decorations.includes("hidden")) style.visibility = "hidden";
  // `blink`: intentionally ignored for accessibility / user comfort

  return style;
}

function renderContent(content: string, highlight: AnsiLineProps["highlight"]) {
  if (!highlight || !highlight.query) return content;
  const query = highlight.query;
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const parts: Array<string | { match: string }> = [];
  let cursor = 0;
  while (cursor < content.length) {
    const idx = lowerContent.indexOf(lowerQuery, cursor);
    if (idx === -1) {
      parts.push(content.slice(cursor));
      break;
    }
    if (idx > cursor) parts.push(content.slice(cursor, idx));
    parts.push({ match: content.slice(idx, idx + query.length) });
    cursor = idx + query.length;
    if (query.length === 0) break;
  }
  return parts.map((part, i) =>
    typeof part === "string" ? (
      <span key={i}>{part}</span>
    ) : (
      <mark
        key={i}
        className={
          highlight.isActive
            ? "bg-yellow-300 text-black ring-2 ring-yellow-200 rounded-sm"
            : "bg-yellow-400/70 text-black rounded-sm"
        }
      >
        {part.match}
      </mark>
    )
  );
}

function AnsiLineInner({ text, highlight }: AnsiLineProps) {
  let entries: AnserJsonEntry[];
  try {
    entries = Anser.ansiToJson(text, {
      json: true,
      remove_empty: true,
      use_classes: false,
    });
  } catch {
    return <div style={LINE_STYLE}>{text}</div>;
  }

  if (entries.length === 0) {
    return <div style={LINE_STYLE}>&nbsp;</div>;
  }

  return (
    <div style={LINE_STYLE}>
      {entries.map((entry, index) => (
        <span key={index} style={entryStyle(entry)}>
          {renderContent(entry.content, highlight)}
        </span>
      ))}
    </div>
  );
}

export const AnsiLine = memo(AnsiLineInner);
```

Changes from previous:
- `React.memo` wrapper (referential equality on `text` + `highlight` — strings are primitives, `highlight` is an object so callers must memoize it)
- Palette: `brightenForDarkBg` applied to fg only (bg untouched)
- `hidden` → `visibility: "hidden"`
- `blink` intentionally dropped (comment)
- New `highlight` prop; `renderContent` splits content by query matches, wraps each in `<mark>` with active/inactive styling
- `LINE_STYLE` extracted constant
- Export is now memo'd component

- [ ] **Step 2: Typecheck**

Run:
```bash
npm run build
```

Expected: exit 0.

If `@/lib/ansi-palette` fails to resolve: check `tsconfig.json` / `vite.config.ts` for `@/*` alias. The existing imports use `@/components/ui/button` so the alias should already work. If not, fallback to relative `../../lib/ansi-palette`.

- [ ] **Step 3: Commit**

```bash
git add src/components/containers/AnsiLine.tsx
git commit -m "feat: memo AnsiLine, support hidden decoration and highlight prop"
```

---

## Task 3: Refactor ContainerLogs state to LogEntry with buffer cap

**Files:**
- Modify: `src/components/containers/ContainerLogs.tsx`

Keep rendering inline for this task (no LogView yet). Only change the state shape, buffer cap, and key strategy. LogToolbar/LogView extraction happens in Tasks 4–6.

- [ ] **Step 1: Replace ContainerLogs.tsx**

Overwrite with:

```tsx
import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import Anser from "anser";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "../../lib/tauri";
import { AnsiLine } from "./AnsiLine";
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
        <div className="text-xs text-zinc-200 font-mono whitespace-pre-wrap">
          {logs.map((entry) => (
            <AnsiLine key={entry.id} text={entry.text} />
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
```

Changes:
- Import `Anser` for `ansiToText`
- New `LogEntry` interface (exported for Task 4 / 5 reuse)
- `MAX_LINES = 5000`
- `nextId` ref for monotonic ids
- `pushBounded` replaces `[...prev, payload]`
- `plainText` computed on arrival
- Render key is now `entry.id`

- [ ] **Step 2: Typecheck**

Run:
```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/containers/ContainerLogs.tsx
git commit -m "refactor: introduce LogEntry shape with monotonic id and buffer cap"
```

---

## Task 4: Extract LogView component

**Files:**
- Create: `src/components/containers/LogView.tsx`
- Modify: `src/components/containers/ContainerLogs.tsx`

- [ ] **Step 1: Create `src/components/containers/LogView.tsx`**

```tsx
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
```

Notes:
- `LogEntry` is imported as a type from `ContainerLogs` (barrel not used; TS handles type-only import fine)
- `highlightByEntry` is `null` when no query → AnsiLine receives `undefined` (memo-friendly, stable)
- Active match ref triggers `scrollIntoView` on change

- [ ] **Step 2: Update ContainerLogs.tsx to use LogView**

Replace the `<ScrollArea>` content block in `ContainerLogs.tsx` (the `<div className="text-xs text-zinc-200 font-mono whitespace-pre-wrap">...</div>` block) with:

```tsx
<LogView
  entries={logs}
  query=""
  activeMatchId={null}
  bottomRef={bottomRef}
/>
```

And add the import near the top:
```tsx
import { LogView } from "./LogView";
```

After edit, the file should look like (full content for clarity):

```tsx
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
```

- [ ] **Step 3: Typecheck**

Run:
```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/components/containers/LogView.tsx src/components/containers/ContainerLogs.tsx
git commit -m "refactor: extract LogView component"
```

---

## Task 5: Create LogToolbar component (UI skeleton, filter wired)

**Files:**
- Create: `src/components/containers/LogToolbar.tsx`
- Modify: `src/components/containers/ContainerLogs.tsx`

- [ ] **Step 1: Create `src/components/containers/LogToolbar.tsx`**

```tsx
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface LogToolbarProps {
  filter: string;
  onFilterChange: (value: string) => void;
  showingCount: number;
  totalCount: number;
  searchOpen: boolean;
  onSearchToggle: () => void;
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;
  matchCount: number;
  activeIndex: number;
  onSearchPrev: () => void;
  onSearchNext: () => void;
  onSearchClose: () => void;
  searchInputRef: React.RefObject<HTMLInputElement | null>;
}

export function LogToolbar({
  filter,
  onFilterChange,
  showingCount,
  totalCount,
  searchOpen,
  onSearchToggle,
  searchQuery,
  onSearchQueryChange,
  matchCount,
  activeIndex,
  onSearchPrev,
  onSearchNext,
  onSearchClose,
  searchInputRef,
}: LogToolbarProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 flex-1 min-w-0 max-w-sm">
          <span className="text-xs text-zinc-400 shrink-0">Filter:</span>
          <Input
            value={filter}
            onChange={(e) => onFilterChange(e.target.value)}
            placeholder="substring..."
            className="h-7 text-xs"
          />
          {filter && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 shrink-0"
              onClick={() => onFilterChange("")}
              aria-label="Clear filter"
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
        <span className="text-xs text-zinc-500 tabular-nums">
          {showingCount.toLocaleString()} / {totalCount.toLocaleString()}
        </span>
        <Button
          variant={searchOpen ? "secondary" : "ghost"}
          size="sm"
          onClick={onSearchToggle}
          aria-label="Search (Cmd+F)"
          title="Search (Cmd+F)"
        >
          <Search className="h-3.5 w-3.5" />
        </Button>
      </div>

      {searchOpen && (
        <div className="flex items-center gap-1.5">
          <Input
            ref={searchInputRef}
            value={searchQuery}
            onChange={(e) => onSearchQueryChange(e.target.value)}
            placeholder="search..."
            className="h-7 text-xs flex-1 max-w-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.shiftKey) onSearchPrev();
                else onSearchNext();
              } else if (e.key === "Escape") {
                e.preventDefault();
                onSearchClose();
              }
            }}
            autoFocus
          />
          <span className="text-xs text-zinc-500 tabular-nums shrink-0">
            {matchCount === 0 ? "0 / 0" : `${activeIndex + 1} / ${matchCount}`}
          </span>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onSearchPrev}
            disabled={matchCount === 0}
            aria-label="Previous match"
          >
            ↑
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onSearchNext}
            disabled={matchCount === 0}
            aria-label="Next match"
          >
            ↓
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onSearchClose}
            aria-label="Close search"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify `Input` component exists**

Run:
```bash
ls src/components/ui/input.tsx 2>&1
```

Expected: file exists. If NOT found, run:
```bash
npx shadcn@latest add input
```
And re-run Step 1 edit if needed.

- [ ] **Step 3: Wire filter into ContainerLogs**

Replace `src/components/containers/ContainerLogs.tsx` entirely with:

```tsx
import { useEffect, useMemo, useRef, useState } from "react";
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

  useEffect(() => {
    if (autoScroll) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [visibleLogs, autoScroll]);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 -mx-4 -mt-4 px-4 pt-4 pb-3 glass-panel border-b border-[var(--glass-border)] flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onBack}>← Back</Button>
          <span className="text-sm font-medium">Logs: {containerId.slice(0, 12)}</span>
          <Button variant="outline" size="sm" className="ml-auto" onClick={() => setAutoScroll(!autoScroll)}>
            {autoScroll ? "Auto-scroll: On" : "Auto-scroll: Off"}
          </Button>
        </div>
        <LogToolbar
          filter={filter}
          onFilterChange={setFilter}
          showingCount={visibleLogs.length}
          totalCount={logs.length}
          searchOpen={false}
          onSearchToggle={() => {}}
          searchQuery=""
          onSearchQueryChange={() => {}}
          matchCount={0}
          activeIndex={0}
          onSearchPrev={() => {}}
          onSearchNext={() => {}}
          onSearchClose={() => {}}
          searchInputRef={searchInputRef}
        />
      </div>
      <ScrollArea className="flex-1 min-h-0 rounded-xl border border-[var(--glass-border)] bg-black/90 p-3 shadow-lg">
        <LogView
          entries={visibleLogs}
          query=""
          activeMatchId={null}
          bottomRef={bottomRef}
        />
      </ScrollArea>
    </div>
  );
}
```

Changes vs Task 4:
- Added `useMemo` import
- Added `filter` state, `searchInputRef`
- `visibleLogs = useMemo(filter ? logs.filter(...) : logs)`
- Auto-scroll depends on `visibleLogs` instead of raw `logs`
- Header now `flex-col` to hold title row + LogToolbar
- LogToolbar is rendered with filter wired, search stubbed (filled in Task 6)

- [ ] **Step 4: Typecheck**

Run:
```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/components/containers/LogToolbar.tsx src/components/containers/ContainerLogs.tsx
git commit -m "feat: add LogToolbar with filter support"
```

---

## Task 6: Wire search (matches, activeIndex, highlighting, scroll)

**Files:**
- Modify: `src/components/containers/ContainerLogs.tsx`

- [ ] **Step 1: Replace ContainerLogs.tsx**

```tsx
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
```

Changes vs Task 5:
- Added `useCallback` import
- New state: `searchOpen`, `searchQuery`, `activeIndex`
- `matches` useMemo (entry.id[] where plainText contains query, scanning `visibleLogs`)
- `activeIndex` auto-reset effect if out of bounds after matches change
- `searchActive` / `effectiveAutoScroll` derived — auto-scroll pauses while search is active
- Auto-scroll button disabled while search is active
- `activeMatchId = matches[activeIndex] ?? null`
- Handlers: toggle, close, queryChange, next, prev
- LogToolbar fully wired
- LogView receives `query` (only when search active) and `activeMatchId`

- [ ] **Step 2: Typecheck**

Run:
```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/containers/ContainerLogs.tsx
git commit -m "feat: wire log search with highlighting and navigation"
```

---

## Task 7: Keyboard shortcut (Cmd+F / Ctrl+F) to toggle search

**Files:**
- Modify: `src/components/containers/ContainerLogs.tsx`

- [ ] **Step 1: Add hotkey effect**

In `src/components/containers/ContainerLogs.tsx`, add a new `useEffect` immediately after the existing effect that handles `effectiveAutoScroll`, and before the line `const activeMatchId = matches.length > 0 ? ...`.

Insert:
```tsx
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
```

Design notes:
- Global listener on `window` keeps it simple; log view is mounted one-at-a-time
- When search already open, Cmd+F re-focuses the input
- `requestAnimationFrame` ensures input is mounted before focusing

- [ ] **Step 2: Typecheck**

Run:
```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/containers/ContainerLogs.tsx
git commit -m "feat: add Cmd+F hotkey to open log search"
```

---

## Task 8: Manual verification

**Files:** (none — runtime verification)

- [ ] **Step 1: Start dev server**

```bash
npm run tauri dev
```

Expected: app launches without errors.

- [ ] **Step 2: Performance / buffer cap check**

In a separate terminal:
```bash
container run --name perf-test -d alpine sh -c 'i=0; while true; do printf "%d\033[31mERR\033[0m line %d\n" $i $i; i=$((i+1)); done'
```

Open container logs in the app, wait ~15 seconds.

Expected:
- Toolbar counter shows `5,000 / 5,000` (bounded)
- UI remains responsive (no jank)
- Open React DevTools → Profiler → record a few seconds. AnsiLine components from earlier lines should NOT re-render on each new append (memo working)

Stop:
```bash
container stop perf-test && container delete perf-test
```

- [ ] **Step 3: hidden decoration**

```bash
container run --name hidden-test -d alpine sh -c 'while true; do printf "visible \033[8mhidden\033[0m end\n"; sleep 1; done'
```

Expected in log view: `visible   end` — the word "hidden" is invisible but occupies space.

Stop: `container stop hidden-test && container delete hidden-test`

- [ ] **Step 4: Palette brightening**

```bash
container run --name palette-test -d alpine sh -c 'while true; do printf "\033[30mblack\033[0m \033[90mbright black\033[0m \033[34mblue\033[0m\n"; sleep 1; done'
```

Expected: `black` and `bright black` are both readable on the dark background. `blue` is also readable.

Stop: `container stop palette-test && container delete palette-test`

- [ ] **Step 5: Filter**

```bash
container run --name filter-test -d alpine sh -c 'i=0; while true; do case $((i%3)) in 0) level=INFO;; 1) level=WARN;; 2) level=ERROR;; esac; echo "$level something $i"; i=$((i+1)); sleep 0.2; done'
```

Open log view, type `ERROR` in the filter input.

Expected:
- Only ERROR lines visible
- Counter shows `X / Y` where X is roughly Y/3
- Click x button to clear filter → all lines return

- [ ] **Step 6: Search**

With filter-test still running, press `Cmd+F` (or click 🔍 button).

Expected:
- Search bar appears below the toolbar row with input focused
- Counter shows `0 / 0` initially
- Type `INFO` → counter updates to `N / M`, matches highlighted in yellow
- Press `Enter` → active match changes (ring highlight), view scrolls to it
- Press `Shift+Enter` → moves to previous match
- Press `Esc` → search closes, highlights gone

- [ ] **Step 7: Search + Filter combo**

With search still shown, type filter `INFO`. Then open search and type `something 5`.

Expected: only `INFO something 5X` lines visible; search highlights `something 5` within them; auto-scroll paused while search active.

Cleanup: `container stop filter-test && container delete filter-test`

- [ ] **Step 8: Regression**

- `← Back` button still works
- Auto-scroll toggle works when search is closed
- Close and reopen a container's logs — state resets cleanly

- [ ] **Step 9: No commit** (verification only)

---

## Self-Review Notes

**Spec coverage:**
- Performance (memo + ring buffer) — Task 2 (memo), Task 3 (pushBounded + LogEntry.id) ✓
- `hidden` decoration — Task 2 ✓
- `blink` intentionally dropped with comment — Task 2 ✓
- Palette tuning (brightenForDarkBg on fg only) — Task 1 + Task 2 ✓
- Search UI + highlighting + prev/next/counter — Task 5 (UI) + Task 6 (wiring) ✓
- `<mark>` for match highlight, active match with ring — Task 2 renderContent ✓
- Filter UI + substring match on plainText — Task 5 ✓
- Filter first, then search — Task 6 (matches scans visibleLogs) ✓
- Auto-scroll pauses during search — Task 6 (effectiveAutoScroll) ✓
- Auto-scroll button disabled during active search — Task 6 ✓
- Cmd+F / Ctrl+F hotkey — Task 7 ✓
- Enter/Shift+Enter/Esc — Task 5 LogToolbar onKeyDown ✓
- LogEntry `{id, text, plainText}` — Task 3 ✓
- Monotonic nextId — Task 3 ✓
- Module split (LogToolbar, LogView, ansi-palette, log-buffer) — Tasks 1, 4, 5 ✓
- MAX_LINES = 5000 — Task 3 ✓
- `Anser.ansiToText` for plainText — Task 3 ✓

**Placeholder scan:** clean. All code complete.

**Type consistency:**
- `LogEntry` interface defined in Task 3, used in Tasks 4–7 ✓
- `LogToolbarProps`/`LogViewProps` handler signatures match call sites ✓
- `searchInputRef` type `RefObject<HTMLInputElement | null>` matches `useRef<HTMLInputElement>(null)` usage ✓
