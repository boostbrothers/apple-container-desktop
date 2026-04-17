# Container Log ANSI Color Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Apple Container CLI가 출력하는 ANSI 색상 코드를 `ContainerLogs` 뷰에서 올바르게 렌더링한다.

**Architecture:** 각 로그 라인을 `anser` 라이브러리로 파싱하여 `{ content, fg, bg, decoration }[]`로 변환 후 React `<span>` 요소로 매핑한다. 백엔드(Rust) 수정 없이 프론트엔드만 수정한다. 자동화 테스트 하네스가 없으므로 각 단계 후 `npm run build` 타입체크 + 수동 로그 뷰 검증을 수행한다.

**Tech Stack:** React 19, TypeScript, Tailwind CSS 4, `anser` 2.x

---

## File Structure

- **Create**: `src/components/containers/AnsiLine.tsx` — 한 줄의 ANSI 텍스트를 받아 styled spans로 렌더하는 순수 컴포넌트
- **Modify**: `src/components/containers/ContainerLogs.tsx` — `logs.join("\n")` 방식을 라인별 `<AnsiLine>` 매핑으로 교체, 강제 `text-green-400` 제거
- **Modify**: `package.json` / `package-lock.json` — `anser` 의존성 추가

---

## Task 1: Install anser dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [ ] **Step 1: Install anser**

Run:
```bash
npm install anser@^2.3.5
```

Expected: `package.json`의 `dependencies`에 `"anser": "^2.3.5"` 추가, `package-lock.json` 갱신.

- [ ] **Step 2: Verify types resolve**

Run:
```bash
node -e "const a = require('anser'); console.log(a.ansiToJson('\x1b[31mred\x1b[0m', { use_classes: false }))"
```

Expected stdout: JSON array로 최소 2개의 엔트리 출력(빨강 span + reset). 예:
```
[
  { content: 'red', fg: 'rgb(187, 0, 0)', bg: null, fg_truecolor: null, bg_truecolor: null, clearLine: false, was_processed: false, decoration: null, decorations: [] },
  ...
]
```

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add anser for ANSI color parsing"
```

---

## Task 2: Create AnsiLine component

**Files:**
- Create: `src/components/containers/AnsiLine.tsx`

- [ ] **Step 1: Create the component**

Create `src/components/containers/AnsiLine.tsx` with this exact content:

```tsx
import Anser, { type AnserJsonEntry } from "anser";
import type { CSSProperties } from "react";

interface AnsiLineProps {
  text: string;
}

function entryStyle(entry: AnserJsonEntry): CSSProperties {
  const style: CSSProperties = {};
  let color = entry.fg ? `rgb(${entry.fg})` : undefined;
  let background = entry.bg ? `rgb(${entry.bg})` : undefined;

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

  return style;
}

