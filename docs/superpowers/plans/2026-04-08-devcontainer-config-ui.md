# DevContainer Configuration UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DevContainer 프로젝트의 `devcontainer.json` 설정을 GUI에서 읽고/편집/생성할 수 있는 기능을 추가한다.

**Architecture:** Rust 백엔드에서 devcontainer.json 파일 I/O와 JSON Schema 검증을 수행하고, React 프론트엔드에서 탭 기반 폼 UI + JSON 에디터 폴백을 제공한다. 핵심 속성(name, image, build, features, ports, env, lifecycle)은 전용 폼으로, 나머지는 raw JSON 편집기로 다룬다.

**Tech Stack:** Tauri 2 (Rust), React 19, TanStack React Query, Tailwind CSS 4, jsonschema (Rust crate)

**Spec:** `docs/superpowers/specs/2026-04-08-devcontainer-config-ui-design.md`

---

## File Structure

### New Files

```
src-tauri/schemas/devContainer.base.schema.json    # Embedded JSON Schema (downloaded)
src-tauri/src/commands/devcontainer_config.rs       # 3 Tauri commands: read/write/validate

src/hooks/useDevcontainerConfig.ts                  # React Query hooks (3 hooks) — NOTE: replaces existing hook in useDevcontainers.ts
src/components/devcontainer-config/
├── DevcontainerConfigEditor.tsx                    # Top-level: tab management, state, ActionBar
├── GeneralTab.tsx                                  # name, image/build, workspaceFolder, remoteUser, shutdownAction, overrideCommand
├── FeaturesTab.tsx                                 # features map editor
├── PortsEnvTab.tsx                                 # forwardPorts, containerEnv, remoteEnv
├── LifecycleTab.tsx                                # 6 lifecycle commands + waitFor
├── JsonEditorTab.tsx                               # raw JSON textarea editor with validation
└── KeyValueTable.tsx                               # Reusable key-value pair editor
```

### Modified Files

```
src-tauri/Cargo.toml                                # Add jsonschema dependency
src-tauri/src/commands/mod.rs                       # Register devcontainer_config module
src-tauri/src/lib.rs                                # Register 3 new commands
src/types/index.ts                                  # Add ValidationError, ConfigTab types
src/lib/tauri.ts                                    # Add 3 API wrappers
src/hooks/useDevcontainers.ts                       # Remove old useDevcontainerConfig (moved to new file)
src/components/containers/DevContainerGroup.tsx      # Add "Settings" button → opens editor
src/components/containers/AddProjectDialog.tsx       # Add config editor for new projects without devcontainer.json
```

---

### Task 1: Rust — Add jsonschema dependency and embed schema

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Create: `src-tauri/schemas/devContainer.base.schema.json`

- [ ] **Step 1: Add jsonschema crate to Cargo.toml**

Add after the `tempfile` line in `[dependencies]`:

```toml
jsonschema = "0.29"
```

- [ ] **Step 2: Download and embed the devcontainer base schema**

```bash
mkdir -p src-tauri/schemas
curl -fsSL https://raw.githubusercontent.com/devcontainers/spec/refs/heads/main/schemas/devContainer.base.schema.json \
  -o src-tauri/schemas/devContainer.base.schema.json
```

- [ ] **Step 3: Verify cargo builds with new dependency**

```bash
cd src-tauri && cargo check
```

Expected: Build succeeds with no errors (warnings OK).

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/schemas/devContainer.base.schema.json
git commit -m "chore: add jsonschema crate and embed devcontainer schema"
```

---

### Task 2: Rust — Implement devcontainer_config commands

**Files:**
- Create: `src-tauri/src/commands/devcontainer_config.rs`

- [ ] **Step 1: Create devcontainer_config.rs with ValidationError and helper functions**

```rust
use serde::Serialize;

#[derive(Debug, Serialize, Clone)]
pub struct ValidationError {
    pub path: String,
    pub message: String,
}

const DEFAULT_IMAGE: &str = "mcr.microsoft.com/devcontainers/base:ubuntu";

fn find_devcontainer_json(workspace_path: &str) -> Option<std::path::PathBuf> {
    let base = std::path::Path::new(workspace_path);
    // Priority: .devcontainer/devcontainer.json > .devcontainer.json
    let primary = base.join(".devcontainer").join("devcontainer.json");
    if primary.exists() {
        return Some(primary);
    }
    let fallback = base.join(".devcontainer.json");
    if fallback.exists() {
        return Some(fallback);
    }
    None
}

fn default_config() -> serde_json::Value {
    serde_json::json!({
        "image": DEFAULT_IMAGE
    })
}

fn validate_config(config: &serde_json::Value) -> Vec<ValidationError> {
    let schema_str = include_str!("../../schemas/devContainer.base.schema.json");
    let schema: serde_json::Value = match serde_json::from_str(schema_str) {
        Ok(s) => s,
        Err(e) => {
            return vec![ValidationError {
                path: "".to_string(),
                message: format!("Failed to parse schema: {}", e),
            }];
        }
    };

    let validator = match jsonschema::validator_for(&schema) {
        Ok(v) => v,
        Err(e) => {
            return vec![ValidationError {
                path: "".to_string(),
                message: format!("Failed to compile schema: {}", e),
            }];
        }
    };

    validator
        .iter_errors(config)
        .map(|error| ValidationError {
            path: error.instance_path.to_string(),
            message: error.to_string(),
        })
        .collect()
}
```

- [ ] **Step 2: Implement the 3 Tauri commands**

Append to the same file:

```rust
#[derive(Debug, Serialize, Clone)]
pub struct DevcontainerConfigResponse {
    pub config: serde_json::Value,
    pub exists: bool,
}

