# Onboarding Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 첫 실행 사용자에게 3단계 온보딩 플로우(환영 → Colima 설치 확인 → 사이드바 안내)를 제공한다.

**Architecture:** Rust 백엔드에 `check_colima_installed`와 `check_onboarding_needed`(설정 파일 존재 여부 확인) 커맨드를 추가하고, React 프론트엔드에 풀스크린 Glass 카드 기반 온보딩 컴포넌트를 구현한다. `App.tsx`에서 설정 파일 존재 여부에 따라 온보딩 또는 메인 UI를 렌더링한다.

**Tech Stack:** Tauri 2 (Rust), React 19, TypeScript, Tailwind CSS 4, Lucide React

---

## File Structure

### New Files
- `src-tauri/src/commands/onboarding.rs` — `check_colima_installed`, `check_onboarding_needed`, `complete_onboarding` Tauri 커맨드
- `src/components/onboarding/Onboarding.tsx` — 온보딩 메인 컨테이너 (step 상태, 전환 애니메이션)
- `src/components/onboarding/WelcomeStep.tsx` — Step 1: 환영 화면
- `src/components/onboarding/ColimaCheckStep.tsx` — Step 2: Colima 설치 확인
- `src/components/onboarding/SidebarGuideStep.tsx` — Step 3: 사이드바 안내
- `src/hooks/useOnboarding.ts` — 온보딩 관련 React Query 훅

### Modified Files
- `src-tauri/src/commands/mod.rs` — `pub mod onboarding;` 추가
- `src-tauri/src/lib.rs` — 새 커맨드 3개 등록
- `src/lib/tauri.ts` — 새 API 메서드 3개 추가
- `src/types/index.ts` — `ColimaInstallCheck` 타입 추가
- `src/App.tsx` — 온보딩 여부에 따른 조건부 렌더링
- `src/App.css` — 온보딩 전환 애니메이션 CSS

---

### Task 1: Rust 백엔드 — 온보딩 커맨드 추가

**Files:**
- Create: `src-tauri/src/commands/onboarding.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: `onboarding.rs` 커맨드 파일 생성**

```rust
// src-tauri/src/commands/onboarding.rs
use serde::Serialize;
use tokio::process::Command;

#[derive(Debug, Serialize, Clone)]
pub struct ColimaInstallCheck {
    pub installed: bool,
    pub path: Option<String>,
}

#[tauri::command]
pub async fn check_colima_installed() -> Result<ColimaInstallCheck, String> {
    let output = Command::new("which")
        .arg("colima")
        .output()
        .await
        .map_err(|e| format!("Failed to execute which: {}", e))?;

    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        Ok(ColimaInstallCheck {
            installed: true,
            path: Some(path),
        })
    } else {
        Ok(ColimaInstallCheck {
            installed: false,
            path: None,
        })
    }
}

#[tauri::command]
pub async fn check_onboarding_needed() -> Result<bool, String> {
    let config_dir = dirs::config_dir().ok_or("Cannot find config directory")?;
    let settings_path = config_dir.join("colima-desktop").join("app-settings.json");
    Ok(!settings_path.exists())
}

#[tauri::command]
pub async fn complete_onboarding() -> Result<(), String> {
    let config_dir = dirs::config_dir().ok_or("Cannot find config directory")?;
    let app_dir = config_dir.join("colima-desktop");
    std::fs::create_dir_all(&app_dir)
        .map_err(|e| format!("Failed to create config dir: {}", e))?;
    let settings_path = app_dir.join("app-settings.json");
    std::fs::write(&settings_path, "{}")
        .map_err(|e| format!("Failed to write settings: {}", e))?;
    Ok(())
}
```

- [ ] **Step 2: `mod.rs`에 모듈 등록**

`src-tauri/src/commands/mod.rs`에 추가:
```rust
pub mod onboarding;
```

- [ ] **Step 3: `lib.rs`에 커맨드 등록**

`src-tauri/src/lib.rs`의 `invoke_handler` 배열에 추가:
```rust
commands::onboarding::check_colima_installed,
commands::onboarding::check_onboarding_needed,
commands::onboarding::complete_onboarding,
```

- [ ] **Step 4: 빌드 확인**

Run: `cd src-tauri && cargo check`
Expected: 컴파일 성공, 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add src-tauri/src/commands/onboarding.rs src-tauri/src/commands/mod.rs src-tauri/src/lib.rs
git commit -m "feat(backend): add onboarding Tauri commands

Add check_colima_installed, check_onboarding_needed, complete_onboarding commands.
Onboarding is needed when ~/.config/colima-desktop/app-settings.json does not exist."
```

