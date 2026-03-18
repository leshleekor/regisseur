import type { FastifyInstance } from "fastify";
import type {
  AgentDefinition,
  LoopDefinition,
  Run,
  RunStatus,
  Schedule,
  ScheduleTargetType,
  Task,
  TaskEdge,
  TaskGenerationSource,
  TaskTemplate,
  TaskTemplateEdge,
  TaskStatus,
  Workflow,
  WorkflowDefinition,
  WorkflowStatus,
} from "@regisseur/core";
import type { DispatchEnqueuePort } from "@regisseur/dispatcher";
import type {
  BullMqConnectionConfig,
  QueueLike,
  ScheduleTriggerJobPayload,
  TaskDispatchJobPayload,
  WorkerLike,
} from "@regisseur/queue-bullmq";
import type { ScheduleRegistrationPort } from "@regisseur/scheduler";
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
  countByWorkflowIdAndGenerationSource(
    workflowId: string,
    source: TaskGenerationSource,
  ): Promise<number>;
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
  deleteEdge(
    fromTaskId: string,
    toTaskId: string,
    type?: TaskEdge["type"],
  ): Promise<void>;
}

export interface WorkflowDefinitionsRepositoryLike {
  upsert(definition: WorkflowDefinition): Promise<void>;
  findAll(): Promise<WorkflowDefinition[]>;
  findEnabled(): Promise<WorkflowDefinition[]>;
  findById(workflowDefinitionId: string): Promise<WorkflowDefinition | null>;
  deleteById(workflowDefinitionId: string): Promise<void>;
}

export interface TaskTemplatesRepositoryLike {
  upsert(template: TaskTemplate): Promise<void>;
  findByWorkflowDefinitionId(
    workflowDefinitionId: string,
  ): Promise<TaskTemplate[]>;
  findById(taskTemplateId: string): Promise<TaskTemplate | null>;
  deleteById(taskTemplateId: string): Promise<void>;
}

export interface TaskTemplateEdgesRepositoryLike {
  insert(edge: TaskTemplateEdge): Promise<void>;
  insertMany(edges: readonly TaskTemplateEdge[]): Promise<void>;
  findAllByWorkflowDefinitionTaskTemplates(
    taskTemplateIds: readonly string[],
  ): Promise<TaskTemplateEdge[]>;
  findByFromTaskTemplateId(taskTemplateId: string): Promise<TaskTemplateEdge[]>;
  findByToTaskTemplateId(taskTemplateId: string): Promise<TaskTemplateEdge[]>;
  deleteByTaskTemplateId(taskTemplateId: string): Promise<void>;
  deleteEdge(
    fromTaskTemplateId: string,
    toTaskTemplateId: string,
    type?: TaskTemplateEdge["type"],
  ): Promise<void>;
}

export interface LoopDefinitionsRepositoryLike {
  upsert(loopDefinition: LoopDefinition): Promise<void>;
  findByWorkflowDefinitionId(
    workflowDefinitionId: string,
  ): Promise<LoopDefinition | null>;
  findById(loopDefinitionId: string): Promise<LoopDefinition | null>;
  deleteById(loopDefinitionId: string): Promise<void>;
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
  findLatestSucceededByTaskId(taskId: string): Promise<Run | null>;
  findByAgentId(agentId: string): Promise<Run[]>;
  findByStatus(status: RunStatus): Promise<Run[]>;
  findById(runId: string): Promise<Run | null>;
  deleteById(runId: string): Promise<void>;
}

export interface ServerRepositories {
  agentsRepository: AgentsRepositoryLike;
  workflowsRepository: WorkflowsRepositoryLike;
  tasksRepository: TasksRepositoryLike;
  taskEdgesRepository: TaskEdgesRepositoryLike;
  workflowDefinitionsRepository: WorkflowDefinitionsRepositoryLike;
  taskTemplatesRepository: TaskTemplatesRepositoryLike;
  taskTemplateEdgesRepository: TaskTemplateEdgesRepositoryLike;
  loopDefinitionsRepository: LoopDefinitionsRepositoryLike;
  schedulesRepository: SchedulesRepositoryLike;
  runsRepository: RunsRepositoryLike;
}

export interface ServerDependencies extends ServerRepositories {
  enqueuePort: DispatchEnqueuePort;
  scheduleRegistrationPort?: ScheduleRegistrationPort;
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

export interface ScheduleTriggerQueueLike extends QueueLike<ScheduleTriggerJobPayload> {
  close(): Promise<void>;
}

export interface QueueResources {
  connection: BullMqConnectionConfig;
  taskDispatchQueue: TaskDispatchQueueLike;
  scheduleTriggerQueue: ScheduleTriggerQueueLike;
  close(): Promise<void>;
}

export interface WorkerResources {
  taskDispatchWorker: WorkerLike;
  scheduleTriggerWorker: WorkerLike;
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
