# Log Copy & Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `LogToolbar`에 Copy/Export 버튼 두 개를 추가해 `visibleLogs`를 plainText로 클립보드 복사 또는 파일 저장한다.

**Architecture:** Tauri clipboard-manager 플러그인 + dialog 플러그인의 save, 파일 쓰기는 Rust 커스텀 커맨드(`write_log_file`)로 처리. 프론트엔드는 `src/lib/log-export.ts` 순수 유틸로 contents/filename 구성과 clipboard/dialog 호출을 캡슐화. 버튼은 `LogToolbar`에 추가.

**Tech Stack:** Tauri 2, `tauri-plugin-clipboard-manager`, `tauri-plugin-dialog` (설치됨), React 19, TypeScript

---

## File Structure

**신규**
- `src/lib/log-export.ts` — `buildLogContent`, `buildDefaultFilename`, `copyLogs`, `exportLogs`
- `src-tauri/src/commands/log_export.rs` — `write_log_file` command

**수정**
- `package.json` / `package-lock.json` — `@tauri-apps/plugin-clipboard-manager` 추가
- `src-tauri/Cargo.toml` — `tauri-plugin-clipboard-manager` 추가
- `src-tauri/src/commands/mod.rs` — `log_export` 모듈 노출
- `src-tauri/src/lib.rs` — 플러그인 초기화 + `write_log_file` 커맨드 등록
- `src-tauri/capabilities/default.json` — `dialog:allow-save`, `clipboard-manager:allow-write-text` 추가
- `src/components/containers/LogToolbar.tsx` — Copy/Export 버튼, `copied` 상태
- `src/components/containers/ContainerLogs.tsx` — `onCopy`/`onExport` 핸들러 주입

---

## Task 1: Install Tauri clipboard-manager plugin

**Files:**
- Modify: `package.json`, `package-lock.json`
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: Install JS package**

Run:
```bash
npm install @tauri-apps/plugin-clipboard-manager@^2
```

Expected: `package.json` `dependencies`에 `"@tauri-apps/plugin-clipboard-manager": "^2.x.x"` 추가.

- [ ] **Step 2: Add Rust crate to Cargo.toml**

Open `src-tauri/Cargo.toml`. In the `[dependencies]` section, add the line right after `tauri-plugin-dialog = "2"`:

```toml
tauri-plugin-clipboard-manager = "2"
```

- [ ] **Step 3: Verify Rust build**

```bash
cd src-tauri && cargo check 2>&1 | tail -20 ; cd ..
```

Expected: completes without errors related to the new dep.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: add tauri-plugin-clipboard-manager"
```

---

## Task 2: Add Rust `write_log_file` command

**Files:**
- Create: `src-tauri/src/commands/log_export.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Create `src-tauri/src/commands/log_export.rs`**

```rust
use std::path::PathBuf;

#[tauri::command]
pub async fn write_log_file(path: String, content: String) -> Result<(), String> {
    let path_buf = PathBuf::from(&path);
    std::fs::write(&path_buf, content).map_err(|e| format!("Failed to write log file: {}", e))
}
```

- [ ] **Step 2: Register module in `src-tauri/src/commands/mod.rs`**

Add one line at the end (or alphabetical slot):
```rust
pub mod log_export;
```

