# DNS Management Migration to Networks Page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DNS 도메인 관리를 Settings에서 Networks 페이지로 이동하고, 복수 DNS 생성/삭제 + 컨테이너별 DNS 할당을 지원한다.

**Architecture:** Rust 백엔드의 domain/proxy 커맨드를 dns_* 커맨드로 교체하고, 프론트엔드에서 NetworkList에 DnsDomains 섹션을 추가한다. ProjectDetail의 Domain 섹션은 DNS 도메인 드롭다운 + hostname 입력으로 교체한다. 기존 DomainConfig 파일 기반 상태 관리는 제거하고 CLI가 직접 상태를 관리한다.

**Tech Stack:** Rust (Tauri commands), React 19, TanStack React Query, TypeScript

**Spec:** `docs/superpowers/specs/2026-04-15-dns-to-networks-design.md`

---

## File Map

### Create
- `src/components/networks/DnsDomains.tsx` — DNS 도메인 목록/추가/삭제/기본 설정 UI
- `src/hooks/useDns.ts` — DNS CRUD React Query 훅

### Modify
- `src-tauri/src/commands/proxy.rs` — domain_* 커맨드를 dns_* 커맨드로 전면 교체
- `src-tauri/src/lib.rs:111-116` — 커맨드 등록 교체
- `src-tauri/src/commands/mod.rs:14` — 모듈명 유지 (proxy → dns 내용 교체)
- `src/components/networks/NetworkList.tsx` — DnsDomains 섹션 추가
- `src/components/containers/ProjectDetail.tsx:241-257` — Domain 섹션을 DNS 드롭다운으로 교체
- `src/components/containers/ContainerRow.tsx:44-45,54-55,59,200-206` — domainOverride/domainEnabled props 제거
- `src/components/containers/ContainerList.tsx:4,34,119-120` — useDomainConfig 제거
- `src/components/layout/Sidebar.tsx:17,137` — settings/domains 항목 제거
- `src/components/layout/MainLayout.tsx:13,38` — ContainerDomainsSettings import/route 제거
- `src/lib/tauri.ts:160-164` — domain* API를 dns* API로 교체
- `src/types/index.ts:217,240-253` — DomainConfig/ContainerDomainOverride 제거, DnsList 추가

### Delete
- `src/components/settings/ContainerDomainsSettings.tsx`
- `src/components/containers/ContainerDomainDialog.tsx`
- `src/hooks/useDomains.ts`
- `src-tauri/src/proxy/config.rs`
- `src-tauri/src/proxy/mod.rs`

---

### Task 1: Rust 백엔드 — dns_* 커맨드로 교체

**Files:**
- Modify: `src-tauri/src/commands/proxy.rs` (전면 교체)
- Delete: `src-tauri/src/proxy/config.rs`, `src-tauri/src/proxy/mod.rs`
- Modify: `src-tauri/src/lib.rs:4,111-116`
- Modify: `src-tauri/src/commands/mod.rs:14`

- [ ] **Step 1: proxy.rs를 dns 커맨드로 전면 교체**

`src-tauri/src/commands/proxy.rs` 전체를 다음으로 교체:

```rust
use crate::cli::executor::{container_cmd, CliExecutor};
use serde::Serialize;

#[derive(Serialize)]
pub struct DnsList {
    pub domains: Vec<String>,
    pub default_domain: String,
}

#[tauri::command]
pub async fn dns_list() -> Result<DnsList, String> {
    let output = CliExecutor::run(container_cmd(), &["system", "dns", "list"])
        .await
        .unwrap_or_default();
    let domains: Vec<String> = output
        .lines()
        .skip(1) // skip header line "DOMAIN"
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    let default_domain =
        CliExecutor::run(container_cmd(), &["system", "property", "get", "dns.domain"])
            .await
            .unwrap_or_default()
            .trim()
            .to_string();
    Ok(DnsList {
        domains,
        default_domain,
    })
}

#[tauri::command]
pub async fn dns_create(domain: String) -> Result<(), String> {
    let bin = container_cmd();
    let script = format!(
        r#"do shell script "{} system dns create --localhost 127.0.0.1 {}" with administrator privileges"#,
        bin, domain
    );
    let output = tokio::process::Command::new("osascript")
        .args(["-e", &script])
        .output()
        .await
        .map_err(|e| format!("Failed to run osascript: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to create DNS domain: {}", stderr));
    }
    Ok(())
}

#[tauri::command]
pub async fn dns_delete(domain: String) -> Result<(), String> {
    let bin = container_cmd();
    let script = format!(
        r#"do shell script "{} system dns delete {}" with administrator privileges"#,
        bin, domain
    );
    let output = tokio::process::Command::new("osascript")
        .args(["-e", &script])
        .output()
        .await
        .map_err(|e| format!("Failed to run osascript: {}", e))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("Failed to delete DNS domain: {}", stderr));
    }
    Ok(())
}

#[tauri::command]
pub async fn dns_set_default(domain: String) -> Result<(), String> {
    CliExecutor::run(
        container_cmd(),
        &["system", "property", "set", "dns.domain", &domain],
    )
    .await?;
    Ok(())
}
```

- [ ] **Step 2: proxy 모듈 삭제 및 lib.rs 정리**

`src-tauri/src/proxy/config.rs`와 `src-tauri/src/proxy/mod.rs` 삭제.

`src-tauri/src/lib.rs`에서 `pub mod proxy;` 줄(line 4) 삭제.

`src-tauri/src/lib.rs`의 커맨드 등록(lines 111-116)을 교체:

```rust
            // DNS (Apple Container built-in DNS)
            commands::proxy::dns_list,
            commands::proxy::dns_create,
            commands::proxy::dns_delete,
            commands::proxy::dns_set_default,
```

- [ ] **Step 3: 빌드 확인**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5`
Expected: `Finished` (에러 없음, 프론트엔드 연동 전이므로 경고 가능)

- [ ] **Step 4: 커밋**

```bash
git add src-tauri/src/commands/proxy.rs src-tauri/src/lib.rs src-tauri/src/commands/mod.rs
git rm src-tauri/src/proxy/config.rs src-tauri/src/proxy/mod.rs
git commit -m "refactor: domain_* 커맨드를 dns_* 커맨드로 교체, DomainConfig 파일 관리 제거"
```

---

### Task 2: 프론트엔드 타입 및 API 교체

**Files:**
- Modify: `src/types/index.ts:217,240-253`
- Modify: `src/lib/tauri.ts:159-164`
- Create: `src/hooks/useDns.ts`
- Delete: `src/hooks/useDomains.ts`

- [ ] **Step 1: TypeScript 타입 교체**

`src/types/index.ts`에서 `DomainConfig`과 `ContainerDomainOverride` 제거 (lines 240-253):

```typescript
// 삭제:
// --- Container Domains ---
// export interface DomainConfig { ... }
// export interface ContainerDomainOverride { ... }
```

같은 파일에 `DnsList` 타입 추가 (삭제한 위치에):

```typescript
// --- DNS ---

export interface DnsList {
  domains: string[];
  default_domain: string;
}
```

`Project` 인터페이스(line 217)에서 `domain` 필드를 `dns_domain`과 `dns_hostname`으로 교체:

```typescript
// 기존: domain: string | null;
// 교체:
  dns_domain: string | null;
  dns_hostname: string | null;
```

- [ ] **Step 2: Tauri API 래퍼 교체**

`src/lib/tauri.ts`의 domain 관련 줄(lines 159-164)을 교체:

```typescript
  // DNS
  dnsList: () => invoke<DnsList>("dns_list"),
  dnsCreate: (domain: string) => invoke<void>("dns_create", { domain }),
  dnsDelete: (domain: string) => invoke<void>("dns_delete", { domain }),
  dnsSetDefault: (domain: string) => invoke<void>("dns_set_default", { domain }),