#[tauri::command]
pub async fn read_devcontainer_json(workspace_path: String) -> Result<DevcontainerConfigResponse, String> {
    match find_devcontainer_json(&workspace_path) {
        Some(path) => {
            let content = std::fs::read_to_string(&path)
                .map_err(|e| format!("Failed to read {}: {}", path.display(), e))?;
            let config: serde_json::Value = serde_json::from_str(&content)
                .map_err(|e| format!("Invalid JSON in {}: {}", path.display(), e))?;
            Ok(DevcontainerConfigResponse { config, exists: true })
        }
        None => Ok(DevcontainerConfigResponse {
            config: default_config(),
            exists: false,
        }),
    }
}

#[tauri::command]
pub async fn write_devcontainer_json(
    workspace_path: String,
    config: serde_json::Value,
) -> Result<(), String> {
    // Validate first
    let errors = validate_config(&config);
    if !errors.is_empty() {
        let err_json = serde_json::to_string(&errors)
            .unwrap_or_else(|_| "Validation failed".to_string());
        return Err(format!("VALIDATION:{}", err_json));
    }

    // Ensure .devcontainer directory exists
    let dir = std::path::Path::new(&workspace_path).join(".devcontainer");
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("Failed to create .devcontainer directory: {}", e))?;

    let path = dir.join("devcontainer.json");
    let content = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;

    std::fs::write(&path, format!("{}\n", content))
        .map_err(|e| format!("Failed to write {}: {}", path.display(), e))?;

    Ok(())
}

#[tauri::command]
pub async fn validate_devcontainer_json(config: serde_json::Value) -> Result<Vec<ValidationError>, String> {
    Ok(validate_config(&config))
}
```

- [ ] **Step 3: Verify file compiles (after Task 3 registration, or with `#[allow(dead_code)]`)**

This will be verified after Task 3.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/devcontainer_config.rs
git commit -m "feat: add devcontainer config read/write/validate commands"
```

---

### Task 3: Rust — Register commands and verify build

**Files:**
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: Register module in mod.rs**

Add after `pub mod devcontainer;`:

```rust
pub mod devcontainer_config;
```

- [ ] **Step 2: Register commands in lib.rs**

Add after the `commands::devcontainer::devcontainer_read_config,` line:

```rust
            commands::devcontainer_config::read_devcontainer_json,
            commands::devcontainer_config::write_devcontainer_json,
            commands::devcontainer_config::validate_devcontainer_json,
```

- [ ] **Step 3: Verify full cargo build**

```bash
cd src-tauri && cargo check
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat: register devcontainer config commands"
```

---

### Task 4: Frontend — Types, API wrappers, and hooks

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/tauri.ts`
- Create: `src/hooks/useDevcontainerConfig.ts`
- Modify: `src/hooks/useDevcontainers.ts`

- [ ] **Step 1: Add types to src/types/index.ts**

Add at the end of the file:

```typescript
// DevContainer Config Editor types

export interface DevcontainerConfigResponse {
  config: Record<string, unknown>;
  exists: boolean;
}

export interface DevcontainerValidationError {
  path: string;
  message: string;
}

export type ConfigTab = "general" | "features" | "ports-env" | "lifecycle" | "json";
export type DevcontainerSourceType = "image" | "dockerfile";
```

- [ ] **Step 2: Add API wrappers to src/lib/tauri.ts**

Add the import for the new types at the top (extend the existing import line):

Add `DevcontainerConfigResponse, DevcontainerValidationError` to the import from `"../types"`.

Add at the end of the `api` object (before the closing `};`):

```typescript
  // DevContainer Config
  readDevcontainerJson: (workspacePath: string) =>
    invoke<DevcontainerConfigResponse>("read_devcontainer_json", { workspacePath }),
  writeDevcontainerJson: (workspacePath: string, config: Record<string, unknown>) =>
    invoke<void>("write_devcontainer_json", { workspacePath, config }),
  validateDevcontainerJson: (config: Record<string, unknown>) =>
    invoke<DevcontainerValidationError[]>("validate_devcontainer_json", { config }),
```

- [ ] **Step 3: Create src/hooks/useDevcontainerConfig.ts**

```typescript
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";
import type { DevcontainerValidationError } from "../types";

export function useDevcontainerJsonConfig(workspacePath: string) {
  return useQuery({
    queryKey: ["devcontainer-json", workspacePath],
    queryFn: () => api.readDevcontainerJson(workspacePath),
    enabled: !!workspacePath,
  });
}

export function useSaveDevcontainerConfig() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({
      workspacePath,
      config,
    }: {
      workspacePath: string;
      config: Record<string, unknown>;
    }) => api.writeDevcontainerJson(workspacePath, config),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({
        queryKey: ["devcontainer-json", variables.workspacePath],
      });
      queryClient.invalidateQueries({
        queryKey: ["devcontainer-config"],
      });
    },
  });
}

export function useValidateDevcontainerConfig() {
  return useMutation({
    mutationFn: (config: Record<string, unknown>) =>
      api.validateDevcontainerJson(config),
  });
}

export function parseValidationErrors(error: unknown): DevcontainerValidationError[] {
  if (!(error instanceof Error)) return [];
  const msg = error.message;
  if (msg.startsWith("VALIDATION:")) {
    try {
      return JSON.parse(msg.slice("VALIDATION:".length));
    } catch {
      return [];
    }
  }
  return [];
}
```

- [ ] **Step 4: Remove old useDevcontainerConfig from useDevcontainers.ts**

