# Service Sub-tabs + Compose Restart Policy Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 프로젝트 설정화면을 서비스별 서브탭으로 재구성하고, Docker Compose 임포트 시 restart 정책을 지원한다.

**Architecture:** Rust Service struct에 `restart` 필드를 추가하고, compose import/export에서 파싱/내보내기 지원. 프론트엔드는 ProjectDetail을 탭 기반으로 리팩터링하여 Default 탭(프로젝트 기본 설정)과 서비스별 탭을 제공.

**Tech Stack:** Rust (Tauri backend), React 19 + TypeScript (frontend), Tailwind CSS 4, shadcn/ui

---

## File Structure

| Action | Path | Responsibility |
|--------|------|---------------|
| Modify | `src-tauri/src/cli/types.rs` | `Service` struct에 `restart` 필드 추가 |
| Modify | `src-tauri/src/commands/project.rs` | `ResolvedService`에 restart 추가, `multi_service_up`/`dockerfile_up`에 --restart 전달, compose import/export에 restart 지원 |
| Modify | `src/types/index.ts` | TypeScript `Service` 인터페이스에 `restart` 추가 |
| Modify | `src/components/containers/ProjectDetail.tsx` | 서브탭 UI 구조 + 서비스 탭 컨텐츠 확장 (restart, volumes, env_vars) |
| Modify | `src/hooks/useProjects.ts` | addService 기본값에 `restart` 추가 (필요시) |

---

### Task 1: Rust — Service struct에 restart 필드 추가

**Files:**
- Modify: `src-tauri/src/cli/types.rs:402-426`

- [ ] **Step 1: Service struct에 restart 필드 추가**

`src-tauri/src/cli/types.rs`의 `Service` struct 마지막 필드 뒤에 추가:

```rust
    #[serde(default)]
    pub network: Option<String>,
    #[serde(default)]
    pub restart: Option<String>,  // "no" | "always" | "on-failure" | "unless-stopped"
}
```

- [ ] **Step 2: cargo check 실행**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: 성공 (기존 코드는 `..` spread 없이 필드를 직접 지정하므로 컴파일 에러 발생 가능 → Task 2에서 수정)

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/cli/types.rs
git commit -m "feat: Service struct에 restart 필드 추가"
```

---

### Task 2: Rust — ResolvedService, multi_service_up, dockerfile_up에 restart 적용

**Files:**
- Modify: `src-tauri/src/commands/project.rs`

- [ ] **Step 1: ResolvedService에 restart 필드 추가**

`src-tauri/src/commands/project.rs`의 `ResolvedService` struct에 추가 (line ~902):

```rust
    env_vars: Vec<EnvVarEntry>,
    network: Option<String>,
    restart: Option<String>,
}
```

- [ ] **Step 2: resolve_service에서 restart 해석**

`resolve_service()` 함수의 `ResolvedService` 생성부에 추가 (line ~930):

```rust
        network: svc.network.clone().or_else(|| project.network.clone()),
        restart: svc.restart.clone(),
    }
```

- [ ] **Step 3: multi_service_up에서 --restart 플래그 전달**

`multi_service_up()` 함수의 run_args 구성부에서, Network 블록 다음에 추가 (line ~1002 부근):

```rust
        // Restart policy
        if let Some(ref restart) = resolved.restart {
            if !restart.trim().is_empty() && restart != "no" {
                run_args.push("--restart".to_string());
                run_args.push(restart.trim().to_string());
            }
        }
```

- [ ] **Step 4: import_compose의 Service 생성부에 restart 추가**

`import_compose()` 함수에서 `new_services.push(Service { ... })` 블록(line ~1352)에 restart 파싱 추가:

restart 파싱 코드 (startup_command 파싱 다음에 추가):
```rust
        let restart = svc_val
            .get("restart")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());
```

Service 생성부:
```rust
        new_services.push(Service {
            // ... 기존 필드들 ...
            network,
            restart,
        });