```

import에서 `DomainConfig, DomainStatus`를 `DnsList`로 교체.

- [ ] **Step 3: useDns.ts 훅 생성**

`src/hooks/useDns.ts` 생성:

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";

export function useDnsList() {
  return useQuery({
    queryKey: ["dns-list"],
    queryFn: () => api.dnsList(),
    refetchInterval: 5000,
  });
}

export function useDnsCreate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domain: string) => api.dnsCreate(domain),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dns-list"] }),
  });
}

export function useDnsDelete() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domain: string) => api.dnsDelete(domain),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dns-list"] }),
  });
}

export function useDnsSetDefault() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (domain: string) => api.dnsSetDefault(domain),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dns-list"] }),
  });
}
```

- [ ] **Step 4: useDomains.ts 삭제**

```bash
git rm src/hooks/useDomains.ts
```

- [ ] **Step 5: 커밋**

```bash
git add src/types/index.ts src/lib/tauri.ts src/hooks/useDns.ts
git rm src/hooks/useDomains.ts
git commit -m "refactor: DomainConfig 타입을 DnsList로 교체, useDns 훅 생성"
```

---

### Task 3: DnsDomains 컴포넌트 생성 및 NetworkList 통합

**Files:**
- Create: `src/components/networks/DnsDomains.tsx`
- Modify: `src/components/networks/NetworkList.tsx`

- [ ] **Step 1: DnsDomains.tsx 생성**

`src/components/networks/DnsDomains.tsx` 생성:

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, Globe, Loader2 } from "lucide-react";
import { useDnsList, useDnsCreate, useDnsDelete, useDnsSetDefault } from "../../hooks/useDns";