Remove lines 66-73 in `src/hooks/useDevcontainers.ts` (the `useDevcontainerConfig` function). This is replaced by `useDevcontainerJsonConfig` in the new file.

The old hook was:
```typescript
export function useDevcontainerConfig(workspacePath: string) {
  return useQuery({
    queryKey: ["devcontainer-config", workspacePath],
    queryFn: () => api.devcontainerReadConfig(workspacePath),
    enabled: !!workspacePath,
    staleTime: 30_000,
  });
}
```

Note: `DevContainerGroup.tsx` imports `useDevcontainerConfig` — this reference will be updated in Task 10 (integration).

- [ ] **Step 5: Verify frontend builds**

```bash
npm run build
```

Expected: May show error about `useDevcontainerConfig` import in `DevContainerGroup.tsx`. This is expected and will be fixed in Task 10. If it blocks, temporarily keep the old hook and remove it in Task 10.

- [ ] **Step 6: Commit**

```bash
git add src/types/index.ts src/lib/tauri.ts src/hooks/useDevcontainerConfig.ts src/hooks/useDevcontainers.ts
git commit -m "feat: add devcontainer config types, API, and hooks"
```

---

### Task 5: Frontend — KeyValueTable reusable component

**Files:**
- Create: `src/components/devcontainer-config/KeyValueTable.tsx`

- [ ] **Step 1: Create KeyValueTable component**

```typescript
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";

interface KeyValueTableProps {
  entries: Record<string, string>;
  onChange: (entries: Record<string, string>) => void;
  keyPlaceholder?: string;
  valuePlaceholder?: string;
  readOnly?: boolean;
}

export function KeyValueTable({
  entries,
  onChange,
  keyPlaceholder = "Key",
  valuePlaceholder = "Value",
  readOnly = false,
}: KeyValueTableProps) {
  const [newKey, setNewKey] = useState("");
  const [newValue, setNewValue] = useState("");

  const pairs = Object.entries(entries);

  const handleAdd = () => {
    const key = newKey.trim();
    if (!key) return;
    onChange({ ...entries, [key]: newValue });
    setNewKey("");
    setNewValue("");
  };

  const handleRemove = (key: string) => {
    const next = { ...entries };
    delete next[key];
    onChange(next);
  };

  const handleValueChange = (key: string, value: string) => {
    onChange({ ...entries, [key]: value });
  };

  return (
    <div className="space-y-1.5">
      {pairs.map(([key, value]) => (
        <div key={key} className="flex items-center gap-2">
          <Input
            value={key}
            readOnly
            className="flex-1 font-mono text-xs h-8 bg-muted/30"
          />
          <Input
            value={value}
            onChange={(e) => handleValueChange(key, e.target.value)}
            readOnly={readOnly}
            className="flex-1 font-mono text-xs h-8"
          />
          {!readOnly && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={() => handleRemove(key)}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ))}

      {!readOnly && (
        <div className="flex items-center gap-2">
          <Input
            value={newKey}
            onChange={(e) => setNewKey(e.target.value)}
            placeholder={keyPlaceholder}
            className="flex-1 font-mono text-xs h-8"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Input
            value={newValue}
            onChange={(e) => setNewValue(e.target.value)}
            placeholder={valuePlaceholder}
            className="flex-1 font-mono text-xs h-8"
            onKeyDown={(e) => e.key === "Enter" && handleAdd()}
          />
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0"
            onClick={handleAdd}
            disabled={!newKey.trim()}
          >
            <Plus className="h-3.5 w-3.5" />
          </Button>
        </div>
      )}

      {pairs.length === 0 && readOnly && (
        <p className="text-xs text-muted-foreground">No entries.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/devcontainer-config/KeyValueTable.tsx
git commit -m "feat: add KeyValueTable reusable component"
```

---

### Task 6: Frontend — GeneralTab component

**Files:**
- Create: `src/components/devcontainer-config/GeneralTab.tsx`

- [ ] **Step 1: Create GeneralTab component**

