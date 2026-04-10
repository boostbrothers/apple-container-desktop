# DevContainer Configuration UI Design

## Overview

Colima Desktop의 devcontainer 프로젝트에서 `devcontainer.json` 설정을 GUI로 제어할 수 있는 기능을 추가한다. 새 프로젝트 생성 시에도 설정을 구성할 수 있고, 기존 프로젝트에서도 설정을 수정할 수 있다.

## Scope

- **지원 시나리오**: Image 기반 + Dockerfile 기반 (Docker Compose는 이후 확장)
- **UI 범위**: 핵심 속성은 폼 UI, 나머지는 JSON 에디터 폴백
- **파일 I/O**: Rust 백엔드에서 읽기/쓰기 + JSON Schema 검증

## 참조

- [devcontainer JSON Schema](https://raw.githubusercontent.com/devcontainers/spec/refs/heads/main/schemas/devContainer.base.schema.json)
- [devcontainer JSON Reference](https://containers.dev/implementors/json_reference/)

---

## 진입점

### 1. 기존 프로젝트 편집

- `ProjectDetail` (devcontainer 프로젝트 상세 뷰)에 "Settings" 버튼 추가
- 클릭 시 `DevcontainerConfigEditor` 컴포넌트를 표시
- Rust 백엔드가 `{workspace_path}/.devcontainer/devcontainer.json` 읽어서 반환

### 2. 새 프로젝트 생성

- "Add Devcontainer Project" 플로우에서 workspace 경로 선택 후
- 기존 `devcontainer.json`이 있으면 파싱해서 에디터에 표시
- 없으면 기본 템플릿(image 기반)으로 에디터 열기
- 저장 시 `.devcontainer/devcontainer.json` 파일 생성

---

## Rust 백엔드

### Tauri 커맨드 (3개)

#### `read_devcontainer_config`

- **입력**: `workspace_path: String`
- **동작**: `{workspace_path}/.devcontainer/devcontainer.json` 읽기, JSON 파싱
- **파일 없을 시**: 기본 템플릿 반환 (`{ "image": "mcr.microsoft.com/devcontainers/base:ubuntu" }`)
- **반환**: `{ config: serde_json::Value, exists: bool }`

#### `write_devcontainer_config`

- **입력**: `workspace_path: String, config: serde_json::Value`
- **동작**: 스키마 검증 → `.devcontainer/` 디렉토리 생성(없으면) → `devcontainer.json` 저장 (pretty print)
- **검증 실패 시**: 검증 에러 목록과 함께 Err 반환
- **반환**: `Result<(), String>` — 검증 에러는 JSON 직렬화된 `Vec<ValidationError>`로 에러 메시지에 포함, 파일 I/O 에러는 별도 문자열

#### `validate_devcontainer_config`

- **입력**: `config: serde_json::Value`
- **동작**: JSON Schema 검증만 수행 (저장 없이)
- **용도**: JSON 에디터에서 실시간 검증 피드백
- **반환**: `Vec<ValidationError>`

### ValidationError 구조체

```rust
#[derive(Debug, Serialize, Clone)]
pub struct ValidationError {
    pub path: String,      // JSON pointer (예: "/features")
    pub message: String,   // 사람이 읽을 수 있는 에러 메시지
}
```

### 스키마 검증

- `jsonschema` Rust 크레이트 사용
- 빌드 타임에 스키마 임베드: `src-tauri/schemas/devContainer.base.schema.json`
- 검증 에러를 `ValidationError` 목록으로 변환하여 프론트엔드에 전달

### 파일 구조

```
src-tauri/
├── schemas/
│   └── devContainer.base.schema.json
└── src/commands/
    └── devcontainer_config.rs          # 기존 devcontainer.rs와 분리
```

---

## 프론트엔드

### React Query 훅

```typescript
// src/hooks/useDevcontainerConfig.ts

useDevcontainerConfig(workspacePath)     // read, refetch 없음 (수동 트리거)
useSaveDevcontainerConfig()              // mutation, 성공 시 config 쿼리 무효화
useValidateDevcontainerConfig()          // mutation, JSON 에디터 실시간 검증용
```

### 상태 관리

**Source of truth: `config` (JS 객체, serde_json::Value에 대응)**

```typescript
const [config, setConfig] = useState<Record<string, any>>({});
const [activeTab, setActiveTab] = useState<ConfigTab>("general");
const [isDirty, setIsDirty] = useState(false);
const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
```

- 폼 탭: `config`에서 값을 읽고, 변경 시 `setConfig`로 객체 업데이트
- JSON 탭: `config`를 `JSON.stringify`로 표시, 편집 후 `JSON.parse`로 `setConfig`
- JSON 파싱 실패 시 에러 표시, config 업데이트하지 않음

### 컴포넌트 계층

```
DevcontainerConfigEditor (최상위: 탭 관리, 상태 관리)
├── ConfigTabBar (General | Features | Ports & Env | Lifecycle | JSON)
├── GeneralTab
│   ├── SourceTypeSelector (Image / Dockerfile 라디오)
│   ├── ImageConfig (image 텍스트 입력)
│   └── DockerfileConfig (dockerfile, context, args, target)
├── FeaturesTab
│   └── FeatureList (feature ID + 옵션 키-값)
├── PortsEnvTab
│   ├── ForwardPortsList
│   ├── ContainerEnvTable (키-값)
│   └── RemoteEnvTable (키-값)
├── LifecycleTab
│   └── LifecycleCommandInputs (6개 커맨드)
├── JsonEditorTab
│   └── textarea 기반 JSON 에디터 (모노스페이스, 외부 라이브러리 없음)
└── ActionBar (Save / Cancel / Reset)
```

### 탭 상세

#### General 탭

| 필드 | 위젯 | 조건 |
|---|---|---|
| name | 텍스트 입력 | 항상 |
| Source Type | 라디오 (Image / Dockerfile) | 항상 |
| image | 텍스트 입력 | Source=Image |
| build.dockerfile | 텍스트 입력 | Source=Dockerfile |
| build.context | 텍스트 입력 | Source=Dockerfile |
| build.args | 키-값 테이블 | Source=Dockerfile |
| build.target | 텍스트 입력 | Source=Dockerfile |
| workspaceFolder | 텍스트 입력 | 항상 |
| shutdownAction | 드롭다운 (none / stopContainer) | 항상 |
| overrideCommand | 토글 | 항상 |
| remoteUser | 텍스트 입력 | 항상 |

#### Features 탭

- Feature 추가: ID 텍스트 입력 (예: `ghcr.io/devcontainers/features/node:1`)
- 각 Feature에 옵션 키-값 편집
- 추가/삭제 버튼

#### Ports & Env 탭

- `forwardPorts`: 포트 번호 리스트 (추가/삭제)
- `containerEnv`: 키-값 테이블 (추가/편집/삭제)
- `remoteEnv`: 키-값 테이블 (추가/편집/삭제)

#### Lifecycle 탭

- 6개 커맨드 각각 텍스트 입력 (단일 문자열 모드)
  - `initializeCommand`, `onCreateCommand`, `updateContentCommand`
  - `postCreateCommand`, `postStartCommand`, `postAttachCommand`
- `waitFor`: 드롭다운 (initializeCommand / onCreateCommand / updateContentCommand / postCreateCommand / postStartCommand)

#### JSON 탭

- `textarea` 기반, 모노스페이스 폰트
- 변경 시 debounce(500ms)로 `validate_devcontainer_config` 호출
- 검증 에러를 에디터 하단에 목록으로 표시
- JSON 파싱 실패 시 "Invalid JSON" 에러 표시, 폼 탭 전환 비활성화

### ActionBar

- **Save**: `write_devcontainer_config` 호출, 검증 실패 시 에러 목록 표시
- **Cancel**: 편집 전 상태로 복원 (isDirty 시 확인 다이얼로그)
- **Reset to Default**: 기본 템플릿으로 초기화 (확인 다이얼로그)

### 재사용 컴포넌트

- `KeyValueTable`: 키-값 편집 (containerEnv, remoteEnv, build.args, feature options 에서 재사용)

### 새 파일 목록

```
src/components/devcontainer-config/
├── DevcontainerConfigEditor.tsx
├── GeneralTab.tsx
├── FeaturesTab.tsx
├── PortsEnvTab.tsx
├── LifecycleTab.tsx
├── JsonEditorTab.tsx
├── ActionBar.tsx
└── KeyValueTable.tsx

src/hooks/
└── useDevcontainerConfig.ts
```

---

## Tauri API 확장

```typescript
// src/lib/tauri.ts에 추가
export const api = {
  // ... 기존 API
  readDevcontainerConfig: (workspacePath: string) =>
    invoke<{ config: Record<string, any>; exists: boolean }>("read_devcontainer_config", { workspacePath }),
  writeDevcontainerConfig: (workspacePath: string, config: Record<string, any>) =>
    invoke<void>("write_devcontainer_config", { workspacePath, config }),
  validateDevcontainerConfig: (config: Record<string, any>) =>
    invoke<ValidationError[]>("validate_devcontainer_config", { config }),
};
```

---

## 타입 정의

```typescript
// src/types/index.ts에 추가
export interface DevcontainerConfig {
  [key: string]: any;  // JSON Schema가 유연하므로 인덱스 시그니처 사용
}

export interface DevcontainerConfigResponse {
  config: DevcontainerConfig;
  exists: boolean;
}

export interface ValidationError {
  path: string;
  message: string;
}

export type ConfigTab = "general" | "features" | "ports-env" | "lifecycle" | "json";
export type SourceType = "image" | "dockerfile";
```

---

## 향후 확장

- Docker Compose 시나리오 지원 (General 탭에 세 번째 라디오 옵션 추가)
- Feature 레지스트리 검색/자동완성
- VS Code extensions 자동완성 (customizations.vscode.extensions)
- JSON 에디터에 구문 강조 라이브러리 도입 (CodeMirror 등)
