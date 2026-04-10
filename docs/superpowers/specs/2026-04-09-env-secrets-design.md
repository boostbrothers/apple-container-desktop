# Environment Variables & Secrets Management

## Overview

Colima Desktop에 환경변수와 시크릿을 관리하고 Docker Compose secrets로 주입하는 기능을 추가한다. 멀티 환경 프로필 지원, Infisical CLI 연동을 포함한다.

## Scope

- **대상 프로젝트 타입**: Compose, DevContainer (Dockerfile 프로젝트 미지원)
- **시크릿 백엔드**: Docker Compose file-based secrets
- **외부 연동**: Infisical CLI (`infisical export`)
- **기존 구조 확장**: `EnvVarEntry`, `Project` 타입에 필드 추가 + 마이그레이션

## 1. Data Model

### EnvVarEntry 확장

```typescript
interface EnvVarEntry {
  key: string;
  value: string;
  source: "manual" | "dotenv" | "command" | "api" | "infisical";
  secret: boolean;       // true → UI 마스킹, Compose secrets로 주입
  profile: string;       // "default" | "dev" | "staging" | "prod" | 커스텀
}
```

### Project 확장

```typescript
interface Project {
  // ... 기존 필드 유지
  env_vars: EnvVarEntry[];
  active_profile: string;                    // 현재 선택된 프로필 (기본: "default")
  profiles: string[];                        // 사용 가능한 프로필 목록
  infisical_config: InfisicalConfig | null;  // 외부 연동 설정
}

interface InfisicalConfig {
  project_id: string;
  environment: string;                       // 기본 환경 (fallback)
  secret_path: string;                       // 기본: "/"
  auto_sync: boolean;                        // 프로젝트 시작 시 자동 동기화
  profile_mapping: Record<string, string>;   // { "dev": "dev", "prod": "production" }
}
```

### 마이그레이션

기존 `projects.json` 데이터에 자동 적용:

- `env_vars[].secret` → `false`
- `env_vars[].profile` → `"default"`
- `active_profile` → `"default"`
- `profiles` → `["default"]`
- `infisical_config` → `null`

## 2. Rust Backend (Tauri Commands)

### 새 모듈: `commands/env_secrets.rs`

#### 프로필 관리

| Command | Input | Output | 설명 |
|---------|-------|--------|------|
| `create_profile` | project_id, profile_name | Project | 프로필 생성, profiles 배열에 추가 |
| `delete_profile` | project_id, profile_name | Project | 프로필 삭제, 해당 프로필의 env_vars도 삭제. "default" 삭제 불가 |
| `switch_profile` | project_id, profile_name | Project | active_profile 변경 |

#### 환경변수/시크릿 CRUD

| Command | Input | Output | 설명 |
|---------|-------|--------|------|
| `set_env_var` | project_id, entry: EnvVarEntry | Project | 추가 또는 업데이트 (key+profile로 식별) |
| `remove_env_var` | project_id, key, profile | Project | 특정 프로필의 변수 삭제 |
| `bulk_import_env` | project_id, profile, entries: Vec\<EnvVarEntry\> | Project | 일괄 추가 (기존 항목 덮어쓰기) |

#### .env 파일 연동

| Command | Input | Output | 설명 |
|---------|-------|--------|------|
| `load_dotenv_for_profile` | project_id, file_path, profile | Project | .env 파일 파싱 → 해당 프로필에 import (source: "dotenv") |
| `export_profile_to_dotenv` | project_id, profile, file_path | () | 프로필의 변수를 .env 파일로 export |

#### Infisical 연동

| Command | Input | Output | 설명 |
|---------|-------|--------|------|
| `configure_infisical` | project_id, config: InfisicalConfig | Project | Infisical 설정 저장 |
| `sync_infisical` | project_id | Vec\<EnvVarEntry\> | `infisical export --format=dotenv` 실행 → 파싱 → infisical source 항목 교체 |
| `test_infisical_connection` | project_id | bool | 연결 테스트 |
| `check_infisical_installed` | — | bool | CLI 설치 여부 확인 |

#### Compose 시크릿 준비 (내부 함수)

