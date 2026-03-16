import type { AgentDefinition, Task } from "@regisseur/core";
import type { CliTransportPort } from "@regisseur/adapter-cli";
import {
  executeWithCliAdapter,
  type CliExecutionResult,
} from "@regisseur/adapter-cli";
import type { HttpTransportPort } from "@regisseur/adapter-http";
import {
  executeWithHttpAdapter,
  type HttpExecutionResult,
} from "@regisseur/adapter-http";
import type { OpenClawTransportPort } from "@regisseur/adapter-openclaw";
import {
  executeWithOpenClawAdapter,
  type OpenClawExecutionResult,
} from "@regisseur/adapter-openclaw";

import { normalizeExecutionResult } from "../execution/adapter-registry.js";
import {
  createCliProcessTransport,
  createFetchHttpTransport,
  createOpenClawProcessTransport,
} from "../execution/transports.js";
import type {
  BootstrapConfig,
  ExecutionAdapter,
  ExecutableAdapterRegistry,
} from "../types.js";

function bindHttpAdapter(transport: HttpTransportPort): ExecutionAdapter {
  return {
    runtimeType: "http" as const,
    async execute(task: Task, agent: AgentDefinition) {
      const result: HttpExecutionResult = await executeWithHttpAdapter(
        task,
        agent,
        transport,
      );

      return normalizeExecutionResult(result);
    },
  };
}

function bindCliAdapter(transport: CliTransportPort): ExecutionAdapter {
  return {
    runtimeType: "cli" as const,
    async execute(task: Task, agent: AgentDefinition) {
      const result: CliExecutionResult = await executeWithCliAdapter(
        task,
        agent,
        transport,
      );

      return normalizeExecutionResult(result);
    },
  };
}

function bindOpenClawAdapter(
  transport: OpenClawTransportPort,
): ExecutionAdapter {
  return {
    runtimeType: "openclaw" as const,
    async execute(task: Task, agent: AgentDefinition) {
      const result: OpenClawExecutionResult = await executeWithOpenClawAdapter(
        task,
        agent,
        transport,
      );

      return normalizeExecutionResult(result);
    },
  };
}

export interface CreateExecutableAdapterRegistryOptions extends Pick<
  BootstrapConfig,
  "enableHttpAdapter" | "enableCliAdapter" | "enableOpenClawAdapter"
> {
  httpTransport?: HttpTransportPort;
  cliTransport?: CliTransportPort;
  openClawTransport?: OpenClawTransportPort;
}

export function createExecutableAdapterRegistry(
  options: CreateExecutableAdapterRegistryOptions,
): ExecutableAdapterRegistry {
  const registry: ExecutableAdapterRegistry = {};

  if (options.enableHttpAdapter) {
    registry.http = bindHttpAdapter(
      options.httpTransport ?? createFetchHttpTransport(),
    );
  }

  if (options.enableCliAdapter) {
    registry.cli = bindCliAdapter(
      options.cliTransport ?? createCliProcessTransport(),
    );
  }

  if (options.enableOpenClawAdapter) {
    registry.openclaw = bindOpenClawAdapter(
      options.openClawTransport ?? createOpenClawProcessTransport(),
    );
  }

  return registry;
}