export function AnsiLine({ text }: AnsiLineProps) {
  let entries: AnserJsonEntry[];
  try {
    entries = Anser.ansiToJson(text, {
      json: true,
      remove_empty: true,
      use_classes: false,
    });
  } catch {
    return <div style={{ minHeight: "1em" }}>{text}</div>;
  }

  if (entries.length === 0) {
    return <div style={{ minHeight: "1em" }}>&nbsp;</div>;
  }

  return (
    <div style={{ minHeight: "1em" }}>
      {entries.map((entry, index) => (
        <span key={index} style={entryStyle(entry)}>
          {entry.content}
        </span>
      ))}
    </div>
  );
}
```

**Notes on the code:**
- `anser`의 `fg`/`bg`는 `"r, g, b"` 문자열을 반환하므로 `rgb(${entry.fg})`로 감싼다(문서/소스 확인됨)
- `decorations` 배열(복수) 사용: 구버전 `decoration`(단수)은 deprecated
- `remove_empty: true`로 의미 없는 빈 엔트리 제거
- `use_classes: false`로 인라인 style 모드 사용(별도 CSS 추가 없이 동작)
- `reverse` 처리는 색상 스왑 후 다른 decoration 적용

- [ ] **Step 2: Typecheck**

Run:
```bash
npm run build
```

Expected: `tsc`가 에러 없이 통과. (`vite build`도 통과하면 번들링도 OK.)

만약 `Anser` 관련 타입 에러가 발생하면: `node_modules/anser/lib/index.d.ts`를 열어 실제 export 형태를 확인하고 import 방식을 조정(`import Anser from "anser"` 또는 `import * as Anser from "anser"`).

- [ ] **Step 3: Commit**

```bash
git add src/components/containers/AnsiLine.tsx
git commit -m "feat: add AnsiLine component for ANSI color rendering"
```

---

## Task 3: Wire AnsiLine into ContainerLogs

**Files:**
- Modify: `src/components/containers/ContainerLogs.tsx`

- [ ] **Step 1: Replace log rendering**

기존 `ContainerLogs.tsx` 전체를 아래로 교체:

```tsx
import { useEffect, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { api } from "../../lib/tauri";
import { AnsiLine } from "./AnsiLine";

interface ContainerLogsProps {
  containerId: string;
  onBack: () => void;
}

export function ContainerLogs({ containerId, onBack }: ContainerLogsProps) {
  const [logs, setLogs] = useState<string[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.streamContainerLogs(containerId);
    const unlisten = listen<string>(`container-log-${containerId}`, (event) => {
      setLogs((prev) => [...prev, event.payload]);
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
          {logs.map((line, i) => (
            <AnsiLine key={i} text={line} />
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
```

**Changes from previous version:**
- `<pre>` → `<div>`(AnsiLine이 내부에 div를 반환하므로 pre 중첩을 피함)
- `text-green-400` → `text-zinc-200` (ANSI 없는 로그의 폴백 색)
- `logs.join("\n")` → `logs.map(... <AnsiLine ... />)`
- `whitespace-pre-wrap` 유지(긴 줄 wrap)
- `font-mono`, `text-xs` 유지
- `bottomRef` 위치 유지

- [ ] **Step 2: Typecheck + build**

Run:
```bash
npm run build
```

Expected: 에러 없이 통과.

- [ ] **Step 3: Commit**

```bash
git add src/components/containers/ContainerLogs.tsx
git commit -m "feat: render container logs with ANSI color support"
```

---

## Task 4: Manual verification

**Files:** (none — runtime verification)

- [ ] **Step 1: Start dev server**

Run:
```bash
npm run tauri dev
```

Expected: Tauri 앱 윈도우 기동. 에러 없이 UI 렌더.

- [ ] **Step 2: Create a container that emits ANSI colors**

앱에서 혹은 별도 터미널에서 다음 컨테이너 실행(앱 UI로 run 하거나 CLI 직접 사용):

```bash
container run --name ansi-test -d alpine sh -c 'while true; do printf "\033[31mRED\033[0m \033[32mGREEN\033[0m \033[1;33mBOLD YELLOW\033[0m \033[4;36mUNDER CYAN\033[0m plain\n"; sleep 1; done'
```

- [ ] **Step 3: Open container log view**

앱에서 `ansi-test` 컨테이너 선택 → Logs 버튼 클릭.

Expected:
- `RED` 텍스트는 빨간색
- `GREEN`은 초록
- `BOLD YELLOW`는 굵고 노란색
- `UNDER CYAN`은 밑줄 + 청록
- `plain`은 기본 `text-zinc-200`
- `[31m` 같은 raw escape 문자 없음

- [ ] **Step 4: Test fallback (no ANSI)**

```bash
container run --name plain-test -d alpine sh -c 'while true; do echo "plain log line"; sleep 1; done'
```

앱에서 Logs 확인. Expected: 모든 텍스트가 `text-zinc-200`(연한 회색)으로 일관되게 표시.

- [ ] **Step 5: Regression check**

- Auto-scroll On 상태에서 새 로그가 들어올 때 맨 아래로 스크롤되는지
- Auto-scroll Off 상태에서 스크롤 위치가 유지되는지
- 뒤로가기(`← Back`) 동작 정상

- [ ] **Step 6: Cleanup**

```bash
container stop ansi-test plain-test
container delete ansi-test plain-test
```

- [ ] **Step 7: No commit needed** (verification only)

---

## Self-Review Notes

**Spec coverage:**
- Library choice (anser) — Task 1 ✓
- AnsiLine component w/ span mapping — Task 2 ✓
- ContainerLogs integration — Task 3 ✓
- 색상 스왑 (reverse), bold/italic/underline/dim — Task 2 code ✓
- 폴백 색 `text-zinc-200` — Task 3 ✓
- 빈 줄 `min-height: 1em` — Task 2 code ✓
- 에러 처리 try/catch — Task 2 code ✓
- 수동 검증 절차 — Task 4 ✓
- 백엔드 미수정 — (명시적으로 없음) ✓

**Placeholder scan:** 없음. 모든 step에 실제 코드/명령어 포함.

**Type consistency:** `AnserJsonEntry`, `decorations` 배열 사용, `entry.fg`/`bg` 문자열 처리 — Task 2와 사용처 일관.