| Function | 설명 |
|----------|------|
| `prepare_secrets_for_compose` | active_profile의 secret=true 항목 → `.secrets/{key}` 파일 생성 + `docker-compose.override.yml` 생성 |

### project_up 수정

```
project_up(id) 흐름:
  1. infisical_config.auto_sync == true → sync_infisical 실행
  2. prepare_secrets_for_compose 실행:
     a. .secrets/ 디렉토리 생성
     b. secret=true 항목 → .secrets/{key} 파일 생성
     c. docker-compose.override.yml 생성
     d. .gitignore에 .secrets/ 추가 (없으면)
  3. docker-compose up -f compose.yml -f docker-compose.override.yml
```

### docker-compose.override.yml 생성 형식

```yaml
services:
  {service_name}:
    secrets:
      - db_password
      - api_key
    environment:
      - NODE_ENV=development
      - PORT=3000
secrets:
  db_password:
    file: ./.secrets/db_password
  api_key:
    file: ./.secrets/api_key
```

- `secret: false` 항목 → `environment` 섹션
- `secret: true` 항목 → `secrets` 섹션 + 파일 생성
- active_profile에 해당하는 항목만 포함

## 3. Frontend

### 새 컴포넌트

```
src/components/env/
├── EnvironmentTab.tsx         # 탭 메인 컨테이너
├── ProfileSelector.tsx        # 프로필 드롭다운 + 생성/삭제
├── EnvVarTable.tsx            # 환경변수/시크릿 테이블
├── EnvVarRow.tsx              # 개별 행 (인라인 편집, 마스킹)
├── AddEnvVarDialog.tsx        # 변수 추가 다이얼로그
├── InfisicalConfig.tsx        # Infisical 연동 설정 섹션
└── ImportExportActions.tsx    # .env import/export 버튼
```

### ProjectCard 수정

프로필 드롭다운 추가:

```
┌─────────────────────────────────────┐
│ my-api-server          [dev ▼]  ▶ ■ │
│ compose · 3 containers    ↻ synced  │
│ 🔒 2 secrets · 5 env vars          │
└─────────────────────────────────────┘
```

- 프로필 전환 시 컨테이너 실행 중이면 재시작 확인 다이얼로그
- 시크릿/환경변수 개수 요약
- Infisical 동기화 상태 아이콘

### Environment 탭 레이아웃

```
[General] [Environment] [Ports] [Lifecycle]

Profile: [dev ▼] [+ New Profile] [Export .env] [Import .env]

┌──────────────┬──────────────┬──────────┬─────────┐
│ Key          │ Value        │ Source   │ Secret  │
├──────────────┼──────────────┼──────────┼─────────┤
│ DATABASE_URL │ postgres://… │ manual   │ 🔒      │
│ API_KEY      │ ••••••••••   │ infisical│ 🔒      │
│ NODE_ENV     │ development  │ dotenv   │         │
│ PORT         │ 3000         │ manual   │         │
└──────────────┴──────────────┴──────────┴─────────┘
[+ Add Variable]

── Infisical ──────────────────────────────
Project ID: [____________]
Environment: [dev ▼]
Secret Path: [/___________]
☑ Auto-sync on project start
[Test Connection] [Sync Now]
```

- 시크릿 값 `••••••••` 마스킹, 클릭으로 토글
- 인라인 편집 (더블클릭)
- Source별 배지 구분
- 알파벳 정렬

### React Query Hooks

```typescript
// hooks/useEnvSecrets.ts
useCreateProfile()        // create_profile → invalidate projects
useDeleteProfile()        // delete_profile → invalidate projects
useSwitchProfile()        // switch_profile → invalidate projects

useSetEnvVar()            // set_env_var → invalidate projects
useRemoveEnvVar()         // remove_env_var → invalidate projects
useBulkImportEnv()        // bulk_import_env → invalidate projects

useLoadDotenvForProfile() // load_dotenv_for_profile → invalidate projects
useExportProfileToDotenv()// export_profile_to_dotenv

useConfigureInfisical()   // configure_infisical → invalidate projects
useSyncInfisical()        // sync_infisical → invalidate projects
useTestInfisicalConnection() // test_infisical_connection
useCheckInfisicalInstalled() // check_infisical_installed (staleTime: 60s)
```