```typescript
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { KeyValueTable } from "./KeyValueTable";
import type { DevcontainerSourceType } from "../../types";

interface GeneralTabProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function GeneralTab({ config, onChange }: GeneralTabProps) {
  const sourceType: DevcontainerSourceType =
    config.build && typeof config.build === "object" ? "dockerfile" : "image";

  const build = (config.build as Record<string, unknown>) || {};

  const setField = (key: string, value: unknown) => {
    if (value === "" || value === undefined) {
      const next = { ...config };
      delete next[key];
      onChange(next);
    } else {
      onChange({ ...config, [key]: value });
    }
  };

  const setBuildField = (key: string, value: unknown) => {
    const nextBuild = { ...build };
    if (value === "" || value === undefined) {
      delete nextBuild[key];
    } else {
      nextBuild[key] = value;
    }
    if (Object.keys(nextBuild).length === 0) {
      const next = { ...config };
      delete next.build;
      onChange(next);
    } else {
      onChange({ ...config, build: nextBuild });
    }
  };

  const switchSource = (type: DevcontainerSourceType) => {
    const next = { ...config };
    if (type === "image") {
      delete next.build;
      if (!next.image) next.image = "mcr.microsoft.com/devcontainers/base:ubuntu";
    } else {
      delete next.image;
      next.build = { dockerfile: "Dockerfile" };
    }
    onChange(next);
  };

  return (
    <div className="space-y-4">
      {/* Name */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Name</label>
        <Input
          value={(config.name as string) || ""}
          onChange={(e) => setField("name", e.target.value)}
          placeholder="My Dev Container"
          className="h-8 text-sm"
        />
      </div>

      {/* Source Type */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Source</label>
        <div className="flex gap-1">
          <Button
            variant={sourceType === "image" ? "default" : "outline"}
            size="sm"
            onClick={() => switchSource("image")}
          >
            Image
          </Button>
          <Button
            variant={sourceType === "dockerfile" ? "default" : "outline"}
            size="sm"
            onClick={() => switchSource("dockerfile")}
          >
            Dockerfile
          </Button>
        </div>
      </div>

      {/* Image fields */}
      {sourceType === "image" && (
        <div>
          <label className="text-xs text-muted-foreground block mb-1">Image</label>
          <Input
            value={(config.image as string) || ""}
            onChange={(e) => setField("image", e.target.value)}
            placeholder="mcr.microsoft.com/devcontainers/base:ubuntu"
            className="h-8 text-sm font-mono"
          />
        </div>
      )}

      {/* Dockerfile fields */}
      {sourceType === "dockerfile" && (
        <>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Dockerfile</label>
            <Input
              value={(build.dockerfile as string) || ""}
              onChange={(e) => setBuildField("dockerfile", e.target.value)}
              placeholder="Dockerfile"
              className="h-8 text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Context</label>
            <Input
              value={(build.context as string) || ""}
              onChange={(e) => setBuildField("context", e.target.value)}
              placeholder="."
              className="h-8 text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Target</label>
            <Input
              value={(build.target as string) || ""}
              onChange={(e) => setBuildField("target", e.target.value)}
              placeholder="(optional)"
              className="h-8 text-sm font-mono"
            />
          </div>
          <div>
            <label className="text-xs text-muted-foreground block mb-1">Build Args</label>
            <KeyValueTable
              entries={(build.args as Record<string, string>) || {}}
              onChange={(args) => setBuildField("args", Object.keys(args).length > 0 ? args : undefined)}
              keyPlaceholder="ARG_NAME"
              valuePlaceholder="value"
            />
          </div>
        </>
      )}

      {/* Common fields */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Workspace Folder</label>
        <Input
          value={(config.workspaceFolder as string) || ""}
          onChange={(e) => setField("workspaceFolder", e.target.value)}
          placeholder="/workspaces/project"
          className="h-8 text-sm font-mono"
        />
      </div>

      <div>
        <label className="text-xs text-muted-foreground block mb-1">Remote User</label>
        <Input
          value={(config.remoteUser as string) || ""}
          onChange={(e) => setField("remoteUser", e.target.value)}
          placeholder="vscode"
          className="h-8 text-sm"
        />
      </div>

      {/* Shutdown Action */}
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Shutdown Action</label>
        <div className="flex gap-1">
          {(["none", "stopContainer"] as const).map((val) => (
            <Button
              key={val}
              variant={(config.shutdownAction || "stopContainer") === val ? "default" : "outline"}
              size="sm"
              onClick={() => setField("shutdownAction", val === "stopContainer" ? undefined : val)}
            >
              {val}
            </Button>
          ))}
        </div>
      </div>

      {/* Override Command */}
      <div className="flex items-center justify-between">
        <label className="text-xs text-muted-foreground">Override Command</label>
        <button
          type="button"
          role="switch"
          aria-checked={config.overrideCommand !== false}
          className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
            config.overrideCommand !== false ? "bg-primary" : "bg-muted"
          }`}
          onClick={() => setField("overrideCommand", config.overrideCommand === false ? undefined : false)}
        >
          <span
            className={`pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform ${
              config.overrideCommand !== false ? "translate-x-4" : "translate-x-0"
            }`}
          />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/devcontainer-config/GeneralTab.tsx
git commit -m "feat: add GeneralTab component for devcontainer config"
```

---

### Task 7: Frontend — FeaturesTab and PortsEnvTab

**Files:**
- Create: `src/components/devcontainer-config/FeaturesTab.tsx`
- Create: `src/components/devcontainer-config/PortsEnvTab.tsx`

- [ ] **Step 1: Create FeaturesTab component**

```typescript
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2, ChevronDown, ChevronRight } from "lucide-react";
import { KeyValueTable } from "./KeyValueTable";

interface FeaturesTabProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function FeaturesTab({ config, onChange }: FeaturesTabProps) {
  const features = (config.features as Record<string, Record<string, string>>) || {};
  const [newFeatureId, setNewFeatureId] = useState("");
  const [expandedFeature, setExpandedFeature] = useState<string | null>(null);

  const setFeatures = (next: Record<string, unknown>) => {
    if (Object.keys(next).length === 0) {
      const updated = { ...config };
      delete updated.features;
      onChange(updated);
    } else {
      onChange({ ...config, features: next });
    }
  };

  const handleAdd = () => {
    const id = newFeatureId.trim();
    if (!id) return;
    setFeatures({ ...features, [id]: {} });
    setNewFeatureId("");
    setExpandedFeature(id);
  };

  const handleRemove = (id: string) => {
    const next = { ...features };
    delete next[id];
    setFeatures(next);
    if (expandedFeature === id) setExpandedFeature(null);
  };

  const handleOptionsChange = (id: string, options: Record<string, string>) => {
    setFeatures({
      ...features,
      [id]: Object.keys(options).length > 0 ? options : {},
    });
  };

  const featureEntries = Object.entries(features);

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Add dev container features by their ID (e.g., ghcr.io/devcontainers/features/node:1).
      </p>

