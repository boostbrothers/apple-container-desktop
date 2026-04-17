# Container Log Copy & Export

## Problem

현재 로그 뷰어는 텍스트 선택 후 `Cmd+C`로 부분 복사만 가능하다. 수천 라인 중 필터로 추린 결과를 한 번에 복사하거나, 외부 에디터/분석 도구로 보내기 위해 파일로 저장하는 수단이 없다.

## Goal

`LogToolbar`에 "Copy"와 "Export" 버튼 두 개를 추가한다. 양쪽 모두 현재 `visibleLogs`(필터 반영)를 plainText(ANSI escape 제거)로 내보낸다.

## Non-Goals

- 포맷 선택 UI (ANSI 원문 vs plain) — 단일 포맷(plain)만 제공. 필요 시 후속
- 전체 로그 vs 필터 선택 UI — visibleLogs만 대상. 필터 해제하면 전체가 되므로 UI에 별도 선택지 불필요
- JSON/CSV 구조화 내보내기 — 후속
- 여러 컨테이너 묶어 내보내기 — 범위 밖
- 스트리밍 중 실시간 파일 append — 범위 밖 (스냅샷만)
- 선택 영역만 복사/내보내기 — 브라우저 기본 `Cmd+C`가 이미 처리

## Approach

### Clipboard

- `tauri-plugin-clipboard-manager` 추가 (Rust + JS 패키지)
- 프론트엔드는 `@tauri-apps/plugin-clipboard-manager`의 `writeText`만 사용
- 내부적으로 `visibleLogs.map(e => e.plainText).join("\n")` 결과를 기록

### Export

- 기존 `@tauri-apps/plugin-dialog`의 `save` 다이얼로그로 경로 받음 (이미 `dialog:allow-open`이 등록되어 있으므로 `dialog:allow-save`만 추가)
- 저장은 Tauri의 `@tauri-apps/plugin-fs`로 수행 — 현재 미설치, 새 의존성 추가
  - 대안: Rust 측에 custom command `write_log_file(path, content)`를 추가해 `std::fs::write`로 기록. 플러그인 추가 없이 처리 가능하고 capability 관리가 단순. **이쪽을 선택**.
- 파일명 기본값: `{containerId.slice(0,12)}-{YYYYMMDD-HHmmss}.log` (예: `abc123def456-20260417-160530.log`)
- 내용: 복사와 동일 (plainText 라인 `\n` 조인)

### UI

`LogToolbar`의 search 토글 버튼 왼쪽(`showingCount/totalCount` 라벨 우측)에 두 개 아이콘 버튼 추가:

- Copy 버튼: Lucide `Copy` 아이콘
- Export 버튼: Lucide `Download` 아이콘
- 둘 다 `Button variant="ghost" size="sm"`, 크기 통일
- Disabled 상태: `visibleLogs.length === 0`일 때
- Copy 성공 피드백: 1.5초간 아이콘을 `Check`로 전환

### Data Flow

```
LogToolbar onCopy click
  → onCopy prop (ContainerLogs에서 주입)
  → ContainerLogs: writeText(visibleLogs.map(e => e.plainText).join("\n"))
  → LogToolbar state: `copied=true` (1.5s 후 false)

LogToolbar onExport click
  → onExport prop
  → ContainerLogs:
    - dialog.save({ defaultPath, filters: [{ name: "Log", extensions: ["log"] }] })
    - cancel 시 no-op
    - Rust command `write_log_file(path, content)` 호출
    - 성공 시 별도 알림 없음 (파일이 지정 경로에 생성됨) — 실패 시 alert
```

### Rust Command

`src-tauri/src/commands/log_export.rs` 신규:

```rust
#[tauri::command]
pub async fn write_log_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| e.to_string())
}
```

`src-tauri/src/lib.rs`의 `invoke_handler`에 등록. 앱 내부 커스텀 커맨드는 보통 별도 capability 선언 불필요하지만, 빌드 시점에 ACL 오류가 발생하면 `capabilities/*.json`에 `"app:log_export:write_log_file"` 형태로 추가하여 해결. 구현 단계에서 실제 빌드 결과로 확정.

### Capabilities

- `dialog:allow-save` 추가 필요 (`dialog:allow-open`만 있음)
- `core:clipboard-manager:allow-write-text` 추가

### Files

**신규**:
- `src/lib/log-export.ts` — `buildLogContent(entries)`, `copyLogs(entries)`, `exportLogs(entries, containerId)` 세 함수
- `src-tauri/src/commands/log_export.rs` — `write_log_file` command

**수정**:
- `package.json` + `package-lock.json` — `@tauri-apps/plugin-clipboard-manager` 추가
- `src-tauri/Cargo.toml` — `tauri-plugin-clipboard-manager` 추가
- `src-tauri/src/lib.rs` — plugin 등록 + command 등록
- `src-tauri/src/commands/mod.rs` — `log_export` 모듈 노출
- `src-tauri/capabilities/*.json` — `dialog:allow-save`, `core:clipboard-manager:allow-write-text` 추가
- `src/components/containers/LogToolbar.tsx` — Copy/Export 버튼 + copied 상태
- `src/components/containers/ContainerLogs.tsx` — `onCopy`/`onExport` 핸들러 주입

## Error Handling

- `writeText` 실패: 콘솔 에러 로그 + alert (흔하지 않음)
- 다이얼로그 취소: silent (정상)
- 파일 쓰기 실패: alert with 메시지 (권한 오류 등)
- `visibleLogs.length === 0`: 버튼 자체가 disabled

## Testing

자동 테스트 없음. 수동 검증 (구현 플랜 세부화):

1. 로그 스트리밍 중 Copy 클릭 → 에디터에 붙여넣어 plainText만 보이는지 (ANSI escape 없음)
2. 필터 적용 후 Copy → 필터된 라인만 복사
3. Export 클릭 → save dialog, 기본 파일명 형태 확인, 저장 후 파일 내용 확인
4. 빈 로그 상태에서 버튼 disabled 확인
5. Export 도중 Cancel → 에러 없이 no-op
6. Copy 성공 시 아이콘 체크마크 → 1.5초 후 원복

## Risks

- **큰 로그 복사 성능**: 5,000라인 × 평균 100자 = 500KB. `writeText`는 동기 수준에서 OK. 더 큰 경우에도 Tauri clipboard는 무리 없음.
- **플러그인 버전 호환성**: `tauri-plugin-clipboard-manager` v2 — 현재 Tauri 2 계열과 호환. 기존 dialog/opener/updater와 같은 2.x 라인.
- **파일명의 콜론/슬래시**: timestamp 형식에서 `:` 사용 시 일부 파일 시스템에서 문제. `HHmmss`로 구분자 없이 처리해 방지.
- **Rust 커스텀 커맨드 vs fs 플러그인**: fs 플러그인은 범용 권한 표면이 넓다(allow-read, allow-write 등). 로그 저장만 하는 단일 커맨드가 보안 표면이 더 좁고 의도가 명확 → 선호.