```

- [ ] **Step 5: export_compose의 서비스 내보내기에 restart 추가**

`export_compose()` 함수에서 network 내보내기 다음에 추가 (line ~1559 부근):

```rust
        if let Some(ref restart) = svc.restart {
            if !restart.is_empty() && restart != "no" {
                svc_map.insert(
                    serde_yaml::Value::String("restart".to_string()),
                    serde_yaml::Value::String(restart.clone()),
                );
            }
        }
```

- [ ] **Step 6: export_compose 단일모드 Service 생성부에도 restart 추가**

`export_compose()`의 단일모드 `Service` 생성부(line ~1456)에 restart 필드 추가:

```rust
        vec![Service {
            // ... 기존 필드들 ...
            network: project.network.clone(),
            restart: None,
        }]
```

- [ ] **Step 7: cargo check 실행**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: 성공

- [ ] **Step 8: Commit**

```bash
git add src-tauri/src/commands/project.rs
git commit -m "feat: restart 정책 - compose import/export 및 container run 지원"
```

---

### Task 3: TypeScript — Service 인터페이스에 restart 추가

**Files:**
- Modify: `src/types/index.ts:171-184`

- [ ] **Step 1: Service 인터페이스에 restart 필드 추가**

```typescript
export interface Service {
  id: string;
  name: string;
  image: string | null;
  dockerfile: string | null;
  ports: string[];
  volumes: VolumeMount[] | null;
  watch_mode: boolean | null;
  startup_command: string | null;
  remote_debug: boolean | null;
  debug_port: number | null;
  env_vars: EnvVarEntry[];
  network: string | null;
  restart: string | null;
}
```

- [ ] **Step 2: ProjectDetail.tsx의 addService 기본값에 restart 추가**

`ProjectDetail.tsx`에서 `addServiceMut.mutate()`의 service 객체(line ~668)에 추가:

```typescript
                    service: {
                      id,
                      name: `service-${project.services.length + 1}`,
                      image: null,
                      dockerfile: null,
                      ports: [],
                      volumes: null,
                      watch_mode: null,
                      startup_command: null,
                      remote_debug: null,
                      debug_port: null,
                      env_vars: [],
                      network: null,
                      restart: null,
                    },
```

- [ ] **Step 3: npm run build로 타입 체크**

Run: `npm run build 2>&1 | head -30`
Expected: 타입 에러 없음 (또는 관련 없는 경고만)

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/components/containers/ProjectDetail.tsx
git commit -m "feat: TypeScript Service 타입에 restart 필드 추가"
```

---

### Task 4: 프론트엔드 — ProjectDetail 서브탭 구조로 리팩터링

**Files:**
- Modify: `src/components/containers/ProjectDetail.tsx`

이 Task는 가장 큰 변경으로, ProjectDetail 컴포넌트의 레이아웃을 탭 기반으로 전환한다.

- [ ] **Step 1: activeTab 상태 추가 및 탭 바 렌더링**

ProjectDetail 컴포넌트에 상태 추가 (expandedService 대체):

```typescript
  const [activeTab, setActiveTab] = useState<string>("default");
```

`expandedService` 상태와 관련 로직 제거.

Header (`</div>`) 바로 아래, `<div className="grid gap-4 ...">` 앞에 탭 바 추가:

```tsx
      {/* Tab bar */}
      {project.services.length > 0 && (
        <div className="sticky top-[52px] z-10 -mx-4 px-4 py-1.5 glass-panel border-b border-[var(--glass-border)] flex items-center gap-1 overflow-x-auto">
          <button
            className={`shrink-0 px-3 py-1 rounded-md text-xs font-medium transition-colors ${
              activeTab === "default"
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
            }`}
            onClick={() => setActiveTab("default")}
          >
            Default
          </button>
          {project.services.map((svc) => {
            const svcStatus = project.service_statuses?.find((s) => s.service_id === svc.id);
            const statusColor =
              svcStatus?.status === "running"
                ? "bg-[var(--status-running-text)]"
                : svcStatus?.status === "stopped"
                  ? "bg-yellow-500"
                  : "bg-muted-foreground/30";
            return (
              <button
                key={svc.id}
                className={`shrink-0 px-3 py-1 rounded-md text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  activeTab === svc.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
                }`}
                onClick={() => setActiveTab(svc.id)}
              >
                <div className={`h-1.5 w-1.5 rounded-full ${statusColor}`} />
                {svc.name}
              </button>
            );
          })}
          <button
            className="shrink-0 px-2 py-1 rounded-md text-xs text-muted-foreground hover:text-foreground hover:bg-muted/30"
            onClick={() => {
              const id = crypto.randomUUID();
              addServiceMut.mutate({
                projectId: project.id,
                service: {
                  id,
                  name: `service-${project.services.length + 1}`,
                  image: null,
                  dockerfile: null,
                  ports: [],
                  volumes: null,
                  watch_mode: null,
                  startup_command: null,
                  remote_debug: null,
                  debug_port: null,
                  env_vars: [],
                  network: null,
                  restart: null,
                },
              });
              setActiveTab(id);
            }}
            disabled={addServiceMut.isPending}
          >
            <Plus className="h-3 w-3" />
          </button>
        </div>
      )}
```

- [ ] **Step 2: Default 탭 컨텐츠 래핑**

기존 `<div className="grid gap-4 ...">` 내부의 모든 섹션을 조건부 렌더링으로 감싼다.

기존 구조:
```tsx
      <div className="grid gap-4 [&>*]:min-w-0">
        {/* DNS Domain */}
        ...
        {/* Image Source */}
        ...
        {/* Services */}
        ...
        {/* Execution Options */}
        ...
        {/* Environment Variables */}
        ...
        {/* Save / Rebuild */}
        ...
        {/* Logs */}
        ...
        {/* Container Info */}
        ...
      </div>
```

변경 후:
```tsx
      <div className="grid gap-4 [&>*]:min-w-0">
        {activeTab === "default" ? (
          <>
            {/* DNS Domain */}
            ...기존 그대로...
            {/* Image Source */}
            ...기존 그대로...
            {/* Network */}
            ...기존 그대로...
            {/* Init Commands */}
            ...기존 그대로...
            {/* Volumes */}
            ...기존 그대로...
            {/* Services (Compose Import/Export만 유지) */}
            <div className="glass-panel rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="h-4 w-4 text-muted-foreground" />
                  <h3 className="text-sm font-semibold">Services</h3>
                  {project.services.length > 0 && (
                    <Badge variant="outline" className="text-[10px]">
                      {project.services.length}
                    </Badge>
                  )}
                </div>
                <div className="flex gap-1">
                  {/* Import/Export 버튼 기존 그대로 */}
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground">
                {project.services.length === 0
                  ? "No services. Add via tab bar or import a Compose file. Single-container mode with project defaults."
                  : "Multi-service mode. Project-level settings act as defaults."}
              </p>
            </div>
            {/* Execution Options */}
            ...기존 그대로...
            {/* Environment Variables */}
            ...기존 그대로...
          </>
        ) : (
          <ServiceTabContent
            project={project}
            serviceId={activeTab}
            onUpdate={(updated) => updateServiceMut.mutate({ projectId: project.id, service: updated })}
            onRemove={(serviceId) => {
              removeServiceMut.mutate({ projectId: project.id, serviceId });
              setActiveTab("default");
            }}
            onOpenTerminal={(cid) => openTerminal.mutate(cid)}
            networkList={networkList}
            volumeList={volumeList}
          />
        )}

        {/* Save / Rebuild notice — 항상 표시 */}
        {hasChanges && project.status === "running" && ( ... )}
        {hasChanges && project.status !== "running" && ( ... )}

        {/* Logs — 항상 표시 */}
        {(isRunning || logs.length > 0) && ( ... )}

        {/* Container Info — 항상 표시 */}
        {project.status === "running" && project.container_ids.length > 0 && ( ... )}
      </div>
```

