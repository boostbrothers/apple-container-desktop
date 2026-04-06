# Docker Compose Container Grouping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Docker Compose로 실행된 컨테이너들을 프로젝트 단위로 묶어 아코디언 UI로 표시하고, 그룹 단위 + 개별 액션을 모두 지원

**Architecture:** Backend에서 `docker ps --format json` 출력의 Labels 필드를 파싱하여 `com.docker.compose.project`/`service` 라벨을 추출. Frontend에서 compose_project 기준으로 그룹핑 후 ComposeGroup 아코디언 컴포넌트로 렌더링.

**Tech Stack:** Tauri 2 (Rust), React 19, TanStack React Query, Tailwind CSS, shadcn/ui, Lucide Icons

---

## File Structure

### New files
| File | Responsibility |
|------|---------------|
| `src/components/containers/ComposeGroup.tsx` | Compose 그룹 아코디언 컴포넌트 (헤더 + 그룹 액션 + 개별 컨테이너) |

### Modified files
| File | Changes |
|------|---------|
| `src-tauri/src/cli/types.rs` | DockerPsEntry에 labels 필드 추가, Container에 compose_project/compose_service 추가, From 구현에 라벨 파싱 |
| `src/types/index.ts` | Container에 compose_project, compose_service 필드 추가 |
| `src/components/containers/ContainerList.tsx` | 그룹핑 로직 + ComposeGroup 렌더링 |
| `src/components/containers/ContainerRow.tsx` | compose_service 표시 지원 (선택적 prop) |

---

### Task 1: Backend — Labels 파싱 및 Compose 필드 추가

**Files:**
- Modify: `src-tauri/src/cli/types.rs`

- [ ] **Step 1: DockerPsEntry에 labels 필드 추가**

In `src-tauri/src/cli/types.rs`, replace the DockerPsEntry struct:

```rust
#[derive(Debug, Deserialize)]
#[serde(rename_all = "PascalCase")]
pub struct DockerPsEntry {
    #[serde(rename = "ID")]
    pub id: String,
    pub names: String,
    pub image: String,
    pub state: String,
    pub status: String,
    pub ports: String,
    pub created_at: String,
    #[serde(default)]
    pub labels: String,
}
```

- [ ] **Step 2: Container에 compose 필드 추가**

Replace the Container struct:

```rust
#[derive(Debug, Serialize, Clone)]
pub struct Container {
    pub id: String,
    pub name: String,
    pub image: String,
    pub state: String,
    pub status: String,
    pub ports: String,
    pub created_at: String,
    pub compose_project: Option<String>,
    pub compose_service: Option<String>,
}
```

- [ ] **Step 3: From 구현에 라벨 파싱 추가**

Replace the `From<DockerPsEntry> for Container` impl:

```rust
impl From<DockerPsEntry> for Container {
    fn from(entry: DockerPsEntry) -> Self {
        let mut compose_project = None;
        let mut compose_service = None;

        for part in entry.labels.split(',') {
            let part = part.trim();
            if let Some(val) = part.strip_prefix("com.docker.compose.project=") {
                compose_project = Some(val.to_string());
            } else if let Some(val) = part.strip_prefix("com.docker.compose.service=") {
                compose_service = Some(val.to_string());
            }
        }

        Container {
            id: entry.id,
            name: entry.names,
            image: entry.image,
            state: entry.state,
            status: entry.status,
            ports: entry.ports,
            created_at: entry.created_at,
            compose_project,
            compose_service,
        }
    }
}
```

- [ ] **Step 4: Verify it compiles**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/src-tauri && cargo check`
Expected: compiles with no errors

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/cli/types.rs
git commit -m "feat(backend): add compose project/service labels parsing to Container"
```

---

### Task 2: Frontend Types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Container 인터페이스에 compose 필드 추가**

In `src/types/index.ts`, replace the Container interface:

```typescript
export interface Container {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  ports: string;
  created_at: string;
  compose_project: string | null;
  compose_service: string | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add src/types/index.ts
git commit -m "feat(frontend): add compose_project and compose_service to Container type"
```

---

### Task 3: ComposeGroup Component

**Files:**
- Create: `src/components/containers/ComposeGroup.tsx`

- [ ] **Step 1: Create ComposeGroup component**

Create `src/components/containers/ComposeGroup.tsx`:

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { Container } from "../../types";
import { useContainerAction } from "../../hooks/useContainers";
import { ContainerRow } from "./ContainerRow";

interface ComposeGroupProps {
  project: string;
  containers: Container[];
  onViewLogs: (id: string) => void;
}

export function ComposeGroup({ project, containers, onViewLogs }: ComposeGroupProps) {
  const [expanded, setExpanded] = useState(false);
  const action = useContainerAction();

  const runningCount = containers.filter((c) => c.state === "running").length;
  const totalCount = containers.length;
  const allRunning = runningCount === totalCount;
  const allStopped = runningCount === 0;

  const handleGroupAction = async (type: "start" | "stop" | "restart" | "remove") => {
    const targets = containers.filter((c) => {
      if (type === "start") return c.state !== "running";
      if (type === "stop") return c.state === "running";
      return true;
    });
    for (const c of targets) {
      action.mutate({ id: c.id, action: type });
    }
  };

  return (
    <div className="rounded-md border">
      <div
        className="flex items-center gap-2 px-4 py-3 cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        )}
        <span className="font-medium text-sm">{project}</span>
        <Badge variant={allRunning ? "default" : allStopped ? "secondary" : "outline"} className="text-xs">
          {runningCount}/{totalCount} running
        </Badge>
        <div className="ml-auto flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="sm" onClick={() => handleGroupAction("start")} disabled={action.isPending || allRunning}>
            Start
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleGroupAction("stop")} disabled={action.isPending || allStopped}>
            Stop
          </Button>
          <Button variant="ghost" size="sm" onClick={() => handleGroupAction("restart")} disabled={action.isPending}>
            Restart
          </Button>
          <Button variant="ghost" size="sm" className="text-destructive" onClick={() => handleGroupAction("remove")} disabled={action.isPending}>
            Remove
          </Button>
        </div>
      </div>
      {expanded && (
        <div className="border-t">
          {containers.map((container) => (
            <div key={container.id} className="pl-6">
              <ContainerRow container={container} onViewLogs={onViewLogs} showServiceName />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/containers/ComposeGroup.tsx
git commit -m "feat(frontend): add ComposeGroup accordion component"
```

---

### Task 4: ContainerRow — Service Name 표시 지원

**Files:**
- Modify: `src/components/containers/ContainerRow.tsx`

- [ ] **Step 1: showServiceName prop 추가**

Replace the full `src/components/containers/ContainerRow.tsx`:

```tsx
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { Container } from "../../types";
import { useContainerAction } from "../../hooks/useContainers";

interface ContainerRowProps {
  container: Container;
  onViewLogs: (id: string) => void;
  showServiceName?: boolean;
}

export function ContainerRow({ container, onViewLogs, showServiceName }: ContainerRowProps) {
  const action = useContainerAction();
  const isRunning = container.state === "running";
  const displayName = showServiceName && container.compose_service
    ? container.compose_service
    : container.name;

  return (
    <div className="flex items-center gap-3 rounded-md border px-4 py-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm truncate">{displayName}</span>
          <Badge variant={isRunning ? "default" : "secondary"} className="text-xs">
            {container.state}
          </Badge>
        </div>
        <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="truncate">{container.image}</span>
          {container.ports && <span>{container.ports}</span>}
        </div>
      </div>
      <div className="flex items-center gap-1">
        {isRunning ? (
          <Button variant="ghost" size="sm" onClick={() => action.mutate({ id: container.id, action: "stop" })} disabled={action.isPending}>Stop</Button>
        ) : (
          <Button variant="ghost" size="sm" onClick={() => action.mutate({ id: container.id, action: "start" })} disabled={action.isPending}>Start</Button>
        )}
        <Button variant="ghost" size="sm" onClick={() => action.mutate({ id: container.id, action: "restart" })} disabled={action.isPending}>Restart</Button>
        <Button variant="ghost" size="sm" onClick={() => onViewLogs(container.id)}>Logs</Button>
        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => action.mutate({ id: container.id, action: "remove" })} disabled={action.isPending}>Remove</Button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/containers/ContainerRow.tsx
git commit -m "feat(frontend): support service name display in ContainerRow"
```

---

### Task 5: ContainerList — 그룹핑 로직

**Files:**
- Modify: `src/components/containers/ContainerList.tsx`

- [ ] **Step 1: 그룹핑 로직 추가 및 ComposeGroup 렌더링**

Replace the full `src/components/containers/ContainerList.tsx`:

```tsx
import { useState, useMemo } from "react";
import { useContainers } from "../../hooks/useContainers";
import { ContainerRow } from "./ContainerRow";
import { ComposeGroup } from "./ComposeGroup";
import { ContainerLogs } from "./ContainerLogs";
import { Button } from "@/components/ui/button";
import type { Container } from "../../types";

type Filter = "all" | "running" | "stopped";

interface ComposeGroupData {
  project: string;
  containers: Container[];
}

export function ContainerList() {
  const { data: containers, isLoading, error } = useContainers();
  const [filter, setFilter] = useState<Filter>("all");
  const [logsContainerId, setLogsContainerId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!containers) return [];
    return containers.filter((c) => {
      if (filter === "running") return c.state === "running";
      if (filter === "stopped") return c.state !== "running";
      return true;
    });
  }, [containers, filter]);

  const { composeGroups, standalone } = useMemo(() => {
    const groupMap = new Map<string, Container[]>();
    const standalone: Container[] = [];

    for (const c of filtered) {
      if (c.compose_project) {
        const group = groupMap.get(c.compose_project) ?? [];
        group.push(c);
        groupMap.set(c.compose_project, group);
      } else {
        standalone.push(c);
      }
    }

    const composeGroups: ComposeGroupData[] = Array.from(groupMap.entries()).map(
      ([project, containers]) => ({ project, containers })
    );

    return { composeGroups, standalone };
  }, [filtered]);

  if (logsContainerId) {
    return <ContainerLogs containerId={logsContainerId} onBack={() => setLogsContainerId(null)} />;
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-lg font-semibold">Containers</h1>
        <div className="flex gap-1">
          {(["all", "running", "stopped"] as Filter[]).map((f) => (
            <Button key={f} variant={filter === f ? "default" : "outline"} size="sm" onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </div>
      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
      {error && <p className="text-sm text-destructive">Failed to load containers. Is Colima running?</p>}
      <div className="flex flex-col gap-2">
        {composeGroups.map((group) => (
          <ComposeGroup
            key={group.project}
            project={group.project}
            containers={group.containers}
            onViewLogs={setLogsContainerId}
          />
        ))}
        {standalone.map((container) => (
          <ContainerRow key={container.id} container={container} onViewLogs={setLogsContainerId} />
        ))}
        {composeGroups.length === 0 && standalone.length === 0 && !isLoading && (
          <p className="text-sm text-muted-foreground">No containers found.</p>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/containers/ContainerList.tsx
git commit -m "feat(frontend): group compose containers in ContainerList"
```

---

### Task 6: Build & Verify

- [ ] **Step 1: Run Rust cargo check**

Run: `cd /Users/yoonho.go/workspace/colima-desktop/src-tauri && cargo check`
Expected: No errors

- [ ] **Step 2: Run TypeScript type check**

Run: `npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Final commit if any fixes needed**

If fixes were needed, commit them:
```bash
git add -A
git commit -m "fix: address issues found during compose grouping verification"
```