### Tauri API 추가 (lib/tauri.ts)

```typescript
export const api = {
  // ... 기존 API
  createProfile: (projectId, profileName) => invoke("create_profile", { projectId, profileName }),
  deleteProfile: (projectId, profileName) => invoke("delete_profile", { projectId, profileName }),
  switchProfile: (projectId, profileName) => invoke("switch_profile", { projectId, profileName }),
  setEnvVar: (projectId, entry) => invoke("set_env_var", { projectId, entry }),
  removeEnvVar: (projectId, key, profile) => invoke("remove_env_var", { projectId, key, profile }),
  bulkImportEnv: (projectId, profile, entries) => invoke("bulk_import_env", { projectId, profile, entries }),
  loadDotenvForProfile: (projectId, filePath, profile) => invoke("load_dotenv_for_profile", { projectId, filePath, profile }),
  exportProfileToDotenv: (projectId, profile, filePath) => invoke("export_profile_to_dotenv", { projectId, profile, filePath }),
  configureInfisical: (projectId, config) => invoke("configure_infisical", { projectId, config }),
  syncInfisical: (projectId) => invoke("sync_infisical", { projectId }),
  testInfisicalConnection: (projectId) => invoke("test_infisical_connection", { projectId }),
  checkInfisicalInstalled: () => invoke("check_infisical_installed"),
};
```

## 4. Infisical CLI Integration

### 전제 조건

- `infisical` CLI 로컬 설치 + `infisical login` 완료
- 앱은 CLI 호출만 수행 (토큰 직접 관리 안 함)

### Sync 흐름

```
infisical export \
  --projectId={project_id} \
  --env={profile_mapping[active_profile] || environment} \
  --path={secret_path} \
  --format=dotenv
```

1. dotenv 형식 출력 파싱
2. `EnvVarEntry[]`로 변환 (source: "infisical", secret: true)
3. 기존 `source: "infisical"` 항목 교체 (manual/dotenv 항목은 유지)

### 프로필 ↔ Infisical 환경 매핑

`profile_mapping`으로 프로필별 Infisical 환경 지정:

```json
{
  "dev": "dev",
  "staging": "staging",
  "prod": "production"
}
```

매핑이 없으면 `environment` 필드를 fallback으로 사용.

### 에러 처리

| 상황 | 처리 |
|------|------|
| CLI 미설치 | "infisical CLI를 설치해주세요" 안내 + 설치 링크 |
| 미로그인 | "infisical login을 먼저 실행해주세요" 안내 |
| 프로젝트 ID 잘못됨 | 연결 테스트에서 에러 메시지 표시 |
| 네트워크 오류 | 마지막 동기화된 값 유지, 경고 배지 표시 |

## 5. End-to-End Flow

```
1. 프로젝트 추가 → profiles: ["default"], active_profile: "default"
2. Environment 탭에서 변수/시크릿 추가 (수동 or .env import)
3. (선택) 프로필 추가: dev, staging, prod
4. (선택) Infisical 설정 → profile_mapping 지정 → Sync Now
5. 프로젝트 카드에서 프로필 선택 (dev ▼) → ▶ 실행
6. 실행 시 내부:
   a. auto_sync이면 infisical export 실행
   b. secret=true 항목 → .secrets/{key} 파일 생성
   c. docker-compose.override.yml 자동 생성
   d. docker-compose up -f compose.yml -f docker-compose.override.yml
7. 프로필 전환 시 → 재시작 확인 → 새 프로필로 재실행
```

## 6. Migration Strategy

기존 `projects.json` 자동 마이그레이션:

| 필드 | 기존 | 마이그레이션 |
|------|------|-------------|
| `env_vars[].secret` | 없음 | `false` |
| `env_vars[].profile` | 없음 | `"default"` |
| `active_profile` | 없음 | `"default"` |
| `profiles` | 없음 | `["default"]` |
| `infisical_config` | 없음 | `null` |

기존 `load_dotenv_file`, `run_env_command` 커맨드는 하위 호환 유지.
