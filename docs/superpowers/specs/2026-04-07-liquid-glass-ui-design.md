# Liquid Glass UI 디자인 스펙

## 개요

colima-desktop의 UI를 macOS Tahoe의 Liquid Glass 디자인 언어에 맞춰 전면 개선한다. 라이트 모드(Frosted Light)를 기본으로 하고, 다크 모드(Dark Glass)도 함께 지원한다.

## 디자인 원칙

Apple Liquid Glass의 3가지 레이어를 CSS로 구현한다:

1. **Highlight** — `inset 0 1px 0 rgba(255,255,255,α)` 로 상단 광택 표현
2. **Shadow** — 다층 `box-shadow`로 깊이감 (외부 shadow + inset glow)
3. **Illumination** — `backdrop-filter: blur() saturate()`로 배경 콘텐츠 반영

## 디자인 토큰

### Light Mode (기본)

| 토큰 | 값 |
|------|-----|
| `--background` | `linear-gradient(145deg, #e8eaf0 0%, #d4d8e0 30%, #c8cdd6 60%, #e0e4ec 100%)` |
| `--glass-bg` | `rgba(255, 255, 255, 0.42)` |
| `--glass-bg-hover` | `rgba(255, 255, 255, 0.52)` |
| `--glass-bg-active` | `rgba(255, 255, 255, 0.55)` |
| `--glass-border` | `rgba(255, 255, 255, 0.55)` |
| `--glass-border-strong` | `rgba(255, 255, 255, 0.65)` |
| `--glass-blur` | `blur(20px) saturate(180%)` |
| `--glass-blur-heavy` | `blur(24px) saturate(180%)` |
| `--glass-shadow` | `0 2px 12px rgba(0, 0, 0, 0.04)` |
| `--glass-shadow-hover` | `0 4px 20px rgba(0, 0, 0, 0.06)` |
| `--glass-inset` | `inset 0 1px 0 rgba(255, 255, 255, 0.65)` |
| `--foreground` | `#1a1a2e` |
| `--muted-foreground` | `#666` |

### Dark Mode

| 토큰 | 값 |
|------|-----|
| `--background` | `linear-gradient(145deg, #0f0f23 0%, #1a1a3e 50%, #0d1b2a 100%)` |
| `--glass-bg` | `rgba(255, 255, 255, 0.04)` |
| `--glass-bg-hover` | `rgba(255, 255, 255, 0.08)` |
| `--glass-bg-active` | `rgba(255, 255, 255, 0.12)` |
| `--glass-border` | `rgba(255, 255, 255, 0.08)` |
| `--glass-border-strong` | `rgba(255, 255, 255, 0.15)` |
| `--glass-blur` | `blur(24px) saturate(180%)` |
| `--glass-blur-heavy` | `blur(30px) saturate(180%)` |
| `--glass-shadow` | `0 4px 16px rgba(0, 0, 0, 0.2)` |
| `--glass-shadow-hover` | `0 8px 32px rgba(0, 0, 0, 0.3)` |
| `--glass-inset` | `inset 0 1px 0 rgba(255, 255, 255, 0.04)` |
| `--foreground` | `#e0e0e0` |
| `--muted-foreground` | `#888` |

### 공통 토큰

| 토큰 | 값 |
|------|-----|
| `--radius` | `0.875rem` (14px, 기존 0.625rem에서 증가) |
| `--radius-sm` | `0.625rem` (10px) |
| 배경 radial glow (light) | `radial-gradient(circle at 25% 35%, rgba(147,197,253,0.2), transparent 50%), radial-gradient(circle at 75% 65%, rgba(196,181,253,0.12), transparent 50%)` |
| 배경 radial glow (dark) | `radial-gradient(circle at 30% 40%, rgba(99,102,241,0.08), transparent 50%), radial-gradient(circle at 70% 60%, rgba(139,92,246,0.06), transparent 50%)` |