- [ ] **Step 3: ServiceTabContent 컴포넌트 구현**

기존 `ServiceCard`를 대체하는 새 컴포넌트. 전체 페이지 너비로 서비스 설정을 표시.

```tsx
interface ServiceTabContentProps {
  project: Project;
  serviceId: string;
  onUpdate: (service: Service) => void;
  onRemove: (serviceId: string) => void;
  onOpenTerminal: (containerId: string) => void;
  networkList: string[];
  volumeList: { name: string }[];
}

function ServiceTabContent({
  project,
  serviceId,
  onUpdate,
  onRemove,
  onOpenTerminal,
  networkList,
  volumeList,
}: ServiceTabContentProps) {
  const service = project.services.find((s) => s.id === serviceId);
  const svcStatus = project.service_statuses?.find((s) => s.service_id === serviceId);

  if (!service) return null;

  const [name, setName] = useState(service.name);
  const [imageSource, setImageSource] = useState<"dockerfile" | "image">(
    service.image ? "image" : "dockerfile"
  );
  const [imageName, setImageName] = useState(service.image || "");
  const [dockerfile, setDockerfile] = useState(service.dockerfile || "");
  const [ports, setPorts] = useState<string[]>(
    service.ports.length > 0 ? service.ports : [""]
  );
  const [startupCmd, setStartupCmd] = useState(service.startup_command || "");
  const [network, setNetwork] = useState(service.network || "");
  const [restart, setRestart] = useState(service.restart || "no");
  const [volumes, setVolumes] = useState<VolumeMount[]>(
    service.volumes || []
  );
  const [envVars, setEnvVars] = useState(service.env_vars);

  // Reset when service changes
  useEffect(() => {
    setName(service.name);
    setImageSource(service.image ? "image" : "dockerfile");
    setImageName(service.image || "");
    setDockerfile(service.dockerfile || "");
    setPorts(service.ports.length > 0 ? service.ports : [""]);
    setStartupCmd(service.startup_command || "");
    setNetwork(service.network || "");
    setRestart(service.restart || "no");
    setVolumes(service.volumes || []);
    setEnvVars(service.env_vars);
  }, [service]);

  const handleSave = () => {
    onUpdate({
      ...service,
      name,
      image: imageSource === "image" ? imageName || null : null,
      dockerfile: imageSource === "dockerfile" ? dockerfile || null : null,
      ports: ports.filter(Boolean),
      startup_command: startupCmd || null,
      network: network || null,
      restart: restart === "no" ? null : restart,
      volumes: volumes.length > 0 ? volumes : null,
      env_vars: envVars,
    });
  };

  return (
    <>
      {/* Service Name */}
      <div className="glass-panel rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">Service Name</h3>
        <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 text-xs font-mono" />
        <p className="text-[10px] text-muted-foreground">This name is used as the container name.</p>
      </div>

      {/* Image Source */}
      <div className="glass-panel rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <ImageIcon className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Image Source</h3>
        </div>
        <div className="flex gap-1">
          <button className={`flex-1 text-xs px-2 py-1 rounded border transition-colors ${imageSource === "dockerfile" ? "bg-primary text-primary-foreground border-primary" : "bg-muted/30 border-[var(--glass-border)]"}`} onClick={() => setImageSource("dockerfile")}>Dockerfile</button>
          <button className={`flex-1 text-xs px-2 py-1 rounded border transition-colors ${imageSource === "image" ? "bg-primary text-primary-foreground border-primary" : "bg-muted/30 border-[var(--glass-border)]"}`} onClick={() => setImageSource("image")}>Image</button>
        </div>
        {imageSource === "dockerfile" ? (
          <Input placeholder="Dockerfile (inherit from project)" value={dockerfile} onChange={(e) => setDockerfile(e.target.value)} className="h-7 text-xs font-mono" />
        ) : (
          <Input placeholder="e.g. postgres:16, redis:7-alpine" value={imageName} onChange={(e) => setImageName(e.target.value)} className="h-7 text-xs font-mono" />
        )}
      </div>

      {/* Network */}
      <div className="glass-panel rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Network className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Network</h3>
        </div>
        <select value={network} onChange={(e) => setNetwork(e.target.value)} className="w-full h-7 text-xs font-mono bg-transparent border border-[var(--glass-border)] rounded-md px-2 appearance-none">
          <option value="">Inherit from project</option>
          {networkList.map((n) => <option key={n} value={n}>{n}</option>)}
        </select>
      </div>

      {/* Ports */}
      <div className="glass-panel rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Ports</h3>
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setPorts([...ports, ""])}><Plus className="h-3 w-3 mr-1" /> Add</Button>
        </div>
        {ports.map((port, i) => (
          <div key={i} className="flex items-center gap-2">
            <Input placeholder="8080:8080" value={port} onChange={(e) => { const next = [...ports]; next[i] = e.target.value; setPorts(next); }} className="h-7 text-xs font-mono flex-1" />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setPorts(ports.filter((_, j) => j !== i))} disabled={ports.length <= 1}><Trash2 className="h-3 w-3" /></Button>
          </div>
        ))}
        <p className="text-[10px] text-muted-foreground">host:container (e.g. 3000:3000)</p>
      </div>

      {/* Volumes */}
      <div className="glass-panel rounded-lg p-4 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Volumes</h3>
          </div>
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setVolumes([...volumes, { mount_type: "bind", source: "", target: "", readonly: false }])}><Plus className="h-3 w-3 mr-1" /> Add</Button>
        </div>
        {volumes.length === 0 && (
          <p className="text-[10px] text-muted-foreground">No volumes. Inherits from project defaults.</p>
        )}
        {volumes.map((vol, i) => (
          <div key={i} className="flex items-center gap-2">
            <select value={vol.mount_type} onChange={(e) => { const next = [...volumes]; next[i] = { ...vol, mount_type: e.target.value as "bind" | "volume" }; setVolumes(next); }} className="h-7 text-[10px] bg-transparent border border-[var(--glass-border)] rounded-md px-1">
              <option value="bind">Bind</option>
              <option value="volume">Volume</option>
            </select>
            <Input placeholder="source" value={vol.source} onChange={(e) => { const next = [...volumes]; next[i] = { ...vol, source: e.target.value }; setVolumes(next); }} className="h-7 text-xs font-mono flex-1" />
            <Input placeholder="target" value={vol.target} onChange={(e) => { const next = [...volumes]; next[i] = { ...vol, target: e.target.value }; setVolumes(next); }} className="h-7 text-xs font-mono flex-1" />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setVolumes(volumes.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></Button>
          </div>
        ))}
      </div>

      {/* Startup Command */}
      <div className="glass-panel rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Terminal className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Startup Command</h3>
        </div>
        <Input placeholder="Override CMD" value={startupCmd} onChange={(e) => setStartupCmd(e.target.value)} className="h-7 text-xs font-mono" />
      </div>

      {/* Restart Policy */}
      <div className="glass-panel rounded-lg p-4 space-y-3">
        <div className="flex items-center gap-2">
          <RotateCw className="h-4 w-4 text-muted-foreground" />
          <h3 className="text-sm font-semibold">Restart Policy</h3>
        </div>
        <div className="relative">
          <select value={restart} onChange={(e) => setRestart(e.target.value)} className="w-full h-7 text-xs font-mono bg-transparent border border-[var(--glass-border)] rounded-md px-2 pr-7 appearance-none">
            <option value="no">no (default)</option>
            <option value="always">always</option>
            <option value="on-failure">on-failure</option>
            <option value="unless-stopped">unless-stopped</option>
          </select>
          <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground pointer-events-none" />
        </div>
        <p className="text-[10px] text-muted-foreground">Container restart behavior when it exits.</p>
      </div>

      {/* Environment Variables (service-specific) */}
      <div className="glass-panel rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-semibold">Environment Variables</h3>
        <p className="text-[10px] text-muted-foreground">
          Service-specific env vars. These override project-level variables with the same key.
        </p>
        {/* EnvVarTable 사용 - 서비스별 환경변수 편집 */}
        <div className="space-y-2">
          {envVars.map((v, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input placeholder="KEY" value={v.key} onChange={(e) => { const next = [...envVars]; next[i] = { ...v, key: e.target.value }; setEnvVars(next); }} className="h-7 text-xs font-mono flex-1" />
              <Input placeholder="value" value={v.value} onChange={(e) => { const next = [...envVars]; next[i] = { ...v, value: e.target.value }; setEnvVars(next); }} className="h-7 text-xs font-mono flex-1" />
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEnvVars(envVars.filter((_, j) => j !== i))}><Trash2 className="h-3 w-3" /></Button>
            </div>
          ))}
          <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => setEnvVars([...envVars, { key: "", value: "", source: "manual", secret: false, profile: "default" }])}><Plus className="h-3 w-3 mr-1" /> Add Variable</Button>
        </div>
      </div>

      {/* Container Info */}
      {svcStatus?.container_id && svcStatus.status === "running" && (
        <div className="glass-panel rounded-lg p-4 space-y-3">
          <h3 className="text-sm font-semibold">Running Container</h3>
          <div className="flex items-center gap-2 rounded bg-muted/20 px-3 py-2">
            <div className="h-2 w-2 rounded-full bg-[var(--status-running-text)]" />
            <code className="text-[11px] font-mono flex-1 truncate">{svcStatus.container_id}</code>
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onOpenTerminal(svcStatus.container_id!)}>
              <SquareTerminal className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-2">
        <Button size="sm" className="flex-1" onClick={handleSave}>
          <Save className="h-3.5 w-3.5 mr-1" /> Save Service
        </Button>
        <Button size="sm" variant="destructive" onClick={() => onRemove(serviceId)}>
          <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
        </Button>
      </div>
    </>
  );
}
```

