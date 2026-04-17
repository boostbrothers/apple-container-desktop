# Container Log Viewer Enhancements

## Problem

방금 도입한 ANSI 색상 렌더러(`ContainerLogs` + `AnsiLine`)가 돌아가지만 실사용에서 네 가지 한계가 드러난다.

1. **성능**: `logs` 배열이 append-only로 무한 증가. 새 라인 1개가 도착할 때마다 전체 `AnsiLine` 리스트가 리렌더되고 ANSI 파싱도 매번 반복된다.
2. **Decoration 누락**: `blink`, `hidden` 시퀀스가 무시되어 `hidden`이 원래 의도(숨김)와 반대로 표시된다.
3. **가독성**: 표준 ANSI `bright_black`(85,85,85) 등 어두운 색이 `bg-black/90`에서 거의 보이지 않는다.
4. **탐색/분석 부재**: 수천 라인의 로그에서 특정 문자열을 찾거나, 관심 있는 라인만 추려 보는 수단이 없다.

## Goal

로그 뷰어에 다음을 추가한다.

- 렌더링 성능 개선 (memo + 버퍼 상한)
- ANSI decoration 완성도 (hidden/blink 명시 처리)
- 어두운 배경 팔레트 가독성 보정
- `Cmd+F` 스타일 검색 (하이라이트 + 이전/다음 네비게이션)
- 서브스트링 필터 (비매치 라인 감춤)

백엔드(`src-tauri`)는 건드리지 않는다.

## Non-Goals

- 정규식 검색 (후속 과제, YAGNI)
- 로그 레벨 기반 필터(INFO/WARN/ERROR 등) — 컨테이너 로그 포맷이 다양하여 정규식 필요하므로 이번 범위 밖
- 로그 내보내기/다운로드
- 가상화(react-window 등) — 버퍼 상한이 먼저이며, 실측 후 후속 판단
- 검색/필터 상태 영속화 (창 전환/재진입 시 초기화)

## Approach

### Module Structure

현재 `ContainerLogs.tsx`는 스트림 수신 + 자동 스크롤 + 렌더를 모두 담당. 기능을 추가하면 단일 파일이 과밀해진다. 다음과 같이 분리한다.

- `src/components/containers/ContainerLogs.tsx` — 상위 컨테이너: 상태 소유, 스트림 구독, 자동 스크롤, `LogToolbar` + `LogView` 배치
- `src/components/containers/LogToolbar.tsx` — 헤더 오른쪽 툴바: 검색 토글/입력/카운터/네비게이션, 필터 입력
- `src/components/containers/LogView.tsx` — 실제 라인 렌더(가상화가 들어갈 때를 대비한 경계)
- `src/components/containers/AnsiLine.tsx` — `React.memo` 적용, `highlight` prop 추가(검색어 하이라이트), `hidden` decoration 처리
- `src/lib/ansi-palette.ts` **신규** — 색상 보정 유틸(예: `brightenForDarkBg(rgb)`)
- `src/lib/log-buffer.ts` **신규** — append-with-cap 순수 함수 `pushBounded(arr, item, max)`

### State Shape

`ContainerLogs`가 소유:

```ts
interface LogEntry {
  id: number;       // monotonic, 버퍼 상한으로 인덱스가 밀리므로 필수
  text: string;     // 원문(ANSI 포함)
  plainText: string; // 검색/필터 매치용 (Anser.ansiToText(text))
}

const MAX_LINES = 5000;

const [logs, setLogs] = useState<LogEntry[]>([]);
const [autoScroll, setAutoScroll] = useState(true);
const [search, setSearch] = useState<{ open: boolean; query: string; activeIndex: number }>({
  open: false, query: "", activeIndex: 0,
});
const [filter, setFilter] = useState("");
const nextId = useRef(0);
```

- `id`는 `useRef<number>` 카운터로 부여. 이벤트 핸들러에서 `nextId.current++`.
- 검색 활성(`open && query`) 시 `autoScroll`을 자동으로 false로 강제.

### Performance: memo + ring buffer

