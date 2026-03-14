import type {
  AgentDefinition,
  Run,
  RunStatus,
  Schedule,
  ScheduleTargetType,
  Task,
  TaskStatus,
  Workflow,
  WorkflowStatus,
} from "@regisseur/core";
import type {
  DispatchRequestOptions,
  DispatchTaskResult,
} from "@regisseur/dispatcher";

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
  schedulesRepository: SchedulesRepositoryLike;
  runsRepository: RunsRepositoryLike;
}

export interface ServerDependencies extends ServerRepositories {
  dispatcher: DispatcherLike;
  logger?: boolean | Record<string, unknown>;
}

export interface ServerConfig {
  host: string;
  port: number;
}