---

### Task 2: 프론트엔드 타입 및 API 래퍼 추가

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/lib/tauri.ts`
- Create: `src/hooks/useOnboarding.ts`

- [ ] **Step 1: TypeScript 타입 추가**

`src/types/index.ts` 끝에 추가:
```typescript
export interface ColimaInstallCheck {
  installed: boolean;
  path: string | null;
}
```

- [ ] **Step 2: Tauri API 래퍼 추가**

`src/lib/tauri.ts`의 `api` 객체에 추가:
```typescript
checkColimaInstalled: () => invoke<ColimaInstallCheck>("check_colima_installed"),
checkOnboardingNeeded: () => invoke<boolean>("check_onboarding_needed"),
completeOnboarding: () => invoke<void>("complete_onboarding"),
```

import에 `ColimaInstallCheck` 추가.

- [ ] **Step 3: React Query 훅 생성**

```typescript
// src/hooks/useOnboarding.ts
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";

export function useOnboardingNeeded() {
  return useQuery({
    queryKey: ["onboarding-needed"],
    queryFn: api.checkOnboardingNeeded,
    staleTime: Infinity,
  });
}

export function useColimaInstallCheck() {
  return useQuery({
    queryKey: ["colima-install-check"],
    queryFn: api.checkColimaInstalled,
    enabled: false, // manually triggered
  });
}

