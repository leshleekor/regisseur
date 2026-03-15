import type { FastifyInstance } from "fastify";
import type {
  AgentDefinition,
  Run,
  RunStatus,
  Schedule,
  ScheduleTargetType,
  Task,
  TaskEdge,
  TaskStatus,
  Workflow,
  WorkflowStatus,
} from "@regisseur/core";
import type {
  DispatchEnqueuePort,
  DispatchRequestOptions,
  DispatchTaskResult,
} from "@regisseur/dispatcher";
import type {
  BullMqConnectionConfig,
  QueueLike,
  TaskDispatchJobPayload,
  WorkerLike,
} from "@regisseur/queue-bullmq";
import type { Queryable } from "@regisseur/store-postgres";

export interface AgentsRepositoryLike {
  upsert(agent: AgentDefinition): Promise<void>;
  findAll(): Promise<AgentDefinition[]>;
  findEnabled(): Promise<AgentDefinition[]>;
  findById(agentId: string): Promise<AgentDefinition | null>;
  deleteById(agentId: string): Promise<void>;
}

export interface WorkflowsRepositoryLike {
  upsert(workflow: Workflow): Promise<void>;
  findAll(): Promise<Workflow[]>;
  findByStatus(status: WorkflowStatus): Promise<Workflow[]>;
  findById(workflowId: string): Promise<Workflow | null>;
  deleteById(workflowId: string): Promise<void>;
}

export interface TasksRepositoryLike {
  upsert(task: Task): Promise<void>;
  findByWorkflowId(workflowId: string): Promise<Task[]>;
  findByStatus(status: TaskStatus): Promise<Task[]>;
  findById(taskId: string): Promise<Task | null>;
  deleteById(taskId: string): Promise<void>;
}

export interface TaskEdgesRepositoryLike {
  insert(edge: TaskEdge): Promise<void>;
  insertMany(edges: readonly TaskEdge[]): Promise<void>;
  findAllByWorkflowTasks(taskIds: readonly string[]): Promise<TaskEdge[]>;
  findByFromTaskId(taskId: string): Promise<TaskEdge[]>;
  findByToTaskId(taskId: string): Promise<TaskEdge[]>;
  deleteByTaskId(taskId: string): Promise<void>;
}

export interface SchedulesRepositoryLike {
  upsert(schedule: Schedule): Promise<void>;
  findAll(): Promise<Schedule[]>;
  findEnabled(): Promise<Schedule[]>;
  findByTarget(
    targetType: ScheduleTargetType,
    targetId: string,
  ): Promise<Schedule[]>;
  findById(scheduleId: string): Promise<Schedule | null>;
  deleteById(scheduleId: string): Promise<void>;
}

export interface RunsRepositoryLike {
  upsert(run: Run): Promise<void>;
  findByTaskId(taskId: string): Promise<Run[]>;
  findByAgentId(agentId: string): Promise<Run[]>;
  findByStatus(status: RunStatus): Promise<Run[]>;
  findById(runId: string): Promise<Run | null>;
  deleteById(runId: string): Promise<void>;
}

export interface DispatcherLike {
  dispatch(
    task: Task,
    agents: readonly AgentDefinition[],
    options?: DispatchRequestOptions,
  ): Promise<DispatchTaskResult>;
}

export interface ServerRepositories {
  agentsRepository: AgentsRepositoryLike;
  workflowsRepository: WorkflowsRepositoryLike;
  tasksRepository: TasksRepositoryLike;
  taskEdgesRepository: TaskEdgesRepositoryLike;
  schedulesRepository: SchedulesRepositoryLike;
  runsRepository: RunsRepositoryLike;
}

export interface ServerDependencies extends ServerRepositories {
  dispatcher: DispatcherLike;
  enqueuePort: DispatchEnqueuePort;
  logger?: boolean | Record<string, unknown>;
}

export interface ServerConfig {
  host: string;
  port: number;
}

export interface BootstrapConfig {
  server: ServerConfig;
  databaseUrl: string;
  redisUrl: string;
  autoMigrate: boolean;
  logLevel: string;
  enableHttpAdapter: boolean;
  enableCliAdapter: boolean;
  enableOpenClawAdapter: boolean;
}

export interface BootstrapConfigOverrides extends Partial<
  Omit<BootstrapConfig, "server">
> {
  server?: Partial<ServerConfig>;
}

export interface PostgresPoolLike extends Queryable {
  end(): Promise<void>;
}

export interface TaskDispatchQueueLike extends QueueLike<TaskDispatchJobPayload> {
  close(): Promise<void>;
}

export interface QueueResources {
  connection: BullMqConnectionConfig;
  taskDispatchQueue: TaskDispatchQueueLike;
  close(): Promise<void>;
}

export interface WorkerResources {
  taskDispatchWorker: WorkerLike;
  close(): Promise<void>;
}

export type ExecutionResult =
  | {
      ok: true;
      externalRunId?: string;
      output?: Record<string, unknown>;
    }
  | {
      ok: false;
      message: string;
      reason?: string;
    };

export interface ExecutionAdapter {
  runtimeType: AgentDefinition["runtimeType"];
  execute(task: Task, agent: AgentDefinition): Promise<ExecutionResult>;
}

export interface ExecutableAdapterRegistry {
  http?: ExecutionAdapter;
  cli?: ExecutionAdapter;
  openclaw?: ExecutionAdapter;
}

export interface StandaloneServerComposition {
  config: BootstrapConfig;
  dependencies: ServerDependencies;
  repositories: ServerRepositories;
  dispatcher: DispatcherLike;
  enqueuePort: DispatchEnqueuePort;
  executableAdapterRegistry: ExecutableAdapterRegistry;
  pool: PostgresPoolLike;
  queueResources: QueueResources;
  workerResources?: WorkerResources;
}

export interface ShutdownResources {
  app: FastifyInstance;
  pool: PostgresPoolLike;
  queueResources: QueueResources;
  workerResources?: WorkerResources;
}

export interface ShutdownController {
  shutdown(): Promise<void>;
}

export interface BootstrapServerResult extends StandaloneServerComposition {
  app: FastifyInstance;
  shutdown: ShutdownController;
  unregisterSignalHandlers: () => void;
}
