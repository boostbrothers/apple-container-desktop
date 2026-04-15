# DNS Management Migration to Networks Page

**Date:** 2026-04-15
**Status:** Approved

## Overview

DNS 도메인 관리를 Settings > Domains에서 Networks 페이지로 이동하고, 복수 DNS 도메인 생성/삭제를 지원하며, 컨테이너(프로젝트)별 DNS 도메인 할당 기능을 추가한다.

## Background

Apple Container CLI는 `container system dns create/delete/list`로 복수의 로컬 DNS 도메인을 관리할 수 있다. `dns.domain` 시스템 프로퍼티로 기본 도메인을 설정하고, `container run --dns-domain`으로 컨테이너별 오버라이드가 가능하다.

현재 앱은 단일 도메인 suffix만 관리하며, DNS와 무관한 Settings 페이지에 배치되어 있다.

## Design

### 1. Networks 페이지 — DNS Domains 섹션

기존 Networks 목록 상단에 DNS Domains 섹션을 추가한다.

**레이아웃:**
```
── DNS Domains ──────────────────────────
● ddocdoc.local              [Default] [✕]
○ staging.local                        [✕]
[ domain name          ] [Add Domain]
(Requires admin password)
─────────────────────────────────────────

── Networks ─────────────────────────────
(기존 네트워크 목록 유지)
```

**동작:**
- `container system dns list`로 현재 도메인 목록 조회
- **Add Domain**: `osascript`로 관리자 권한 요청 → `container system dns create --localhost 127.0.0.1 <domain>`
- **[✕] 삭제**: `osascript`로 관리자 권한 요청 → `container system dns delete <domain>`
- **Default 지정**: 라디오 버튼 클릭 시 `container system property set dns.domain <domain>`
- 현재 `dns.domain` 값과 일치하는 항목에 `[Default]` 배지 표시

### 2. ProjectDetail — DNS 도메인 할당

ProjectDetail의 기존 "Domain" 섹션을 DNS 도메인 선택 UI로 교체한다.

**레이아웃:**
```
── DNS Domain ───────────────────────────
Domain   [Default (ddocdoc.local)      ▼]
Hostname [ my-app                       ]
→ http://my-app.ddocdoc.local
```

**동작:**
- **Domain 드롭다운**: 생성된 DNS 도메인 목록에서 선택. 첫 번째 옵션은 "Default ({dns.domain})", 나머지는 개별 도메인
- **Hostname 입력**: 컨테이너 이름 부분 (기본값: 프로젝트명)
- **프리뷰 URL**: `http://{hostname}.{selected-domain}` 실시간 표시
- 프로젝트 저장 시 선택된 도메인을 프로젝트 설정에 저장
- 컨테이너 실행 시 기본값이 아닌 경우 `--dns-domain` 옵션으로 전달

### 3. 데이터 모델 변경

**Project 타입 확장:**
```typescript
interface Project {
  // ... 기존 필드
  dns_domain?: string | null;   // 선택된 DNS 도메인 (null = 시스템 기본값)
  dns_hostname?: string | null; // 커스텀 호스트네임 (null = 프로젝트명)
}
```

**DnsList 응답 타입:**
```typescript
interface DnsList {
  domains: string[];      // container system dns list 결과
  default_domain: string; // container system property get dns.domain 결과
}
```

### 4. Rust 백엔드 커맨드

| 커맨드 | 역할 |
|--------|------|
| `dns_create(domain)` | DNS 도메인 생성 (osascript + admin privileges) |
| `dns_delete(domain)` | DNS 도메인 삭제 (osascript + admin privileges) |
| `dns_list()` | DNS 도메인 목록 + 현재 default 반환 |
| `dns_set_default(domain)` | `system property set dns.domain` |

### 5. 프론트엔드 훅

| 훅 | 역할 |
|----|------|
| `useDnsList()` | DNS 도메인 목록 + default 조회 |
| `useDnsCreate()` | DNS 도메인 생성 mutation |
| `useDnsDelete()` | DNS 도메인 삭제 mutation |
| `useDnsSetDefault()` | 기본 도메인 설정 mutation |

## Removed

- `src/components/settings/ContainerDomainsSettings.tsx` — 전체 삭제
- `src/components/containers/ContainerDomainDialog.tsx` — 전체 삭제
- `src-tauri/src/proxy/config.rs` — DomainConfig 파일 관리 제거 (CLI가 상태 관리)
- `src/hooks/useDomains.ts` — 새 `useDns.ts`로 교체
- `src/types/index.ts`의 `DomainConfig`, `ContainerDomainOverride` 타입 제거
- 사이드바 "Domains" 항목 제거
- `MainLayout`의 `settings/domains` 라우트 제거
- `domain_get_config`, `domain_set_config`, `domain_setup`, `domain_teardown`, `domain_status` 커맨드 제거

## Error Handling

- DNS 생성/삭제 실패 시 백엔드의 실제 에러 메시지를 `String(error)`로 표시
- 관리자 권한 취소 시 적절한 에러 메시지
- DNS 목록 조회 실패 시 빈 목록 + 에러 표시
- 기본 도메인이 삭제된 도메인을 가리키는 경우 경고 표시