export function useCompleteOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.completeOnboarding,
    onSuccess: () => {
      queryClient.setQueryData(["onboarding-needed"], false);
    },
  });
}
```

- [ ] **Step 4: 커밋**

```bash
git add src/types/index.ts src/lib/tauri.ts src/hooks/useOnboarding.ts
git commit -m "feat(frontend): add onboarding types, API wrapper, and React Query hooks"
```

---

### Task 3: 온보딩 CSS 애니메이션 추가

**Files:**
- Modify: `src/App.css`

- [ ] **Step 1: 온보딩 전환 애니메이션 CSS 추가**

`src/App.css` 끝에 추가:
```css
@layer utilities {
  .onboarding-step {
    transition: opacity 0.3s ease, transform 0.3s ease;
  }

  .onboarding-step-enter {
    opacity: 0;
    transform: translateY(8px);
  }

  .onboarding-step-active {
    opacity: 1;
    transform: translateY(0);
  }

  .onboarding-step-exit {
    opacity: 0;
    transform: translateY(-8px);
  }

  .onboarding-dot {
    transition: background-color 0.3s ease, transform 0.3s ease;
  }
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/App.css
git commit -m "feat(css): add onboarding step transition animations"
```

---

### Task 4: WelcomeStep 컴포넌트

**Files:**
- Create: `src/components/onboarding/WelcomeStep.tsx`

- [ ] **Step 1: WelcomeStep 구현**

```tsx
// src/components/onboarding/WelcomeStep.tsx
import { Box } from "lucide-react";

interface WelcomeStepProps {
  onNext: () => void;
  onSkip: () => void;
}

export function WelcomeStep({ onNext, onSkip }: WelcomeStepProps) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-green-500 to-green-600 shadow-lg">
        <Box className="h-10 w-10 text-white" />
      </div>
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-foreground">
          Colima Desktop에 오신 것을 환영합니다
        </h1>
        <p className="text-sm text-muted-foreground">
          macOS를 위한 네이티브 Docker 컨테이너 관리 앱
        </p>
      </div>
      <div className="flex gap-3 pt-2">
        <button
          onClick={onSkip}
          className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          건너뛰기
        </button>
        <button
          onClick={onNext}
          className="rounded-lg bg-gradient-to-r from-green-500 to-green-600 px-6 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md"
        >
          다음
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/onboarding/WelcomeStep.tsx
git commit -m "feat(onboarding): add WelcomeStep component"
```

---

### Task 5: ColimaCheckStep 컴포넌트

**Files:**
- Create: `src/components/onboarding/ColimaCheckStep.tsx`

- [ ] **Step 1: ColimaCheckStep 구현**

```tsx
// src/components/onboarding/ColimaCheckStep.tsx
import { useEffect, useState } from "react";
import { CheckCircle2, XCircle, Loader2, Copy, Check } from "lucide-react";
import { api } from "../../lib/tauri";
import type { ColimaInstallCheck } from "../../types";

interface ColimaCheckStepProps {
  onNext: () => void;
  onSkip: () => void;
}

export function ColimaCheckStep({ onNext, onSkip }: ColimaCheckStepProps) {
  const [status, setStatus] = useState<"checking" | "installed" | "not-installed">("checking");
  const [installInfo, setInstallInfo] = useState<ColimaInstallCheck | null>(null);
  const [copied, setCopied] = useState(false);

  const checkInstall = async () => {
    setStatus("checking");
    try {
      const result = await api.checkColimaInstalled();
      setInstallInfo(result);
      setStatus(result.installed ? "installed" : "not-installed");
    } catch {
      setStatus("not-installed");
    }
  };

  useEffect(() => {
    checkInstall();
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText("brew install colima");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      {status === "checking" && (
        <>
          <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Colima 설치 여부를 확인하고 있습니다...</p>
        </>
      )}

      {status === "installed" && (
        <>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[var(--status-running-bg)]">
            <CheckCircle2 className="h-8 w-8 text-[var(--status-running-text)]" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">Colima가 설치되어 있습니다</h2>
            {installInfo?.path && (
              <p className="text-xs text-muted-foreground font-mono">{installInfo.path}</p>
            )}
          </div>
        </>
      )}

      {status === "not-installed" && (
        <>
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
            <XCircle className="h-8 w-8 text-destructive" />
          </div>
          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-foreground">Colima가 설치되지 않았습니다</h2>
            <p className="text-sm text-muted-foreground">
              아래 명령어로 Colima를 설치해주세요
            </p>
          </div>
          <div className="flex items-center gap-2 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-2.5">
            <code className="text-sm font-mono text-foreground">brew install colima</code>
            <button
              onClick={handleCopy}
              className="ml-2 rounded-md p-1 text-muted-foreground transition-colors hover:text-foreground"
              title="복사"
            >
              {copied ? <Check className="h-4 w-4 text-[var(--status-running-text)]" /> : <Copy className="h-4 w-4" />}
            </button>
          </div>
        </>
      )}

      <div className="flex gap-3 pt-2">
        <button
          onClick={onSkip}
          className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          건너뛰기
        </button>
        {status === "not-installed" ? (
          <button
            onClick={checkInstall}
            className="rounded-lg bg-gradient-to-r from-green-500 to-green-600 px-6 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md"
          >
            다시 확인
          </button>
        ) : status === "installed" ? (
          <button
            onClick={onNext}
            className="rounded-lg bg-gradient-to-r from-green-500 to-green-600 px-6 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md"
          >
            다음
          </button>
        ) : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/onboarding/ColimaCheckStep.tsx
git commit -m "feat(onboarding): add ColimaCheckStep component with install detection and copy command"
```

---

### Task 6: SidebarGuideStep 컴포넌트

**Files:**
- Create: `src/components/onboarding/SidebarGuideStep.tsx`

- [ ] **Step 1: SidebarGuideStep 구현**

```tsx
// src/components/onboarding/SidebarGuideStep.tsx
import { Box, Image, HardDrive, Network, Settings } from "lucide-react";

interface SidebarGuideStepProps {
  onFinish: () => void;
  onSkip: () => void;
}

const sidebarItems = [
  { icon: Box, label: "Containers", desc: "컨테이너 목록 확인 및 관리" },
  { icon: Image, label: "Images", desc: "Docker 이미지 관리" },
  { icon: HardDrive, label: "Volumes", desc: "데이터 볼륨 관리" },
  { icon: Network, label: "Networks", desc: "Docker 네트워크 관리" },
  { icon: Settings, label: "Settings", desc: "VM, 마운트, 네트워크 설정" },
];

export function SidebarGuideStep({ onFinish, onSkip }: SidebarGuideStepProps) {
  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <div className="space-y-2">
        <h2 className="text-xl font-semibold text-foreground">사이드바 둘러보기</h2>
        <p className="text-sm text-muted-foreground">
          왼쪽 사이드바에서 Docker 리소스를 관리할 수 있습니다
        </p>
      </div>
      <div className="w-full max-w-xs space-y-2">
        {sidebarItems.map((item) => (
          <div
            key={item.label}
            className="flex items-center gap-3 rounded-lg border border-[var(--glass-border)] bg-[var(--glass-bg)] px-4 py-2.5 text-left"
          >
            <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
            <div className="min-w-0">
              <div className="text-sm font-medium text-foreground">{item.label}</div>
              <div className="text-xs text-muted-foreground">{item.desc}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-3 pt-2">
        <button
          onClick={onSkip}
          className="rounded-lg px-4 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          건너뛰기
        </button>
        <button
          onClick={onFinish}
          className="rounded-lg bg-gradient-to-r from-green-500 to-green-600 px-6 py-2 text-sm font-medium text-white shadow-sm transition-all hover:shadow-md"
        >
          시작하기
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/onboarding/SidebarGuideStep.tsx
git commit -m "feat(onboarding): add SidebarGuideStep component"
```

---

### Task 7: Onboarding 메인 컨테이너

**Files:**
- Create: `src/components/onboarding/Onboarding.tsx`

- [ ] **Step 1: Onboarding 메인 컴포넌트 구현**

```tsx
// src/components/onboarding/Onboarding.tsx
import { useState, useEffect } from "react";
import { WelcomeStep } from "./WelcomeStep";
import { ColimaCheckStep } from "./ColimaCheckStep";
import { SidebarGuideStep } from "./SidebarGuideStep";

interface OnboardingProps {
  onComplete: () => void;
}

const TOTAL_STEPS = 3;

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0);
  const [animationState, setAnimationState] = useState<"enter" | "active" | "exit">("enter");

  useEffect(() => {
    const timer = requestAnimationFrame(() => {
      setAnimationState("active");
    });
    return () => cancelAnimationFrame(timer);
  }, []);

  const transitionTo = (nextStep: number | "complete") => {
    setAnimationState("exit");
    setTimeout(() => {
      if (nextStep === "complete") {
        onComplete();
      } else {
        setStep(nextStep);
        setAnimationState("enter");
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            setAnimationState("active");
          });
        });
      }
    }, 300);
  };

  const handleNext = () => {
    if (step < TOTAL_STEPS - 1) {
      transitionTo(step + 1);
    } else {
      transitionTo("complete");
    }
  };

  const handleSkip = () => {
    transitionTo("complete");
  };

  const stateClass =
    animationState === "enter"
      ? "onboarding-step-enter"
      : animationState === "active"
        ? "onboarding-step-active"
        : "onboarding-step-exit";

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="flex flex-col items-center gap-8">
        <div className={`onboarding-step ${stateClass}`}>
          {step === 0 && <WelcomeStep onNext={handleNext} onSkip={handleSkip} />}
          {step === 1 && <ColimaCheckStep onNext={handleNext} onSkip={handleSkip} />}
          {step === 2 && <SidebarGuideStep onFinish={handleNext} onSkip={handleSkip} />}
        </div>
        {/* Dot Indicator */}
        <div className="flex gap-2">
          {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
            <div
              key={i}
              className={`onboarding-dot h-2 w-2 rounded-full ${
                i === step
                  ? "scale-125 bg-[var(--status-running-text)]"
                  : "bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 커밋**

```bash
git add src/components/onboarding/Onboarding.tsx
git commit -m "feat(onboarding): add Onboarding container with step transitions and dot indicator"
```

---

### Task 8: App.tsx 통합

**Files:**
- Modify: `src/App.tsx`

- [ ] **Step 1: App.tsx에서 온보딩 조건부 렌더링**

`src/App.tsx`를 다음으로 교체:

```tsx
import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { setLiquidGlassEffect } from "tauri-plugin-liquid-glass-api";
import { MainLayout } from "./components/layout/MainLayout";
import { Onboarding } from "./components/onboarding/Onboarding";
import { useOnboardingNeeded, useCompleteOnboarding } from "./hooks/useOnboarding";
import "./App.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true },
  },
});

function AppContent() {
  const { data: needsOnboarding, isLoading } = useOnboardingNeeded();
  const completeOnboarding = useCompleteOnboarding();

  const handleOnboardingComplete = () => {
    completeOnboarding.mutate();
  };

  if (isLoading) return null;

  if (needsOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />;
  }

  return <MainLayout />;
}

export default function App() {
  useEffect(() => {
    setLiquidGlassEffect().catch(() => {
      // Liquid glass not supported on this platform — no-op
    });
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 2: `npm run tauri dev`로 전체 동작 확인**

Run: `npm run tauri dev`
Expected: 앱 실행 시 `~/.config/colima-desktop/app-settings.json`이 없으면 온보딩이 표시되고, 완료 후 메인 UI로 전환. 이미 파일이 존재하면 바로 메인 UI 표시.

- [ ] **Step 3: 커밋**

```bash
git add src/App.tsx
git commit -m "feat(app): integrate onboarding flow into App with conditional rendering"
```