      {featureEntries.map(([id, options]) => (
        <div key={id} className="glass-card overflow-hidden">
          <div
            className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[var(--glass-bg-hover)] transition-all"
            onClick={() => setExpandedFeature(expandedFeature === id ? null : id)}
          >
            {expandedFeature === id ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            )}
            <span className="text-xs font-mono truncate flex-1">{id}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
              onClick={(e) => {
                e.stopPropagation();
                handleRemove(id);
              }}
            >
              <Trash2 className="h-3 w-3" />
            </Button>
          </div>
          {expandedFeature === id && (
            <div className="border-t border-[var(--glass-border)] px-3 py-2">
              <label className="text-[10px] uppercase text-muted-foreground block mb-1">Options</label>
              <KeyValueTable
                entries={(options as Record<string, string>) || {}}
                onChange={(opts) => handleOptionsChange(id, opts)}
                keyPlaceholder="option"
                valuePlaceholder="value"
              />
            </div>
          )}
        </div>
      ))}

      <div className="flex items-center gap-2">
        <Input
          value={newFeatureId}
          onChange={(e) => setNewFeatureId(e.target.value)}
          placeholder="ghcr.io/devcontainers/features/node:1"
          className="flex-1 font-mono text-xs h-8"
          onKeyDown={(e) => e.key === "Enter" && handleAdd()}
        />
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
          onClick={handleAdd}
          disabled={!newFeatureId.trim()}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>

      {featureEntries.length === 0 && (
        <p className="text-xs text-muted-foreground">No features added.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Create PortsEnvTab component**

```typescript
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Trash2 } from "lucide-react";
import { KeyValueTable } from "./KeyValueTable";

interface PortsEnvTabProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

export function PortsEnvTab({ config, onChange }: PortsEnvTabProps) {
  const forwardPorts = (config.forwardPorts as (number | string)[]) || [];
  const containerEnv = (config.containerEnv as Record<string, string>) || {};
  const remoteEnv = (config.remoteEnv as Record<string, string>) || {};
  const [newPort, setNewPort] = useState("");

  const setField = (key: string, value: unknown) => {
    if (
      value === undefined ||
      (Array.isArray(value) && value.length === 0) ||
      (typeof value === "object" && value !== null && Object.keys(value).length === 0)
    ) {
      const next = { ...config };
      delete next[key];
      onChange(next);
    } else {
      onChange({ ...config, [key]: value });
    }
  };

  const handleAddPort = () => {
    const port = newPort.trim();
    if (!port) return;
    const portNum = parseInt(port, 10);
    const value = isNaN(portNum) ? port : portNum;
    setField("forwardPorts", [...forwardPorts, value]);
    setNewPort("");
  };

  const handleRemovePort = (index: number) => {
    const next = forwardPorts.filter((_, i) => i !== index);
    setField("forwardPorts", next.length > 0 ? next : undefined);
  };

  return (
    <div className="space-y-6">
      {/* Forward Ports */}
      <div>
        <label className="text-xs font-medium block mb-2">Forward Ports</label>
        <div className="space-y-1.5">
          {forwardPorts.map((port, i) => (
            <div key={i} className="flex items-center gap-2">
              <Input
                value={String(port)}
                readOnly
                className="flex-1 font-mono text-xs h-8 bg-muted/30"
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 shrink-0 text-muted-foreground hover:text-destructive"
                onClick={() => handleRemovePort(i)}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input
              value={newPort}
              onChange={(e) => setNewPort(e.target.value)}
              placeholder="3000"
              className="flex-1 font-mono text-xs h-8"
              onKeyDown={(e) => e.key === "Enter" && handleAddPort()}
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 shrink-0"
              onClick={handleAddPort}
              disabled={!newPort.trim()}
            >
              <Plus className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Container Env */}
      <div>
        <label className="text-xs font-medium block mb-2">Container Environment Variables</label>
        <p className="text-[10px] text-muted-foreground mb-1.5">
          Set at container creation. Requires rebuild to change.
        </p>
        <KeyValueTable
          entries={containerEnv}
          onChange={(env) => setField("containerEnv", env)}
          keyPlaceholder="ENV_NAME"
          valuePlaceholder="value"
        />
      </div>

      {/* Remote Env */}
      <div>
        <label className="text-xs font-medium block mb-2">Remote Environment Variables</label>
        <p className="text-[10px] text-muted-foreground mb-1.5">
          Set for remote processes. Can be updated without rebuild.
        </p>
        <KeyValueTable
          entries={remoteEnv}
          onChange={(env) => setField("remoteEnv", env)}
          keyPlaceholder="ENV_NAME"
          valuePlaceholder="value"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/devcontainer-config/FeaturesTab.tsx src/components/devcontainer-config/PortsEnvTab.tsx
git commit -m "feat: add FeaturesTab and PortsEnvTab components"
```

---

### Task 8: Frontend — LifecycleTab and JsonEditorTab

**Files:**
- Create: `src/components/devcontainer-config/LifecycleTab.tsx`
- Create: `src/components/devcontainer-config/JsonEditorTab.tsx`

- [ ] **Step 1: Create LifecycleTab component**

```typescript
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface LifecycleTabProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

const LIFECYCLE_COMMANDS = [
  { key: "initializeCommand", label: "Initialize Command", description: "Runs on the host before container creation." },
  { key: "onCreateCommand", label: "On Create Command", description: "Runs inside container after first creation." },
  { key: "updateContentCommand", label: "Update Content Command", description: "Runs after content update (e.g., git pull)." },
  { key: "postCreateCommand", label: "Post Create Command", description: "Runs after onCreateCommand completes." },
  { key: "postStartCommand", label: "Post Start Command", description: "Runs each time the container starts." },
  { key: "postAttachCommand", label: "Post Attach Command", description: "Runs each time a tool attaches." },
] as const;

const WAIT_FOR_OPTIONS = [
  "initializeCommand",
  "onCreateCommand",
  "updateContentCommand",
  "postCreateCommand",
  "postStartCommand",
] as const;

export function LifecycleTab({ config, onChange }: LifecycleTabProps) {
  const setField = (key: string, value: unknown) => {
    if (value === "" || value === undefined) {
      const next = { ...config };
      delete next[key];
      onChange(next);
    } else {
      onChange({ ...config, [key]: value });
    }
  };

  return (
    <div className="space-y-4">
      {LIFECYCLE_COMMANDS.map(({ key, label, description }) => (
        <div key={key}>
          <label className="text-xs font-medium block mb-0.5">{label}</label>
          <p className="text-[10px] text-muted-foreground mb-1">{description}</p>
          <Input
            value={(config[key] as string) || ""}
            onChange={(e) => setField(key, e.target.value)}
            placeholder="e.g., npm install"
            className="h-8 text-sm font-mono"
          />
        </div>
      ))}

      {/* waitFor */}
      <div>
        <label className="text-xs font-medium block mb-0.5">Wait For</label>
        <p className="text-[10px] text-muted-foreground mb-1">
          Which lifecycle step to complete before showing UI.
        </p>
        <div className="flex gap-1 flex-wrap">
          {WAIT_FOR_OPTIONS.map((val) => (
            <Button
              key={val}
              variant={(config.waitFor || "updateContentCommand") === val ? "default" : "outline"}
              size="sm"
              className="text-[11px]"
              onClick={() => setField("waitFor", val === "updateContentCommand" ? undefined : val)}
            >
              {val.replace("Command", "")}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create JsonEditorTab component**

```typescript
import { useState, useEffect, useCallback } from "react";
import type { DevcontainerValidationError } from "../../types";
import { useValidateDevcontainerConfig } from "../../hooks/useDevcontainerConfig";

interface JsonEditorTabProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
  onParseError: (hasError: boolean) => void;
}

export function JsonEditorTab({ config, onChange, onParseError }: JsonEditorTabProps) {
  const [text, setText] = useState(() => JSON.stringify(config, null, 2));
  const [parseError, setParseError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<DevcontainerValidationError[]>([]);
  const validate = useValidateDevcontainerConfig();

  // Sync external config changes to text
  useEffect(() => {
    setText(JSON.stringify(config, null, 2));
    setParseError(null);
  }, [config]);

  const debouncedValidate = useCallback(
    (() => {
      let timer: ReturnType<typeof setTimeout>;
      return (parsed: Record<string, unknown>) => {
        clearTimeout(timer);
        timer = setTimeout(() => {
          validate.mutate(parsed, {
            onSuccess: (errors) => setValidationErrors(errors),
          });
        }, 500);
      };
    })(),
    [validate],
  );

  const handleChange = (value: string) => {
    setText(value);
    try {
      const parsed = JSON.parse(value);
      setParseError(null);
      onParseError(false);
      onChange(parsed);
      debouncedValidate(parsed);
    } catch {
      setParseError("Invalid JSON");
      onParseError(true);
    }
  };

  return (
    <div className="space-y-2 h-full flex flex-col">
      <textarea
        value={text}
        onChange={(e) => handleChange(e.target.value)}
        className="flex-1 min-h-[400px] w-full resize-none rounded-md border border-[var(--glass-border)] bg-black/20 p-3 font-mono text-xs text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
        spellCheck={false}
      />

      {parseError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-xs text-destructive">{parseError}</p>
        </div>
      )}

      {!parseError && validationErrors.length > 0 && (
        <div className="rounded-md border border-yellow-500/30 bg-yellow-500/5 px-3 py-2 max-h-32 overflow-y-auto">
          <p className="text-[10px] uppercase text-yellow-500 font-medium mb-1">
            Validation Warnings ({validationErrors.length})
          </p>
          {validationErrors.map((err, i) => (
            <p key={i} className="text-xs text-yellow-400">
              <span className="font-mono">{err.path || "/"}</span>: {err.message}
            </p>
          ))}
        </div>
      )}

      {!parseError && validationErrors.length === 0 && (
        <p className="text-xs text-green-400">JSON is valid.</p>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/devcontainer-config/LifecycleTab.tsx src/components/devcontainer-config/JsonEditorTab.tsx
git commit -m "feat: add LifecycleTab and JsonEditorTab components"
```

---

### Task 9: Frontend — DevcontainerConfigEditor (main component)

**Files:**
- Create: `src/components/devcontainer-config/DevcontainerConfigEditor.tsx`

- [ ] **Step 1: Create DevcontainerConfigEditor component**

```typescript
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Save, RotateCcw } from "lucide-react";
import { useDevcontainerJsonConfig, useSaveDevcontainerConfig, parseValidationErrors } from "../../hooks/useDevcontainerConfig";
import { GeneralTab } from "./GeneralTab";
import { FeaturesTab } from "./FeaturesTab";
import { PortsEnvTab } from "./PortsEnvTab";
import { LifecycleTab } from "./LifecycleTab";
import { JsonEditorTab } from "./JsonEditorTab";
import type { ConfigTab, DevcontainerValidationError } from "../../types";

interface DevcontainerConfigEditorProps {
  workspacePath: string;
  projectName: string;
  onClose: () => void;
}

const TABS: { key: ConfigTab; label: string }[] = [
  { key: "general", label: "General" },
  { key: "features", label: "Features" },
  { key: "ports-env", label: "Ports & Env" },
  { key: "lifecycle", label: "Lifecycle" },
  { key: "json", label: "JSON" },
];

export function DevcontainerConfigEditor({
  workspacePath,
  projectName,
  onClose,
}: DevcontainerConfigEditorProps) {
  const { data, isLoading, error } = useDevcontainerJsonConfig(workspacePath);
  const saveMutation = useSaveDevcontainerConfig();

  const [config, setConfig] = useState<Record<string, unknown>>({});
  const [originalConfig, setOriginalConfig] = useState<Record<string, unknown>>({});
  const [activeTab, setActiveTab] = useState<ConfigTab>("general");
  const [jsonParseError, setJsonParseError] = useState(false);
  const [saveErrors, setSaveErrors] = useState<DevcontainerValidationError[]>([]);

  // Load config from backend
  useEffect(() => {
    if (data) {
      setConfig(data.config as Record<string, unknown>);
      setOriginalConfig(data.config as Record<string, unknown>);
    }
  }, [data]);

  const isDirty = JSON.stringify(config) !== JSON.stringify(originalConfig);

  const handleSave = () => {
    setSaveErrors([]);
    saveMutation.mutate(
      { workspacePath, config },
      {
        onSuccess: () => {
          setOriginalConfig(config);
        },
        onError: (err) => {
          const validationErrs = parseValidationErrors(err);
          if (validationErrs.length > 0) {
            setSaveErrors(validationErrs);
          }
        },
      },
    );
  };

  const handleReset = () => {
    setConfig(originalConfig);
    setSaveErrors([]);
    setJsonParseError(false);
  };

  if (isLoading) {
    return <p className="text-sm text-muted-foreground p-4">Loading configuration...</p>;
  }

  if (error) {
    return (
      <div className="p-4 space-y-2">
        <p className="text-sm text-destructive">Failed to load configuration.</p>
        <Button variant="outline" size="sm" onClick={onClose}>
          <ArrowLeft className="h-3.5 w-3.5 mr-1" /> Back
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h2 className="text-sm font-semibold">{projectName}</h2>
            <p className="text-[10px] text-muted-foreground">devcontainer.json configuration</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          {isDirty && (
            <Button variant="ghost" size="sm" onClick={handleReset}>
              <RotateCcw className="h-3.5 w-3.5 mr-1" />
              Reset
            </Button>
          )}
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!isDirty || jsonParseError || saveMutation.isPending}
          >
            <Save className="h-3.5 w-3.5 mr-1" />
            {saveMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 border-b border-[var(--glass-border)] pb-1">
        {TABS.map(({ key, label }) => (
          <Button
            key={key}
            variant={activeTab === key ? "default" : "ghost"}
            size="sm"
            className="text-xs"
            onClick={() => setActiveTab(key)}
            disabled={key !== "json" && jsonParseError}
          >
            {label}
          </Button>
        ))}
      </div>

      {/* Tab content */}
      <div className="min-h-[400px]">
        {activeTab === "general" && <GeneralTab config={config} onChange={setConfig} />}
        {activeTab === "features" && <FeaturesTab config={config} onChange={setConfig} />}
        {activeTab === "ports-env" && <PortsEnvTab config={config} onChange={setConfig} />}
        {activeTab === "lifecycle" && <LifecycleTab config={config} onChange={setConfig} />}
        {activeTab === "json" && (
          <JsonEditorTab config={config} onChange={setConfig} onParseError={setJsonParseError} />
        )}
      </div>

      {/* Save errors */}
      {saveErrors.length > 0 && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2">
          <p className="text-[10px] uppercase text-destructive font-medium mb-1">
            Save Failed — Validation Errors ({saveErrors.length})
          </p>
          {saveErrors.map((err, i) => (
            <p key={i} className="text-xs text-destructive">
              <span className="font-mono">{err.path || "/"}</span>: {err.message}
            </p>
          ))}
        </div>
      )}

      {/* New file indicator */}
      {data && !data.exists && (
        <div className="rounded-md border border-blue-500/20 bg-blue-500/5 px-3 py-2">
          <p className="text-xs text-blue-400">
            No existing devcontainer.json found. Saving will create <code className="font-mono">.devcontainer/devcontainer.json</code>.
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/devcontainer-config/DevcontainerConfigEditor.tsx
git commit -m "feat: add DevcontainerConfigEditor main component"
```

---

### Task 10: Integration — Wire into DevContainerGroup and AddProjectDialog

**Files:**
- Modify: `src/components/containers/DevContainerGroup.tsx`
- Modify: `src/components/containers/AddProjectDialog.tsx`

- [ ] **Step 1: Update DevContainerGroup to add Settings button and config editor**

Replace the import line for `useDevcontainerConfig`:

```typescript
// OLD:
import { useDevcontainerAction, useRemoveDevcontainerProject, useDevcontainerConfig } from "../../hooks/useDevcontainers";

// NEW:
import { useDevcontainerAction, useRemoveDevcontainerProject } from "../../hooks/useDevcontainers";
import { useDevcontainerJsonConfig } from "../../hooks/useDevcontainerConfig";
```

Add the `DevcontainerConfigEditor` import and `Settings` icon import:

```typescript
import { ChevronRight, ChevronDown, Copy, AlertTriangle, Loader2, Settings } from "lucide-react";
import { DevcontainerConfigEditor } from "../devcontainer-config/DevcontainerConfigEditor";
```

Add a state variable inside the component:

```typescript
const [showConfig, setShowConfig] = useState(false);
```

Replace the `useDevcontainerConfig` call:

```typescript
// OLD:
const { data: config } = useDevcontainerConfig(
  expanded && project.status !== "path_missing" ? project.workspace_path : ""
);

// NEW:
const { data: configData } = useDevcontainerJsonConfig(
  expanded && project.status !== "path_missing" ? project.workspace_path : ""
);
const config = configData?.config;
```

Add a "Settings" button in the `actionButtons` function — add this before the `switch` statement as a common button that appears for non-path_missing statuses:

After `const disabled = ...;` add:

```typescript
    const settingsBtn = project.status !== "path_missing" && (
      <Button variant="ghost" size="sm" onClick={() => { setShowConfig(true); setExpanded(true); }} disabled={disabled}>
        <Settings className="h-3.5 w-3.5" />
      </Button>
    );
```

Then prepend `{settingsBtn}` before each case's return. For example in case "running":

```typescript
return (
  <>
    {settingsBtn}
    <Button variant="ghost" size="sm" onClick={() => handleAction("build")} disabled={disabled}>Rebuild</Button>
    ...
  </>
);
```

Do the same for "stopped" and "not_built" cases.

At the top of the component return, if `showConfig` is true, render the config editor instead:

```typescript
if (showConfig) {
  return (
    <div className="glass-group overflow-hidden p-4">
      <DevcontainerConfigEditor
        workspacePath={project.workspace_path}
        projectName={project.name}
        onClose={() => setShowConfig(false)}
      />
    </div>
  );
}
```

Update the config display in the expanded section to use raw JSON values:

```typescript
// OLD:
{config && (
  <div className="grid grid-cols-2 gap-2">
    <div className="rounded-md bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase text-muted-foreground mb-1">Image</div>
      <div className="text-xs truncate">{config.image || "Dockerfile-based"}</div>
    </div>
    <div className="rounded-md bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase text-muted-foreground mb-1">Features</div>
      <div className="text-xs truncate">
        {config.features.length > 0
          ? config.features.map((f) => f.split("/").pop()).join(", ")
          : "None"}
      </div>
    </div>
  </div>
)}

// NEW:
{config && (
  <div className="grid grid-cols-2 gap-2">
    <div className="rounded-md bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase text-muted-foreground mb-1">Image</div>
      <div className="text-xs truncate">
        {(config.image as string) || "Dockerfile-based"}
      </div>
    </div>
    <div className="rounded-md bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase text-muted-foreground mb-1">Features</div>
      <div className="text-xs truncate">
        {config.features && typeof config.features === "object"
          ? Object.keys(config.features).map((f) => f.split("/").pop()).join(", ")
          : "None"}
      </div>
    </div>
  </div>
)}
```

- [ ] **Step 2: Update AddProjectDialog to open config editor for new projects**

In `src/components/containers/AddProjectDialog.tsx`, add a config editor option when no `devcontainer.json` exists:

Add imports:

```typescript
import { DevcontainerConfigEditor } from "../devcontainer-config/DevcontainerConfigEditor";
```

Add state:

```typescript
const [showConfigEditor, setShowConfigEditor] = useState(false);
const [addedPath, setAddedPath] = useState<string | null>(null);
```

If `showConfigEditor` is true, render the editor:

```typescript
if (showConfigEditor && addedPath) {
  return (
    <div className="glass-panel rounded-lg p-4">
      <DevcontainerConfigEditor
        workspacePath={addedPath}
        projectName={addedPath.split("/").pop() || "project"}
        onClose={() => {
          setShowConfigEditor(false);
          setAddedPath(null);
        }}
      />
    </div>
  );
}
```

Modify `handleAdd` to add a "Configure" flow when the folder doesn't have devcontainer.json:

```typescript
const handleAdd = async () => {
  setError(null);
  const selected = await open({ directory: true, multiple: false });
  if (!selected) return;

  const path = typeof selected === "string" ? selected : selected[0];
  if (!path) return;

  addProject.mutate(path, {
    onSuccess: () => {
      // Project added successfully (had existing devcontainer.json)
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("No devcontainer.json found")) {
        // No config exists - offer to create one
        setAddedPath(path);
        setShowConfigEditor(true);
      } else {
        setError(msg);
      }
    },
  });
};
```

- [ ] **Step 3: Verify frontend builds**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/components/containers/DevContainerGroup.tsx src/components/containers/AddProjectDialog.tsx
git commit -m "feat: integrate devcontainer config editor into existing UI"
```

---

### Task 11: Verification — Full build and manual test

- [ ] **Step 1: Full Rust build**

```bash
cd src-tauri && cargo build
```

Expected: Build succeeds.

- [ ] **Step 2: Full frontend build**

```bash
npm run build
```

Expected: Build succeeds.

- [ ] **Step 3: Run dev mode and manual test**

```bash
npm run tauri dev
```

Manual test checklist:
1. Navigate to Containers → DevContainer tab
2. Expand an existing devcontainer project → verify Settings button appears
3. Click Settings → verify config editor opens with tabs
4. Switch between General/Features/Ports & Env/Lifecycle/JSON tabs
5. Edit a field and verify "Save" button enables
6. Click Reset → verify changes revert
7. Edit and click Save → verify file is written
8. Switch to JSON tab → verify JSON reflects form changes
9. Edit JSON → switch to General tab → verify form reflects JSON changes
10. Enter invalid JSON → verify parse error and form tabs disabled
11. Click "Add Project" with a folder that has no devcontainer.json → verify config editor appears

- [ ] **Step 4: Final commit if any fixes needed**

```bash
git add -A
git commit -m "fix: resolve issues from manual testing"
```