### 상태 색상

| 상태 | 배경 | 텍스트 | 보더 |
|------|------|--------|------|
| running | `rgba(34, 197, 94, 0.1)` | `#16a34a` | `rgba(34, 197, 94, 0.2)` |
| stopped | `rgba(0, 0, 0, 0.04)` (light) / `rgba(255,255,255,0.06)` (dark) | `#999` / `#888` | `rgba(0,0,0,0.08)` / `rgba(255,255,255,0.08)` |
| destructive | `rgba(220, 38, 38, 0.08)` | `#dc2626` | — |
| compose accent | `rgba(99, 102, 241, 0.08)` | `#6366f1` | `rgba(99, 102, 241, 0.15)` |

## 컴포넌트별 디자인

### 1. App 배경 (body / MainLayout)

- body에 gradient 배경 적용 (CSS 변수)
- `::before` pseudo-element로 radial glow 오버레이 추가
- Tauri 윈도우의 기본 배경과 조화 (titlebar 영역은 Tauri가 관리)

### 2. Sidebar

```
배경: var(--glass-bg) + backdrop-filter: var(--glass-blur-heavy)
보더: border-right: 1px solid var(--glass-border)
내부 그림자: box-shadow: inset -1px 0 0 rgba(255,255,255,0.25) (light)
```

- 로고 영역: 초록 dot에 `box-shadow: 0 0 6px rgba(34,197,94,0.4)` glow
- Running 배지: 반투명 green pill
- 네비게이션 아이템:
  - 기본: 투명, 색상만
  - 활성: `var(--glass-bg-active)` + `var(--glass-border-strong)` + inset highlight shadow

### 3. Button

기존 CVA variant 체계를 유지하되 glass 스타일로 업데이트:

- **default**: `var(--glass-bg-active)` + border + inset highlight. 기존 불투명 bg-primary 대체
- **outline**: `var(--glass-bg)` + `var(--glass-border)`. hover시 `var(--glass-bg-hover)`
- **ghost**: 배경 없음 → hover시 `var(--glass-bg)`
- **destructive**: `rgba(220,38,38,0.08)` 유지 (현행과 유사)

### 4. Badge

- **default (running)**: `rgba(34,197,94,0.1)` bg + `#16a34a` text + green border
- **secondary (stopped)**: `rgba(0,0,0,0.04)` bg + `#999` text
- **outline**: `var(--glass-border)` border + 투명 bg
- 전체적으로 border-radius 유지 (pill 형태)

### 5. Input

- 배경: `var(--glass-bg)` + `backdrop-filter: var(--glass-blur)`
- 보더: `var(--glass-border)`
- focus: `var(--glass-border-strong)` + ring

### 6. ContainerRow (카드)

```
배경: var(--glass-bg)
보더: 1px solid var(--glass-border)
radius: var(--radius) (14px)
그림자: var(--glass-shadow), var(--glass-inset)
hover: var(--glass-bg-hover) + var(--glass-shadow-hover)
transition: all 0.15s ease
```

### 7. ComposeGroup

- 외부 컨테이너: `var(--glass-bg)` 약간 낮은 불투명도 (0.35 light / 0.03 dark)
- 헤더: compose 이름 + accent 색상 배지
- 자식 카드: 한 단계 낮은 glass 레벨
- 구분선: `var(--glass-border)` 사용

### 8. Settings 탭 바

- 탭 그룹 컨테이너: `var(--glass-bg)` 배경 + radius
- 비활성 탭: 투명 배경, muted 텍스트
- 활성 탭: `var(--glass-bg-active)` + border + inset highlight + shadow (현행 shadow-sm 유사하나 glass 느낌 강화)

### 9. ScrollArea

- 스크롤바 thumb: `var(--glass-border)` → hover시 좀 더 진하게
- 변경 폭 작음

## 구현 전략

