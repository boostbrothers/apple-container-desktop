# Container Log ANSI Color Rendering

## Problem

`ContainerLogs.tsx`는 Apple Container CLI(`container logs -f`)의 stdout을 그대로 `<pre>` 안에 렌더링한다. 대부분의 CLI/애플리케이션 로그는 ANSI escape sequence(예: `\x1b[31m`, `\x1b[0m`)를 포함하는데, 브라우저는 이 시퀀스를 해석하지 않으므로 깨진 문자(`[31m` 등)가 그대로 노출된다. 또한 전체 로그에 `text-green-400`이 강제로 걸려 있어 원본 색상이 있어도 묻힌다.

## Goal

ANSI escape sequence를 파싱하여 색상/스타일을 React 엘리먼트로 렌더링한다. XSS에 안전해야 하며, 기존 스크롤·자동 스크롤·이벤트 스트리밍 구조는 그대로 유지한다.

## Non-Goals

- 인터랙티브 터미널 기능(커서 이동, 진행률 바 덮어쓰기, `\r` 처리 등). 이는 xterm.js 영역이며 본 작업 범위 밖.
- 로그 검색/필터링/복사 UX 변경.
- 백엔드(`src-tauri/src/commands/container.rs`) 수정. 현재 라인 단위 스트리밍 계약을 유지한다.

## Approach

`anser` 라이브러리를 추가하여 각 로그 라인을 `Anser.ansiToJson(text, { use_classes: false })`로 파싱하고, 결과 배열을 React `<span>` 요소로 매핑한다. HTML 문자열 주입 방식은 사용하지 않으며, React가 콘텐츠를 문자열로 취급하도록 한다(자동 이스케이프).

### Library Choice

`anser`를 선택한 이유:

- Jupyter, CodeSandbox 등에서 검증된 파서
- 번들 크기 작음(~5KB)
- `ansiToJson()`이 구조화된 JSON을 반환 → React 친화적, XSS 안전
- 타입 정의 내장

대안이었던 `ansi-to-html`은 HTML 문자열을 반환하므로 innerHTML 경로를 타야 하고, React 패턴과 맞지 않아 제외.

### Data Flow

```
Apple Container CLI stdout (with ANSI)
  → src-tauri read_line → emit "container-log-${id}"
  → React listen → setLogs(prev => [...prev, payload])
  → AnsiLine({ text }) → Anser.ansiToJson(text) → <span>[]
```

### Components

**`AnsiLine`** — 새로 추가되는 presentational 컴포넌트.

- Props: `{ text: string }`
- 컴포넌트는 `<div>`를 반환하며 그 안에 파싱된 `<span>` 리스트를 포함(한 줄 = 한 div)
- `Anser.ansiToJson(text, { json: true, remove_empty: true, use_classes: false })` 호출
- 반환된 `AnserJsonEntry[]`를 순회하여 `<span>` 렌더
  - `style.color`: `entry.fg` (anser가 `rgb(r,g,b)` 또는 named color 문자열 반환)
  - `style.backgroundColor`: `entry.bg`
  - `decoration` (bold, italic, underline, dim, reverse)은 해당 CSS로 매핑
    - `bold` → `fontWeight: 600`
    - `italic` → `fontStyle: italic`
    - `underline` → `textDecoration: underline`
    - `dim` → `opacity: 0.6`
    - `reverse` → `color`/`backgroundColor` 스왑
- key는 엔트리 인덱스 사용

**`ContainerLogs`** — 수정.

- `<pre>` 클래스에서 `text-green-400` 제거, 기본 텍스트 색을 `text-zinc-200`으로 변경(ANSI가 없는 줄의 폴백)
- `logs.join("\n")` 한 덩어리 렌더링 대신 `logs.map((line, i) => <AnsiLine key={i} text={line} />)` 형태로 렌더(라인별 div는 `AnsiLine`이 제공)
- `whitespace-pre-wrap`, `font-mono` 유지

### Color Palette

anser가 반환하는 기본 ANSI 색상은 표준 xterm 팔레트다. 어두운 배경(`bg-black/90`) 대비 가독성이 낮은 색(기본 blue `rgb(0,0,187)` 등)을 보정할지 여부:

- 초기 구현에서는 anser 기본 팔레트를 그대로 사용. 추후 가독성 이슈가 보고되면 별도 팔레트 매핑 도입.
- DESIGN.md의 "Apple Blue(#0071e3) ONLY for interactive elements" 원칙은 ANSI blue(일반 텍스트용)와 충돌하지 않음. 로그 영역의 ANSI blue는 원본 출력 재현일 뿐 인터랙션 요소가 아니므로 허용.

## Error Handling

- `anser` 파싱 실패는 실질적으로 발생하지 않음(라이브러리가 어떤 입력이든 문자열로 fallback). 예외가 발생할 경우 try/catch로 감싸 원문 plain text로 렌더되도록 한다.
- 빈 줄(`""`)은 `<div>` 높이가 0이 되지 않도록 `min-height: 1em` 처리.

## Testing

자동 테스트 없음(현재 프로젝트에 프론트엔드 테스트 하네스 없음). 수동 검증:

1. `container run -it --rm alpine sh -c 'printf "\033[31mred\033[0m \033[32mgreen\033[0m \033[1mbold\033[0m\n"'` 실행 후 로그 뷰어에서 색상 확인
2. 색상이 없는 일반 로그(`echo hello`)에서 폴백 색상(`text-zinc-200`) 확인
3. 긴 로그로 자동 스크롤 동작 회귀 확인
4. Auto-scroll off 상태에서 스크롤 위치 유지 확인

## File Changes

- `package.json`: `anser` 의존성 추가
- `src/components/containers/ContainerLogs.tsx`: `AnsiLine` 추가, 렌더 구조 변경, 색상 클래스 조정

변경 파일 총 2개. 백엔드 변경 없음.

## Risks

- **번들 크기**: `anser`는 ~5KB로 무시할 수 있는 수준.
- **성능**: 매 라인 파싱이지만 로그 스트림 빈도와 현재 `setLogs((prev) => [...prev, payload])` 패턴(전체 리렌더) 대비 무시할 수준. 로그가 매우 빠른 경우는 별도 가상화 이슈이며 본 작업 범위 밖.
- **색상 가독성**: 어두운 배경에서 표준 ANSI blue가 어두울 수 있음. 초기 버전은 그대로 두고 후속 튜닝.