After editing, the file should contain (order doesn't matter — just ensure the new line is present):
```rust
pub mod app_settings;
pub mod system;
pub mod container;
pub mod project;
pub mod env_secrets;
pub mod env_store;
pub mod registry_settings;
pub mod image;
pub mod network;
pub mod resource_settings;
pub mod onboarding;
pub mod update;
pub mod volume;
pub mod proxy;
pub mod log_export;
```

- [ ] **Step 3: Register plugin + command in `src-tauri/src/lib.rs`**

Two edits in `src-tauri/src/lib.rs`.

**Edit 3a:** Add clipboard-manager plugin initialization. Find the block:
```rust
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_liquid_glass::init())
```

Replace with (add clipboard-manager line after dialog):
```rust
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_liquid_glass::init())
```

**Edit 3b:** Register the `write_log_file` command. In `invoke_handler![...]`, add a new line near the end of the list. The exact insertion point: after the last `commands::...` line in the macro. Find the closing `])` of `tauri::generate_handler![`. Add this line just before that closing:
```rust
            // Log export
            commands::log_export::write_log_file,
```

- [ ] **Step 4: Verify Rust build**

```bash
cd src-tauri && cargo check 2>&1 | tail -20 ; cd ..
```

Expected: completes without errors.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/commands/log_export.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat: add write_log_file Rust command and clipboard-manager plugin"
```

---

## Task 3: Update capabilities

**Files:**
- Modify: `src-tauri/capabilities/default.json`

- [ ] **Step 1: Add permissions**

Open `src-tauri/capabilities/default.json`. Replace the `permissions` array:

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for the main window",
  "windows": ["main"],
  "permissions": [
    "core:default",
    "core:window:allow-set-theme",
    "opener:default",
    "updater:default",
    "dialog:allow-open",
    "dialog:allow-save",
    "clipboard-manager:allow-write-text",
    "liquid-glass:default"
  ]
}
```

- [ ] **Step 2: Verify build**

```bash
npm run build
```

Expected: exit 0. (Tauri schema validation may happen at dev/build of Rust — but frontend build alone should pass.)

Additionally run:
```bash
cd src-tauri && cargo check 2>&1 | tail -10 ; cd ..
```

Expected: completes without errors.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/capabilities/default.json
git commit -m "feat: allow dialog save and clipboard write-text permissions"
```

---

## Task 4: Create `src/lib/log-export.ts`

**Files:**
- Create: `src/lib/log-export.ts`

- [ ] **Step 1: Create file**

```ts
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

interface LogEntryLike {
  plainText: string;
}

export function buildLogContent(entries: readonly LogEntryLike[]): string {
  return entries.map((e) => e.plainText).join("\n");
}

export function buildDefaultFilename(containerId: string, now: Date = new Date()): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  const yyyy = now.getFullYear();
  const mm = pad(now.getMonth() + 1);
  const dd = pad(now.getDate());
  const hh = pad(now.getHours());
  const mi = pad(now.getMinutes());
  const ss = pad(now.getSeconds());
  const shortId = containerId.slice(0, 12);
  return `${shortId}-${yyyy}${mm}${dd}-${hh}${mi}${ss}.log`;
}

export async function copyLogs(entries: readonly LogEntryLike[]): Promise<void> {
  await writeText(buildLogContent(entries));
}

