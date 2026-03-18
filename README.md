# regisseur (r7r)

Regisseur is a lightweight AI agent orchestrator for task- and workflow-driven
automation. It combines workflow definitions, task graphs, schedules,
queue-backed execution, transport adapters, and run tracking in a single
TypeScript monorepo.

This repository uses a `pnpm` workspace. Shared libraries live in `packages/`,
while runnable applications and examples live in `apps/`.

## Overview

Regisseur models agent execution as a graph of reusable definitions and
materialized runtime objects:

- agents describe the execution backends available to the system
- workflow definitions and task templates describe reusable automation graphs
- workflows and tasks represent concrete runtime executions
- schedules trigger workflow definition runs over time
- runs capture execution attempts, state transitions, and outputs
- adapters translate orchestration tasks into real external requests

The current implementation is centered on a Fastify server, PostgreSQL-backed
repositories, Redis/BullMQ workers, and adapter packages for multiple transport
styles.

## Architecture

At a high level, the workspace is split into a few layers:

1. `@regisseur/core` defines the domain model and graph/dependency helpers.
2. `@regisseur/store-postgres` persists orchestration state in PostgreSQL and
   ships SQL migrations.
3. `@regisseur/scheduler`, `@regisseur/dispatcher`, and
   `@regisseur/queue-bullmq` coordinate scheduled and queue-backed execution.
4. Adapter packages translate tasks into transport-specific execution requests.
5. `@regisseur/server` composes the stack into an HTTP API, restores persisted
   schedules on boot, and starts the runtime services.

## Workspace Layout

| Path                        | Package                         | Purpose                                                       |
| --------------------------- | ------------------------------- | ------------------------------------------------------------- |
| `apps/server`               | `@regisseur/server`             | Fastify API server and runtime composition layer              |
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

## Getting Started

Install dependencies and build the workspace:

```bash
pnpm install
pnpm build
```

Provide the server environment variables:

```bash
export DATABASE_URL="postgres://postgres:postgres@localhost:5432/regisseur"
export REDIS_URL="redis://localhost:6379"
export AUTO_MIGRATE=true
export ENABLE_CLI_ADAPTER=true
```

Start the server:

```bash
pnpm --filter @regisseur/server start
```

By default, the server listens on `0.0.0.0:3000`.

For a fresh local database, setting `AUTO_MIGRATE=true` is the easiest way to
apply the bundled PostgreSQL migrations at startup.

## Environment Variables

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

The server fails fast when required values are missing or malformed.

## Available Scripts

Root workspace scripts:

- `pnpm build` - build every workspace package
- `pnpm test` - run the root Vitest suite
- `pnpm lint` - run ESLint across the repository
- `pnpm format` - check formatting with Prettier
- `pnpm format:write` - rewrite supported files with Prettier

Useful package-scoped commands:

- `pnpm --filter @regisseur/server build`
- `pnpm --filter @regisseur/server start`
- `pnpm --filter @regisseur/server test`

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

Notable execution-oriented routes include:

- `POST /workflow-definitions/:workflowDefinitionId/start`
- `POST /tasks/:taskId/dispatch`

Route implementations live under `apps/server/src/routes`.

## Development Notes

- The workspace uses strict TypeScript settings with ESM (`module: NodeNext`).
- Tests are written with Vitest across apps and packages, including repository
  integration coverage in `packages/store-postgres`.
- PostgreSQL migrations currently live in
  `packages/store-postgres/src/schema/migrations`.
- Queue-backed execution currently assumes Redis via BullMQ.

## Status

Regisseur is already more than a blank scaffold: the repository contains the
server API, orchestration packages, persistence layer, scheduler, queue
integration, adapters, and test coverage. It is still an early-stage project,
though, so package boundaries, APIs, examples, and operational tooling should
be expected to evolve.