- [ ] **Step 4: 기존 ServiceCard 컴포넌트 제거**

ServiceCard 인터페이스와 함수 전체를 삭제한다 (line 951~1181).

- [ ] **Step 5: 서비스 없을 때 탭 바 숨김 확인**

서비스가 0개인 경우 탭 바가 표시되지 않으므로, Default 탭의 Services 섹션에서만 Compose Import로 서비스를 추가할 수 있다. `activeTab`이 "default"이 아닌 삭제된 서비스를 가리킬 경우 자동으로 default로 돌아가도록 보호:

```tsx
  // 삭제된 서비스 탭 보호
  useEffect(() => {
    if (activeTab !== "default" && !project.services.find((s) => s.id === activeTab)) {
      setActiveTab("default");
    }
  }, [project.services, activeTab]);
```

- [ ] **Step 6: npm run build 및 UI 확인**

Run: `npm run build 2>&1 | head -30`
Expected: 성공

- [ ] **Step 7: Commit**

```bash
git add src/components/containers/ProjectDetail.tsx
git commit -m "feat: ProjectDetail을 서비스별 서브탭 구조로 리팩터링"
```

---

### Task 5: 최종 빌드 검증 및 정리

- [ ] **Step 1: Rust 빌드 확인**

Run: `cargo check --manifest-path src-tauri/Cargo.toml`
Expected: 성공 (warning만 허용)

- [ ] **Step 2: Frontend 빌드 확인**

Run: `npm run build`
Expected: 성공

- [ ] **Step 3: 전체 Tauri dev 실행 확인**

Run: `npm run tauri dev`
Expected: 앱이 정상 실행되고, 프로젝트 상세 화면에서 탭이 표시됨

- [ ] **Step 4: 최종 Commit**

```bash
git add -A
git commit -m "chore: 서비스 서브탭 + compose restart 정책 최종 정리"
```