export async function exportLogs(
  entries: readonly LogEntryLike[],
  containerId: string
): Promise<boolean> {
  const defaultPath = buildDefaultFilename(containerId);
  const chosen = await save({
    defaultPath,
    filters: [{ name: "Log", extensions: ["log"] }],
  });
  if (!chosen) return false;
  await invoke("write_log_file", { path: chosen, content: buildLogContent(entries) });
  return true;
}
```

Notes:
- `LogEntryLike` interface avoids circular import with `ContainerLogs`; any object with `plainText: string` works
- `exportLogs` returns `false` when user cancels — caller can distinguish cancel from error (which throws)

- [ ] **Step 2: Typecheck**

```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/lib/log-export.ts
git commit -m "feat: add log-export utility (copy + save dialog)"
```

---

## Task 5: Add Copy/Export buttons to LogToolbar

**Files:**
- Modify: `src/components/containers/LogToolbar.tsx`

- [ ] **Step 1: Overwrite `src/components/containers/LogToolbar.tsx`**

Full replacement:

```tsx
import { useState } from "react";
import { Check, Copy, Download, Search, X } from "lucide-react";
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
  onCopy: () => Promise<void> | void;
  onExport: () => Promise<void> | void;
  exportDisabled: boolean;
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
  onCopy,
  onExport,
  exportDisabled,
}: LogToolbarProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await onCopy();
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch (e) {
      console.error("Copy failed:", e);
      window.alert(`Copy failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const handleExport = async () => {
    try {
      await onExport();
    } catch (e) {
      console.error("Export failed:", e);
      window.alert(`Export failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

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
          variant="ghost"
          size="sm"
          onClick={handleCopy}
          disabled={exportDisabled}
          aria-label="Copy visible logs"
          title="Copy visible logs"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleExport}
          disabled={exportDisabled}
          aria-label="Export visible logs"
          title="Export visible logs"
        >
          <Download className="h-3.5 w-3.5" />
        </Button>
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

Changes vs prior:
- Added imports: `useState`, `Check`, `Copy`, `Download`
- Added three props: `onCopy`, `onExport`, `exportDisabled`
- Added local `copied` state, `handleCopy`, `handleExport`
- Inserted two buttons between the counter and the search button

- [ ] **Step 2: Typecheck**

```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/containers/LogToolbar.tsx
git commit -m "feat: add Copy and Export buttons to LogToolbar"
```

---

## Task 6: Wire handlers in ContainerLogs

**Files:**
- Modify: `src/components/containers/ContainerLogs.tsx`

- [ ] **Step 1: Wire onCopy/onExport**

In `src/components/containers/ContainerLogs.tsx`:

**Edit 1a:** Add import near the top (after `import { pushBounded } from "@/lib/log-buffer";`):
```tsx
import { copyLogs, exportLogs } from "@/lib/log-export";
```

**Edit 1b:** Add two useCallback handlers. Insert immediately after the existing `handleSearchPrev` definition (search for `const handleSearchPrev`) and before the `return (`:

```tsx
  const handleCopy = useCallback(async () => {
    await copyLogs(visibleLogs);
  }, [visibleLogs]);

  const handleExport = useCallback(async () => {
    await exportLogs(visibleLogs, containerId);
  }, [visibleLogs, containerId]);
```

**Edit 1c:** Pass props to `<LogToolbar ... />`. In the JSX, find the `<LogToolbar` element and add three new props just before the closing `/>`:

```tsx
          onCopy={handleCopy}
          onExport={handleExport}
          exportDisabled={visibleLogs.length === 0}
```

After the edit, the `<LogToolbar>` block should look like:

```tsx
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
```

- [ ] **Step 2: Typecheck**

```bash
npm run build
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/components/containers/ContainerLogs.tsx
git commit -m "feat: wire copy and export handlers in ContainerLogs"
```

---

## Task 7: Manual verification

**Files:** (none)

- [ ] **Step 1: Launch dev build**

```bash
npm run tauri dev
```

Expected: app opens, no runtime errors in console.

- [ ] **Step 2: Start a logging container**

```bash
container run --name copy-test -d alpine sh -c 'i=0; while true; do printf "\033[31mERR\033[0m line %d\n" $i; i=$((i+1)); sleep 0.1; done'
```

Open the container's logs view. Wait ~5 seconds so several lines accumulate.

- [ ] **Step 3: Copy — no filter**

Click the Copy button. Expected: icon briefly flips to checkmark for ~1.5s.

Paste into a text editor. Expected: plain text without ANSI escape codes (no `[31m`), one line per log entry.

- [ ] **Step 4: Copy — with filter**

Type `line 5` in the Filter input. Verify the counter drops to ~1 line matching (`line 5`). Click Copy. Paste. Expected: only the filtered line(s).

Clear the filter.

- [ ] **Step 5: Export — save path**

Click the Export button. Expected: macOS save dialog with default filename like `abc123def456-20260417-160530.log` (depending on actual containerId prefix + current timestamp).

Save to Desktop. Open the file. Expected: plain text content, UTF-8, same as copy format.

- [ ] **Step 6: Export — cancel**

Click Export again. Click Cancel in the dialog. Expected: no alert, no file written, app remains responsive.

- [ ] **Step 7: Empty state**

Apply a filter that matches nothing (e.g. `zzzz_no_match`). Expected: Copy/Export buttons disabled.

Clear filter.

- [ ] **Step 8: Cleanup**

```bash
container stop copy-test && container delete copy-test
```

- [ ] **Step 9: No commit** (verification only)

---

## Self-Review

**Spec coverage**
- Clipboard plugin added — Task 1 ✓
- Rust `write_log_file` command — Task 2 ✓
- Capabilities: dialog save + clipboard write-text — Task 3 ✓
- `src/lib/log-export.ts` (buildLogContent, buildDefaultFilename, copyLogs, exportLogs) — Task 4 ✓
- LogToolbar Copy/Export buttons + copied state — Task 5 ✓
- ContainerLogs handler wiring — Task 6 ✓
- plainText scope (visibleLogs only) — Tasks 4/6 ✓
- Default filename `{containerId12}-{YYYYMMDD-HHmmss}.log` — Task 4 ✓
- Disabled state when visibleLogs empty — Task 5/6 ✓
- Copy success icon feedback 1.5s — Task 5 ✓
- Cancel silent, error alert — Task 5 ✓

**Placeholder scan:** clean.

**Type consistency:**
- `LogEntryLike { plainText: string }` matches `LogEntry.plainText: string` — Task 4/6 consistent ✓
- `onCopy: () => Promise<void> | void` / `onExport: () => Promise<void> | void` / `exportDisabled: boolean` prop signatures match wiring — Task 5/6 ✓
- `invoke("write_log_file", { path, content })` camelCase keys match Rust `path: String, content: String` — Task 2 + Task 4 ✓ (Tauri's default serde rename is camelCase for params)