export function DnsDomains() {
  const { data: dns, isLoading } = useDnsList();
  const createMut = useDnsCreate();
  const deleteMut = useDnsDelete();
  const setDefaultMut = useDnsSetDefault();
  const [newDomain, setNewDomain] = useState("");

  const handleCreate = () => {
    const domain = newDomain.trim();
    if (!domain) return;
    createMut.mutate(domain, {
      onSuccess: () => setNewDomain(""),
    });
  };

  const isBusy =
    createMut.isPending || deleteMut.isPending || setDefaultMut.isPending;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Globe className="h-4 w-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">DNS Domains</h2>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Local DNS domains for accessing containers via{" "}
        <code className="text-[10px]">http://name.domain</code>. Requires admin
        password to create or remove.
      </p>

      {isLoading && (
        <p className="text-xs text-muted-foreground">Loading...</p>
      )}

      {dns && dns.domains.length > 0 && (
        <div className="space-y-1">
          {dns.domains.map((domain) => {
            const isDefault = domain === dns.default_domain;
            return (
              <div
                key={domain}
                className="flex items-center gap-2 rounded-md bg-muted/20 px-3 py-1.5"
              >
                <input
                  type="radio"
                  name="default-dns"
                  checked={isDefault}
                  onChange={() => setDefaultMut.mutate(domain)}
                  disabled={isBusy}
                  className="accent-primary"
                />
                <code className="text-xs font-mono flex-1">{domain}</code>
                {isDefault && (
                  <Badge variant="secondary" className="text-[9px]">
                    Default
                  </Badge>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0"
                  onClick={() => deleteMut.mutate(domain)}
                  disabled={isBusy}
                  title="Remove DNS domain"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            );
          })}
        </div>
      )}

      {dns && dns.domains.length === 0 && !isLoading && (
        <p className="text-xs text-muted-foreground">
          No DNS domains configured.
        </p>
      )}

      {/* Add new domain */}
      <div className="flex items-center gap-2">
        <Input
          placeholder="e.g. test, myapp.local"
          value={newDomain}
          onChange={(e) => setNewDomain(e.target.value)}
          className="h-7 text-xs font-mono flex-1"
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          disabled={isBusy}
        />
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          onClick={handleCreate}
          disabled={!newDomain.trim() || isBusy}
        >
          {createMut.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <>
              <Plus className="h-3 w-3 mr-1" />
              Add Domain
            </>
          )}
        </Button>
      </div>

      {createMut.isError && (
        <p className="text-[10px] text-destructive">
          {String(createMut.error) || "Failed to create DNS domain"}
        </p>
      )}
      {deleteMut.isError && (
        <p className="text-[10px] text-destructive">
          {String(deleteMut.error) || "Failed to delete DNS domain"}
        </p>
      )}
      {setDefaultMut.isError && (
        <p className="text-[10px] text-destructive">
          {String(setDefaultMut.error) || "Failed to set default domain"}
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: NetworkList.tsx에 DnsDomains 통합**

`src/components/networks/NetworkList.tsx`를 수정. import 추가 및 DnsDomains 섹션을 네트워크 목록 위에 배치:

```tsx
import { useNetworks, usePruneNetworks } from "../../hooks/useNetworks";
import { NetworkRow } from "./NetworkRow";
import { NetworkCreate } from "./NetworkCreate";
import { DnsDomains } from "./DnsDomains";
import { Button } from "@/components/ui/button";

export function NetworkList() {
  const { data: networks, isLoading, error } = useNetworks();
  const prune = usePruneNetworks();

  return (
    <div className="space-y-6">
      {/* DNS Domains Section */}
      <div className="glass-panel rounded-lg p-4">
        <DnsDomains />
      </div>

      {/* Networks Section */}
      <div>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold">Networks</h1>
            {networks && (
              <p className="text-xs text-muted-foreground">
                {networks.length} networks
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={() => prune.mutate()}
            disabled={prune.isPending}
          >
            {prune.isPending ? "Pruning..." : "Prune Unused"}
          </Button>
        </div>
        <div className="mb-4">
          <NetworkCreate />
        </div>
        {isLoading && (
          <p className="text-sm text-muted-foreground">Loading...</p>
        )}
        {error && (
          <p className="text-sm text-destructive">
            Failed to load networks.
          </p>
        )}
        <div className="flex flex-col gap-2">
          {networks?.map((network) => (
            <NetworkRow key={network.id} network={network} />
          ))}
          {networks?.length === 0 && !isLoading && (
            <p className="text-sm text-muted-foreground">
              No networks found.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/components/networks/DnsDomains.tsx src/components/networks/NetworkList.tsx
git commit -m "feat: Networks 페이지에 DNS Domains 섹션 추가"
```

---

### Task 4: ProjectDetail의 Domain 섹션을 DNS 드롭다운으로 교체

**Files:**
- Modify: `src/components/containers/ProjectDetail.tsx:71-72,101,109,145,241-257`
- Modify: `src-tauri/src/cli/types.rs:569` (Rust Project 구조체)

- [ ] **Step 1: Rust Project 구조체에서 domain → dns_domain + dns_hostname**

`src-tauri/src/cli/types.rs`에서 line 569의 `domain` 필드를 교체:

```rust
    // 기존: pub domain: Option<String>,
    #[serde(default)]
    pub dns_domain: Option<String>,
    #[serde(default)]
    pub dns_hostname: Option<String>,
```

`ProjectWithStatus` 구조체(line 610)에서도 동일하게 교체:

```rust
    // 기존: pub domain: Option<String>,
    pub dns_domain: Option<String>,
    pub dns_hostname: Option<String>,
```

`with_status` 메서드(~line 630)에서 필드 매핑 교체:

```rust
            // 기존: domain: self.domain,
            dns_domain: self.dns_domain,
            dns_hostname: self.dns_hostname,
```

- [ ] **Step 2: ProjectDetail.tsx의 state와 변경 감지 교체**

`src/components/containers/ProjectDetail.tsx`에서:

기존 import에 `useDnsList` 추가:
```typescript
import { useDnsList } from "../../hooks/useDns";
```

기존 state 교체 (line 71-72):
```typescript
  // 기존: const [domain, setDomain] = useState(project.domain || "");
  const [dnsDomain, setDnsDomain] = useState(project.dns_domain || "");
  const [dnsHostname, setDnsHostname] = useState(project.dns_hostname || "");
  const { data: dnsList } = useDnsList();
```

변경 감지 (line 101) 교체:
```typescript
      // 기존: domain !== (project.domain || "") ||
      dnsDomain !== (project.dns_domain || "") ||
      dnsHostname !== (project.dns_hostname || "") ||
```

deps 배열 (line 109)에서 `domain`을 `dnsDomain, dnsHostname`으로 교체.

buildSaveData (line 145) 교체:
```typescript
    // 기존: domain: domain || null,
    dns_domain: dnsDomain || null,
    dns_hostname: dnsHostname || null,
```

- [ ] **Step 3: ProjectDetail.tsx의 Domain UI 섹션 교체 (lines 241-257)**

기존 Domain 섹션을 DNS Domain 드롭다운 + hostname 입력으로 교체:

```tsx
        {/* DNS Domain */}
        <div className="glass-panel rounded-lg p-4 space-y-3">
          <div className="flex items-center gap-2">
            <Globe className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">DNS Domain</h3>
          </div>
          <div className="space-y-2">
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Domain</label>
              <select
                value={dnsDomain}
                onChange={(e) => setDnsDomain(e.target.value)}
                className="h-7 w-full rounded-md border border-input bg-transparent px-2 text-xs"
              >
                <option value="">
                  Default{dnsList?.default_domain ? ` (${dnsList.default_domain})` : ""}
                </option>
                {dnsList?.domains
                  .filter((d) => d !== dnsList.default_domain)
                  .map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] text-muted-foreground">Hostname</label>
              <Input
                placeholder={project.name}
                value={dnsHostname}
                onChange={(e) => setDnsHostname(e.target.value)}
                className="h-7 text-xs font-mono"
              />
            </div>
            <p className="text-[10px] text-muted-foreground">
              {(() => {
                const host = dnsHostname || project.name;
                const dom = dnsDomain || dnsList?.default_domain;
                return dom
                  ? <>Access via <code className="text-[10px]">http://{host}.{dom}</code></>
                  : "Configure DNS domains in the Networks page first";
              })()}
            </p>
          </div>
        </div>
```

`Globe` 아이콘을 기존 import에 추가: line 4의 lucide import 목록에 `Globe` 추가.

- [ ] **Step 4: 빌드 확인**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5`
Expected: `Finished`

Run: `npx tsc --noEmit 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0`

- [ ] **Step 5: 커밋**

```bash
git add src-tauri/src/cli/types.rs src/components/containers/ProjectDetail.tsx
git commit -m "feat: ProjectDetail의 Domain을 DNS 도메인 드롭다운으로 교체"
```

---

### Task 5: 레거시 코드 제거 — Settings Domains, ContainerDomainDialog, 라우팅

**Files:**
- Delete: `src/components/settings/ContainerDomainsSettings.tsx`
- Delete: `src/components/containers/ContainerDomainDialog.tsx`
- Modify: `src/components/layout/Sidebar.tsx:17,137`
- Modify: `src/components/layout/MainLayout.tsx:13,38`
- Modify: `src/components/containers/ContainerRow.tsx:19,44-45,54-55,59,200-206`
- Modify: `src/components/containers/ContainerList.tsx:4,34,119-120`

- [ ] **Step 1: Settings Domains 파일 삭제**

```bash
git rm src/components/settings/ContainerDomainsSettings.tsx
git rm src/components/containers/ContainerDomainDialog.tsx
```

- [ ] **Step 2: Sidebar.tsx에서 settings/domains 제거**

`src/components/layout/Sidebar.tsx`에서:

`Page` 타입(line 17)에서 `"settings/domains"` 제거:
```typescript
  // 삭제: | "settings/domains"
```

Settings 메뉴(line 137)에서 Domains 항목 제거:
```tsx
            // 삭제: {navItem("settings/domains", "Domains", true)}
```

- [ ] **Step 3: MainLayout.tsx에서 ContainerDomainsSettings 제거**

`src/components/layout/MainLayout.tsx`에서:

import 제거 (line 13):
```typescript
// 삭제: import { ContainerDomainsSettings } from "../settings/ContainerDomainsSettings";
```

라우트 제거 (line 38):
```tsx
// 삭제: {activePage === "settings/domains" && <ContainerDomainsSettings />}
```

- [ ] **Step 4: ContainerRow.tsx에서 domain 관련 코드 제거**

`src/components/containers/ContainerRow.tsx`에서:

import 제거 (line 19):
```typescript
// 삭제: import { ContainerDomainDialog } from "./ContainerDomainDialog";
```

props에서 제거 (lines 44-45):
```typescript
// 삭제: domainOverride?: ContainerDomainOverride;
// 삭제: domainEnabled?: boolean;
```

destructuring에서 제거 (lines 54-55):
```typescript
// 삭제: domainOverride,
// 삭제: domainEnabled,
```

state 제거 (line 59):
```typescript
// 삭제: const [showDomainDialog, setShowDomainDialog] = useState(false);
```

JSX에서 ContainerDomainDialog 렌더링 제거 (lines 200-206):
```tsx
// 삭제: {showDomainDialog && (
//   <ContainerDomainDialog ... />
// )}
```

ContainerDomainOverride import도 types import에서 제거.

만약 `showDomainDialog`를 토글하는 Globe 버튼이 있다면 그것도 제거.

- [ ] **Step 5: ContainerList.tsx에서 useDomainConfig 제거**

`src/components/containers/ContainerList.tsx`에서:

import 제거 (line 4):
```typescript
// 삭제: import { useDomainConfig } from "../../hooks/useDomains";
```

hook 호출 제거 (line 34):
```typescript
// 삭제: const { data: domainConfig } = useDomainConfig();
```

ContainerRow props에서 domain 관련 제거 (lines 119-120):
```tsx
// 삭제: domainOverride={domainConfig?.container_overrides?.[container.name]}
// 삭제: domainEnabled={domainConfig?.enabled}
```

- [ ] **Step 6: types/index.ts에서 레거시 타입 정리**

`Project` 인터페이스에서 이전 Task 4에서 이미 `domain`을 `dns_domain` + `dns_hostname`으로 교체했으므로, `DomainConfig`와 `ContainerDomainOverride`만 삭제 확인.

- [ ] **Step 7: 빌드 확인**

Run: `cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5`
Expected: `Finished`

Run: `npx tsc --noEmit 2>&1; echo "EXIT=$?"`
Expected: `EXIT=0`

- [ ] **Step 8: 커밋**

```bash
git add -A
git commit -m "refactor: Settings Domains 페이지, ContainerDomainDialog 및 레거시 도메인 코드 제거"
```

---

### Task 6: 최종 검증

**Files:** (전체)

- [ ] **Step 1: 전체 빌드 확인**

```bash
cargo check --manifest-path src-tauri/Cargo.toml 2>&1 | tail -5
npx tsc --noEmit 2>&1; echo "EXIT=$?"
```

Expected: 둘 다 에러 없이 통과.

- [ ] **Step 2: 미사용 import/참조 정리**

`useDomains`, `DomainConfig`, `ContainerDomainOverride`, `DomainStatus`, `domain_get_config`, `domain_set_config`, `domain_setup`, `domain_teardown`, `domain_status` 등 레거시 참조가 남아있지 않은지 확인:

```bash
rg -l "useDomain|DomainConfig|ContainerDomainOverride|DomainStatus|domain_get_config|domain_set_config|domain_setup|domain_teardown|domain_status" src/ src-tauri/src/
```

Expected: 결과 없음.

- [ ] **Step 3: 커밋 (필요시)**

정리 사항이 있으면:
```bash
git add -A
git commit -m "chore: 레거시 도메인 참조 정리"
```