1. **CSS 변수 레이어 우선**: App.css에서 모든 glass 토큰을 `:root`와 `.dark`에 정의
2. **Tailwind 유틸 클래스**: `@layer utilities`에 `.glass-panel`, `.glass-card`, `.glass-sidebar` 등 복합 유틸 클래스 정의
3. **컴포넌트 최소 변경**: 가능한 한 Tailwind 클래스 교체만으로 처리. CVA variant 값만 업데이트
4. **점진적 적용**: App.css → 레이아웃(Sidebar, MainLayout) → UI 기본 컴포넌트(Button, Badge, Input) → 페이지 컴포넌트(ContainerRow, ComposeGroup 등) 순서

## 변경 파일 목록

| 파일 | 변경 내용 |
|------|----------|
| `src/App.css` | CSS 변수 전면 교체, glass 유틸 클래스 추가, body 배경 변경 |
| `src/components/layout/MainLayout.tsx` | gradient 배경 + glow pseudo-element 적용 |
| `src/components/layout/Sidebar.tsx` | glass 사이드바 스타일 + 네비 아이템 스타일 업데이트 |
| `src/components/ui/button.tsx` | CVA variant 값을 glass 스타일로 업데이트 |
| `src/components/ui/badge.tsx` | CVA variant 값을 반투명 + border 스타일로 업데이트 |
| `src/components/ui/input.tsx` | glass 배경 + border 스타일 적용 |
| `src/components/containers/ContainerRow.tsx` | glass card 스타일 적용 |
| `src/components/containers/ComposeGroup.tsx` | glass group 스타일 적용 |
| `src/components/containers/ContainerList.tsx` | 필터 버튼 스타일 (Button 컴포넌트 통해 자동 적용) |
| `src/components/containers/ContainerRun.tsx` | glass card 스타일 적용 |
| `src/components/containers/ContainerLogs.tsx` | glass 패널 스타일 적용 |
| `src/components/containers/ContainerDetail.tsx` | glass 패널 스타일 적용 |
| `src/components/images/ImageList.tsx` | glass 스타일 적용 |
| `src/components/images/ImageRow.tsx` | glass card 스타일 적용 |
| `src/components/images/ImagePull.tsx` | glass card 스타일 적용 |
| `src/components/volumes/VolumeList.tsx` | glass 스타일 적용 |
| `src/components/volumes/VolumeRow.tsx` | glass card 스타일 적용 |
| `src/components/volumes/VolumeCreate.tsx` | glass card 스타일 적용 |
| `src/components/networks/NetworkList.tsx` | glass 스타일 적용 |
| `src/components/networks/NetworkRow.tsx` | glass card 스타일 적용 |
| `src/components/networks/NetworkCreate.tsx` | glass card 스타일 적용 |
| `src/components/settings/VmSettings.tsx` | glass 패널 + 슬라이더 스타일 |
| `src/components/settings/MountSettings.tsx` | glass 패널 스타일 적용 |
| `src/components/settings/NetworkSettingsPanel.tsx` | glass 패널 스타일 적용 |
| `src/components/settings/DockerSettingsPanel.tsx` | glass 패널 스타일 적용 |
| `src/components/settings/UpdatePanel.tsx` | glass 패널 스타일 적용 |

## 성능 고려

- `backdrop-filter`는 GPU 가속 속성이지만, 중첩된 요소가 많으면 성능 영향 가능
- 사이드바와 카드에만 실제 `backdrop-filter` 적용, 작은 컴포넌트(버튼, 배지)는 반투명 배경만 사용
- Tauri WebView는 WebKit 기반이므로 `-webkit-backdrop-filter` prefix 필요

## 접근성 고려

- 반투명 배경 위 텍스트의 대비비를 WCAG AA (4.5:1) 이상 유지
- `prefers-reduced-transparency` 미디어 쿼리 대응: 감소 시 불투명 배경으로 fallback
- `prefers-reduced-motion` 대응: transition/animation 제거