- `AnsiLine`을 `React.memo`로 감싸 prop(`text`, `highlight`)이 동일하면 리렌더 스킵.
- `setLogs((prev) => pushBounded(prev, { id: nextId.current++, text: payload, plainText: Anser.ansiToText(payload) }, MAX_LINES))`
- `pushBounded`: `arr.length < max ? [...arr, item] : [...arr.slice(1), item]`
- 리스트 key는 `entry.id` 사용(인덱스 금지).

### ANSI Decorations

`AnsiLine` `entryStyle`에 추가:

- `hidden` → `visibility: "hidden"` (레이아웃은 유지, 텍스트만 숨김)
- `blink` → 무시(의도적 drop, 접근성 고려 — 주석으로 이유 명시)

### Palette Tuning

`src/lib/ansi-palette.ts`에 다음 유틸:

```ts
// "r, g, b" 문자열 → 어두운 배경에서 가독성 부족한 색을 밝게 보정
export function brightenForDarkBg(rgb: string): string;
```

동작:
1. 입력 `"r, g, b"` 파싱 → 세 값이 모두 ≤ 100이면 전체적으로 어두운 색으로 판단
2. 최소 휘도 보장: 각 채널을 `Math.max(ch, 110)`로 클램프. 원래 색감은 비례 유지(가산).
3. 파싱 실패 시 원문 그대로 반환

`AnsiLine.entryStyle`에서 `rgb(${brightenForDarkBg(entry.fg)})`로 적용. 배경색은 보정 제외(원본 유지).

### Search

**UI**:
- `LogToolbar`의 오른쪽에 돋보기 버튼(Lucide `Search` 아이콘). 클릭 또는 `Cmd+F`/`Ctrl+F`로 토글.
- 활성 시 `LogToolbar` 아래에 인라인 입력 바: `[ ______ ] 3/42 [↑] [↓] [×]`
- `Esc` 또는 × 버튼으로 닫기. 닫을 때 `query`는 유지(재오픈 시 복원), 단 `activeIndex=0`.

**동작**:
- 입력 중 `query`가 바뀌면 `activeIndex`를 0으로 초기화
- `matches: number[]` — query에 매치되는 `entry.id` 리스트(라인 단위). `useMemo`로 계산(deps: `visibleLogs`, `query`). 매치 판단은 `entry.plainText`에 대해 case-insensitive `includes`
- `activeIndex`: `matches` 배열에서의 인덱스(0-based). 현재 활성 매치 entry.id = `matches[activeIndex]`
- 카운터: `{activeIndex + 1} / {matches.length}`. 매치 없으면 `0 / 0`, 회색 처리
- `Enter` → 다음(`activeIndex = (activeIndex + 1) % matches.length`), `Shift+Enter` → 이전. `↑`/`↓` 버튼도 동일
- 현재 활성 매치 라인(`matches[activeIndex]`에 해당하는 `LogEntry`가 렌더된 DOM 노드)으로 `scrollIntoView({ block: "center" })`. 같은 라인 내 여러 occurrence가 있어도 라인 단위 네비게이션이며, 라인 내 모든 매치를 하이라이트
- 검색 활성 시 `autoScroll = false` 강제 (사용자가 탐색 중이므로)
- 검색 닫기: 활성 매치 유지 없이 단순 닫기
- **Case-insensitive 고정**

**하이라이트**:
- `AnsiLine`에 `highlight?: { query: string; isActive: boolean }` prop 추가
- query가 있으면 각 `entry.content`를 `splitByMatch(query, content)`로 쪼개 매치 구간만 `<mark>`로 감쌈
- `<mark>` 클래스: 일반 매치 `bg-yellow-400/70 text-black`, 활성 매치(현재 선택된 `activeIndex`) `bg-yellow-300 ring-2 ring-yellow-200`
- `isActive`는 라인 단위(`LogView`가 현재 활성 매치가 속한 라인에만 `isActive=true` 전달)

### Filter

