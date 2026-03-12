# 작업 지시서 01 — Monorepo Scaffold 생성

## 제목

Bootstrap the lightweight AI Agent Orchestrator monorepo

## 목표

경량 AI Agent Orchestrator 프로젝트의 **초기 monorepo 구조**를 생성한다.

이 단계의 목적은 다음과 같다.

- pnpm workspace 기반 monorepo 구조 생성
- core / scheduler / dispatcher / adapter / store / app 패키지 디렉터리 생성
- TypeScript 빌드가 가능한 최소 설정 추가
- Node는 24.14.0 버전을 기준으로 한다
- lint / test / format 기본 설정 추가
- 각 패키지가 이후 구현 작업을 받을 수 있도록 최소 엔트리 파일 생성

이 단계에서는 **실제 orchestration 로직은 구현하지 않는다.**

---

## 배경

이 프로젝트는 다음 정체성을 가진 오픈소스다.

- 개발자와 소규모 팀을 위한 경량 AI Agent Orchestrator
- task / workflow graph / schedule / adapter / run tracking 중심
- framework-independent core
- Node.js + TypeScript + pnpm workspace 기반
- 이후 BullMQ + Redis + PostgreSQL 기반 구현 예정

첫 단계에서는 이후 기능 구현을 위한 **건강한 저장소 구조와 개발 환경**을 만드는 것이 목표다.

---

## 작업 범위

### 수정/생성 가능 범위

전체 저장소 루트 기준 아래 경로만 생성/수정 가능:

- `package.json`
- `pnpm-workspace.yaml`
- `tsconfig.base.json`
- `.gitignore`
- `.editorconfig`
- `.prettierrc`
- `eslint.config.*` 또는 이에 준하는 eslint 설정 파일
- `vitest.config.*` 또는 최소 테스트 설정 파일
- `README.md` (최소 초안만)
- `packages/**`
- `apps/**`

### 이번 작업에서 생성해야 할 디렉터리

다음 디렉터리 구조를 생성하라.

```
packages/
  core/
  scheduler/
  dispatcher/
  queue-bullmq/
  store-postgres/
  adapter-http/
  adapter-cli/
  adapter-openclaw/
  sdk/
  shared/

apps/
  server/
  example-basic/
  example-http-agent/
```

---

## 요구사항

### 1. Workspace / Package Manager

- `pnpm workspace` 기반으로 구성할 것
- 루트 `package.json`에는 workspace 실행용 script를 정의할 것
- 각 패키지는 독립 `package.json`을 가질 것

### 2. TypeScript

- 공통 TypeScript 설정은 루트의 `tsconfig.base.json`으로 관리할 것
- 각 패키지는 최소한의 `tsconfig.json` 또는 빌드 설정을 가질 것
- 모든 패키지는 `src/index.ts`를 기본 엔트리로 가질 것
- 현재 단계에서는 ESM/CJS 중 하나로 통일하되, 복잡한 멀티출력은 하지 말 것
- 설정은 단순하고 유지보수 가능해야 함

### 3. 빌드 가능 상태

- 루트에서 workspace 전체 build 명령이 동작해야 함
- 각 패키지의 `src/index.ts`는 최소 export 하나 이상을 포함할 것
- 예:
    - `export const PACKAGE_NAME = "core";`

### 4. 테스트 환경

- 최소한의 테스트 러너 설정을 추가할 것
- 권장: `vitest`
- 아직 실제 테스트는 많지 않아도 되지만, 최소 샘플 테스트 하나는 추가할 것
- 샘플 테스트는 `packages/core`에 두는 것을 권장

### 5. 린트 / 포맷팅

- ESLint와 Prettier 기본 설정을 추가할 것
- 설정은 단순하게 유지하고, 타입스크립트 모노레포에 맞는 최소 수준으로 작성할 것
- 과도한 규칙 설정은 하지 말 것

### 6. README

루트 `README.md`에는 아래 정도의 최소 정보만 포함할 것.

- 프로젝트 이름(임시 이름 가능)
- 한 줄 설명
- 이 프로젝트가 무엇인지
- monorepo 구조 한 줄 설명
- 아직 초기 scaffold 단계라는 점

README는 너무 길게 쓰지 말 것

### 7. 앱 패키지

- `apps/server`
- `apps/example-basic`
- `apps/example-http-agent`

위 3개 앱도 최소 package 구조를 생성할 것

단, 서버 로직이나 예제 로직은 아직 구현하지 않는다.

---

## 비기능 요구사항

- 구조는 **단순**해야 한다
- 이후 Codex가 점진적으로 기능을 붙이기 쉬워야 한다
- 지금 단계에서 Docker, Redis, Postgres 연동은 추가하지 않는다
- 지금 단계에서 NestJS, Fastify, BullMQ, Prisma/TypeORM 같은 무거운 프레임워크 의존성은 넣지 않아도 된다
- 정말 필요한 최소 dev dependency만 추가할 것
- 불필요한 boilerplate 생성 금지
- 추상화 과도하게 넣지 말 것

---

## 명시적 비범위(이번 작업에서 하지 말 것)

다음은 이번 작업에서 구현하지 말 것.

- Agent / Task / Workflow 도메인 모델 구현
- Scheduler 로직 구현
- Dispatcher 구현
- BullMQ 연동
- PostgreSQL 연동
- OpenClaw adapter 구현
- REST API 구현
- 웹 UI 생성
- Docker Compose 작성
- CI/CD 작성
- release workflow 작성

즉 이번 작업은 **저장소 뼈대와 개발 환경 구성만** 담당한다.

---

## 산출물 요구사항

작업 완료 후 다음을 제공하라.

### 1. 생성/수정한 파일 목록 요약

어떤 파일을 만들었는지 간단히 정리

### 2. 구조 설명

왜 이런 구조로 잡았는지 짧게 설명

### 3. 실행 방법

다음 명령이 무엇을 하는지 적어라.

- install
- build
- test
- lint

예:

- `pnpm install`
- `pnpm build`
- `pnpm test`
- `pnpm lint`

### 4. 남은 작업

다음 단계에서 바로 이어서 할 수 있는 작업 3~5개 제안

단, 구현하지는 말고 목록만 제시

---

## 완료 조건

아래 조건을 만족하면 완료로 본다.

- pnpm workspace가 정상 구성됨
- 지정된 packages / apps 디렉터리가 생성됨
- 각 패키지에 최소 `src/index.ts`가 존재함
- 루트 build/test/lint 스크립트가 정의됨
- 최소 샘플 테스트 1개가 존재함
- 전체 구조가 불필요하게 무겁지 않음

---

## 작업 스타일 지침

- 보수적으로 작업할 것
- 임의 기능 추가 금지
- 범위 밖 리팩터링 금지
- 파일 수를 과도하게 늘리지 말 것
- “나중에 필요할 것 같아서” 넣는 기능 금지
- 이후 단계에서 확장 가능한 정도까지만 구성할 것

---

## 출력 형식

최종 응답은 아래 형식으로 작성하라.

### Summary

한 줄 요약

### Files Changed

변경 파일 목록

### Notes

구조 설명 및 판단 근거

### How to Run

설치/빌드/테스트/린트 방법

### Suggested Next Task

다음 작업 3~5개