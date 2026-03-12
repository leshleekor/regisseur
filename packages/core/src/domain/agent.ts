export const AGENT_RUNTIME_TYPES = ["http", "cli", "openclaw"] as const;

/**
 * Supported execution backends for an agent definition.
 */
export type AgentRuntimeType = (typeof AGENT_RUNTIME_TYPES)[number];

/**
 * AgentDefinition describes an execution actor that can receive work from the
 * orchestrator without coupling the core package to a concrete runtime.
 */
export interface AgentDefinition {
  /** Stable internal identifier used by stores and dispatchers. */
  agentId: string;
  /** Human-friendly display name for logs, UI, and diagnostics. */
  name: string;
  /** Runtime category used to select the matching execution adapter. */
  runtimeType: AgentRuntimeType;
  /** Capability tags that help future dispatch logic choose an agent. */
  capabilities: string[];
  /** Whether this agent can currently receive new task dispatches. */
  enabled: boolean;
  /** Runtime-specific adapter configuration kept intentionally unstructured. */
  config: Record<string, unknown>;
}
