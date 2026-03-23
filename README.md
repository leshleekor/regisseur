# regisseur (r7r)

Regisseur is a lightweight AI agent orchestrator for task- and workflow-driven
automation. It combines reusable workflow definitions, runtime task graphs,
schedules, queue-backed execution, transport adapters, run tracking, and an
operator-facing web console in a single TypeScript monorepo.

This repository uses a `pnpm` workspace. Shared libraries live in `packages/`,
while runnable applications live in `apps/`.

## Overview

Regisseur models orchestration as two related layers:

- definition layer
  - `WorkflowDefinition`
  - `TaskTemplate`
  - `TaskTemplateEdge`
  - `LoopDefinition`
- runtime layer
  - `Workflow`
  - `Task`
  - `TaskEdge`
  - `Run`

The current implementation includes:

- a Fastify API server
- PostgreSQL-backed repositories and migrations
- Redis/BullMQ-backed queues and workers
- HTTP, CLI, and OpenClaw adapter packages
- a React/Vite operations console for authoring and monitoring

## Architecture

At a high level, the workspace is split into a few layers:

1. `@regisseur/core` defines the domain model and graph/dependency helpers.
2. `@regisseur/store-postgres` persists orchestration state in PostgreSQL and
   ships SQL migrations.
3. `@regisseur/scheduler`, `@regisseur/dispatcher`, and
   `@regisseur/queue-bullmq` coordinate scheduled and queue-backed execution.
4. Adapter packages translate tasks into transport-specific execution requests.
5. `@regisseur/server` composes the runtime into an HTTP API and worker-based
   orchestrator app.
6. `@regisseur/web` provides a browser-based console for authoring definitions
   and observing runtime execution.

## Workspace Layout

| Path                        | Package                         | Purpose                                                       |
| --------------------------- | ------------------------------- | ------------------------------------------------------------- |
| `apps/server`               | `@regisseur/server`             | Fastify API server and runtime composition layer              |
| `apps/web`                  | `@regisseur/web`                | React/Vite operations console                                 |
| `apps/example-basic`        | `@regisseur/example-basic`      | Minimal example package scaffold                              |
| `apps/example-http-agent`   | `@regisseur/example-http-agent` | Minimal example scaffold for HTTP-based agent flows           |
| `packages/core`             | `@regisseur/core`               | Core orchestration domain types and graph logic               |
| `packages/dispatcher`       | `@regisseur/dispatcher`         | Task dispatch selection and dispatch orchestration            |
| `packages/scheduler`        | `@regisseur/scheduler`          | Schedule registration and delay helpers                       |
| `packages/queue-bullmq`     | `@regisseur/queue-bullmq`       | BullMQ queue integration and worker payloads                  |
| `packages/store-postgres`   | `@regisseur/store-postgres`     | PostgreSQL repositories, mappers, connections, and migrations |
| `packages/adapter-cli`      | `@regisseur/adapter-cli`        | CLI execution adapter                                         |
| `packages/adapter-http`     | `@regisseur/adapter-http`       | HTTP execution adapter                                        |
| `packages/adapter-openclaw` | `@regisseur/adapter-openclaw`   | OpenClaw execution adapter                                    |
| `packages/sdk`              | `@regisseur/sdk`                | Early SDK package placeholder                                 |
| `packages/shared`           | `@regisseur/shared`             | Early shared package placeholder                              |

## Requirements

- Node.js `>=24.14.0 <25`
- `pnpm` `10.23.0`
- PostgreSQL
- Redis

If `pnpm` is not installed globally, use `corepack pnpm ...`.

## Quick Start

Install dependencies:

```bash
corepack pnpm install
```

Set the server environment variables:

```bash
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/regisseur"
export REDIS_URL="redis://localhost:6379"
export AUTO_MIGRATE=true
export ENABLE_CLI_ADAPTER=true
```

Start the API server:

```bash
corepack pnpm --filter @regisseur/server build
corepack pnpm --filter @regisseur/server start
```

In a second terminal, start the web console:

```bash
corepack pnpm --filter @regisseur/web dev
```

Default local ports:

- server: `http://localhost:3000`
- web: `http://localhost:5173`

## Web Console And API Proxy

`apps/web` uses Vite and talks to the server through `/api` by default.

Local development behavior:

- browser requests go to `/api/...`
- Vite proxies `/api` to `http://localhost:3000` by default
- this avoids needing cross-origin browser access during normal local
  development

Relevant web environment variables:

- `VITE_PROXY_TARGET`
  - optional
  - defaults to `http://localhost:3000`
  - controls where the Vite dev server proxies `/api`
- `VITE_API_BASE_URL`
  - optional
  - defaults to `/api`
  - controls the browser-visible base URL used by the API client

Examples:

```bash
# Default local proxy setup
export VITE_PROXY_TARGET="http://localhost:3000"
export VITE_API_BASE_URL="/api"

# Direct API base URL (use only when your deployment handles same-origin or CORS)
export VITE_API_BASE_URL="http://localhost:3000"
```

## Environment Variables

Server environment variables:

| Variable                  | Required | Default   | Description                                               |
| ------------------------- | -------- | --------- | --------------------------------------------------------- |
| `DATABASE_URL`            | Yes      | None      | PostgreSQL connection string used by the repository layer |
| `REDIS_URL`               | Yes      | None      | Redis connection string used by BullMQ queues and workers |
| `HOST`                    | No       | `0.0.0.0` | HTTP bind host                                            |
| `PORT`                    | No       | `3000`    | HTTP bind port                                            |
| `AUTO_MIGRATE`            | No       | `false`   | Run PostgreSQL migrations during server bootstrap         |
| `LOG_LEVEL`               | No       | `info`    | Fastify/runtime log level                                 |
| `ENABLE_HTTP_ADAPTER`     | No       | `false`   | Enable the HTTP execution adapter                         |
| `ENABLE_CLI_ADAPTER`      | No       | `false`   | Enable the CLI execution adapter                          |
| `ENABLE_OPENCLAW_ADAPTER` | No       | `false`   | Enable the OpenClaw execution adapter                     |

Web environment variables:

| Variable            | Required | Default                 | Description                                     |
| ------------------- | -------- | ----------------------- | ----------------------------------------------- |
| `VITE_PROXY_TARGET` | No       | `http://localhost:3000` | Vite dev proxy target for `/api`                |
| `VITE_API_BASE_URL` | No       | `/api`                  | Browser-visible API base URL used by the client |

The server fails fast when required values are missing or malformed.

## Development Workflow

Typical local workflow:

1. Start PostgreSQL and Redis.
2. Start `@regisseur/server`.
3. Start `@regisseur/web`.
4. Use the web console to create agents, definitions, schedules, and runtime
   runs.
5. Use runtime detail pages or API endpoints to inspect failures and recover
   work.

The current web console covers:

- dashboard and runtime monitoring
- workflow definition authoring
- task template, edge, loop, and schedule management
- agent management
- runtime workflow, task, and run inspection

## Available Scripts

Root workspace scripts:

- `pnpm build`
  - builds every workspace package and app
- `pnpm test`
  - runs the root Vitest suite for `packages/**/*.test.ts` plus
    `apps/**/*.test.ts?(x)`
- `pnpm test:server`
  - runs the `@regisseur/server` test suite directly
- `pnpm test:web`
  - runs the `@regisseur/web` test command
- `pnpm lint`
  - runs ESLint across the repository
- `pnpm format`
  - checks formatting with Prettier
- `pnpm format:write`
  - rewrites supported files with Prettier

Useful package-scoped commands:

- `pnpm --filter @regisseur/server build`
- `pnpm --filter @regisseur/server start`
- `pnpm --filter @regisseur/server test`
- `pnpm --filter @regisseur/web dev`
- `pnpm --filter @regisseur/web build`
- `pnpm --filter @regisseur/web test`

Note:

- `apps/web` is now wired for Vitest, but there are currently no checked-in web
  test files. The root test workflow will pick them up automatically once they
  are added under `apps/web/src/**/*.test.ts?(x)`.

## HTTP API Surface

The server exposes JSON endpoints for the main orchestration resources,
including:

- `GET /health`
- agents
- workflows
- workflow definitions
- tasks
- task edges
- task templates
- task template edges
- loop definitions
- schedules
- runs

Notable execution and operator endpoints:

- `POST /workflow-definitions/:workflowDefinitionId/start`
- `POST /tasks/:taskId/dispatch`
- `POST /tasks/:taskId/reset`
- `POST /tasks/:taskId/cancel`
- `POST /workflows/:workflowId/cancel`
- `POST /workflows/:workflowId/purge`

Route implementations live under `apps/server/src/routes`.

## Development Notes

- The workspace uses strict TypeScript settings with ESM (`module: NodeNext`).
- Tests are written with Vitest across packages and apps, including repository
  integration coverage in `packages/store-postgres` and HTTP/runtime coverage in
  `apps/server`.
- PostgreSQL migrations live in
  `packages/store-postgres/src/schema/migrations`.
- Queue-backed execution assumes Redis via BullMQ.
- The checked-in local browser workflow assumes the Vite proxy in `apps/web`.

## Status

Regisseur is no longer just a scaffold. The repository currently contains:

- a tested server API and execution lifecycle
- persistence, queue, scheduler, and adapter packages
- reusable workflow-definition authoring and runtime materialization
- loop expansion, dynamic task expansion, and upstream output injection
- a working web console for authoring and runtime inspection

It is still an early-stage project, so package boundaries, APIs, examples, and
operational hardening should be expected to evolve.
