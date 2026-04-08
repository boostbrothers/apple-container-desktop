# Onboarding Flow Design

## Overview

Colima Desktop 첫 실행 시 사용자를 안내하는 3단계 온보딩 플로우.

## 온보딩 표시 조건

- `~/.config/colima-desktop/app-settings.json` 파일이 **존재하지 않으면** 온보딩 표시 (첫 실행)
- 파일이 **존재하면** 온보딩 건너뛰고 바로 메인 UI 진입
- 온보딩 완료 시 기존 `save_app_settings`를 호출하여 설정 파일 생성

## 플로우 (3단계)

### Step 1 — 환영

- 앱 아이콘 + "Colima Desktop에 오신 것을 환영합니다" 인사말
- 간단한 앱 소개 문구
- 하단: "건너뛰기" / "다음" 버튼

### Step 2 — Colima 설치 확인

- 화면 진입 시 자동으로 colima 설치 여부 확인
- **설치됨**: 체크 아이콘 + colima 버전 표시, "다음" 버튼
- **미설치**: 안내 메시지 + `brew install colima` 명령어 + 복사 버튼, "다시 확인" 버튼
- 하단: "건너뛰기" / "다음(또는 다시 확인)" 버튼

### Step 3 — 사이드바 안내

- 사이드바의 주요 기능을 간략히 소개 (Containers, Images, Volumes, Networks, Settings)
- "시작하기" 버튼으로 온보딩 종료

## 레이아웃

- **풀스크린 센터 카드**: 전체 화면 중앙에 Glass 카드 배치
- 기존 Glass Morphism 디자인 시스템 활용 (`glass-panel` 등)
- 하단에 dot indicator (●○○) 로 현재 스텝 표시
- 모든 스텝에서 "건너뛰기"로 온보딩 즉시 종료 가능

## 페이지 전환

- CSS `opacity` + `transform` 트랜지션
- 전환 시간: 300ms
- fade out → fade in 패턴

## 백엔드 변경

### 새 Tauri 커맨드

- `check_colima_installed`: `which colima` 실행 → `{ installed: bool, path?: string }` 반환

### 기존 커맨드 활용

- `get_app_settings`: 설정 파일 존재 여부 확인 (파일 없으면 에러 → 온보딩 필요)
- `save_app_settings`: 온보딩 완료 시 호출하여 설정 파일 생성
- `get_colima_version`: Step 2에서 설치 확인 시 버전 정보 표시

## 프론트엔드 구조

### 새 파일

- `src/components/onboarding/Onboarding.tsx` — 메인 컨테이너 (step 상태 관리, 전환 애니메이션)
- `src/components/onboarding/WelcomeStep.tsx` — Step 1: 환영
- `src/components/onboarding/ColimaCheckStep.tsx` — Step 2: Colima 설치 확인
- `src/components/onboarding/SidebarGuideStep.tsx` — Step 3: 사이드바 안내

### 수정 파일

- `App.tsx` — 설정 파일 존재 여부에 따라 `Onboarding` 또는 `MainLayout` 렌더링
- `src-tauri/src/commands/` — `check_colima_installed` 커맨드 추가
- `src-tauri/src/lib.rs` — 새 커맨드 등록