**UI**:
- `LogToolbar` 왼쪽: `Filter: [ __________ ] [×]`
- 비어있으면 전체 표시. `showingCount/totalCount`를 툴바에 표시 (예: `123 / 5,000`)

**동작**:
- Case-insensitive 서브스트링 매치 (대상: `entry.plainText`)
- `visibleLogs = useMemo(() => filter ? logs.filter((l) => l.plainText.toLowerCase().includes(filter.toLowerCase())) : logs, [logs, filter])`
- 검색은 `visibleLogs` 기준 동작 (필터 먼저 적용)
- 필터로 인해 활성 매치가 사라지면 `activeIndex`를 0으로 재설정

### Keyboard Shortcuts

전역 리스너 아닌, `ContainerLogs` 루트 `<div>`에 `tabIndex={0}` + `onKeyDown`:

- `Cmd+F` / `Ctrl+F` (macOS는 meta, 기타는 ctrl) → 검색 토글. `preventDefault()`.
- 검색 입력 포커스 상태에서 `Esc` → 검색 닫기
- 입력 필드 밖에서 `/` (단일 슬래시) → 검색 오픈 (Vim 스타일, 선택적 — 포함)

### Auto-Scroll 상호작용

- 새 로그 도착 시 기존처럼 `scrollIntoView`
- 단, `search.open && search.query` 이거나 사용자가 스크롤로 맨 아래에서 벗어난 상태면 auto-scroll 비활성
- 기존 "Auto-scroll: On/Off" 버튼은 그대로 유지 (수동 토글)
- `search.open` 상태에서 버튼 UI는 비활성화(disabled) 처리

## Error Handling

- `pushBounded`에 정적 max 사용, 잘못된 입력 방어 불필요
- `brightenForDarkBg` 파싱 실패 시 원문 반환 (try/catch 없이 정규식 match 결과로 분기)
- 검색 query가 정규식 특수문자 포함: 문자열 매치이므로 특별 처리 불필요

## Testing

자동화 테스트 여전히 없음. 수동 검증 시나리오 (구현 플랜에 세부화):

1. **성능**: 빠른 로그 스트림(`sleep 0.05`) 30초 실행. React DevTools로 이전 라인들이 리렌더되지 않음을 확인
2. **버퍼 상한**: 6,000라인 이상 방출 → `logs.length ≤ 5,000`, 가장 오래된 라인이 drop되는지 시각 확인
3. **`hidden`**: `printf "visible \033[8mhidden\033[0m end\n"` — "hidden"이 레이아웃은 차지하되 보이지 않음
4. **팔레트**: `printf "\033[90mbright black\033[0m\n"` — 읽을 수 있는 밝기로 표시
5. **검색**: `Cmd+F` → 쿼리 입력 → 카운터/하이라이트 확인, Enter/Shift+Enter 네비게이션, Esc 닫기
6. **필터**: 필터 입력 후 매치 라인만 남는지, 카운터 표시, 검색과 동시 사용

## File Changes

**신규**:
- `src/components/containers/LogToolbar.tsx`
- `src/components/containers/LogView.tsx`
- `src/lib/ansi-palette.ts`
- `src/lib/log-buffer.ts`

**수정**:
- `src/components/containers/ContainerLogs.tsx`
- `src/components/containers/AnsiLine.tsx`

## Risks

- **키보드 단축키 충돌**: `Cmd+F`는 브라우저 기본 검색. Tauri WebView에서는 preventDefault로 가로채면 OK. 사용자가 당혹할 수 있으므로 툴바에 단축키 힌트 표시.
- **검색 정확도**: `LogEntry.plainText`를 `Anser.ansiToText(text)`로 미리 계산해 저장. 검색/필터는 이 필드를 대상으로 수행 → ANSI escape가 매치 결과에 섞이지 않는다.
- **scrollIntoView 호환성**: `block: "center"`는 최신 브라우저에서 지원. Tauri WebView는 Chromium 최신이라 OK.
- **팔레트 보정 과도**: 클램프 값(110)이 너무 높으면 원본 색감 손실. 보정 전/후 샘플 비교로 튜닝(수동 검증 4번).
