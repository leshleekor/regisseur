import type { QueryResult, QueryResultRow } from "pg";

export interface Queryable {
  query<TResult extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: readonly unknown[],
  ): Promise<QueryResult<TResult>>;
}

export type TimestampValue = string | Date;

export interface AgentRow extends QueryResultRow {
  agent_id: string;
  name: string;
  runtime_type: string;
  capabilities: unknown;
  enabled: boolean;
  config: unknown;
  created_at: TimestampValue;
  updated_at: TimestampValue;
}

export interface WorkflowRow extends QueryResultRow {
  workflow_id: string;
  name: string;
  status: string;
  workflow_definition_id: string | null;
  trigger_source: string | null;
  triggered_by_schedule_id: string | null;
  started_at: TimestampValue | null;
  metadata: unknown | null;
  created_at: TimestampValue;
  updated_at: TimestampValue;
}

export interface WorkflowDefinitionRow extends QueryResultRow {
  workflow_definition_id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  metadata: unknown | null;
  created_at: TimestampValue;
  updated_at: TimestampValue;
}

export interface LoopDefinitionRow extends QueryResultRow {
  loop_definition_id: string;
  workflow_definition_id: string;
  name: string;
  controller_task_template_id: string;
  entry_task_template_ids: unknown;
  body_task_template_ids: unknown;
  max_iterations: number;
  created_at: TimestampValue;
  updated_at: TimestampValue;
}

export interface TaskRow extends QueryResultRow {
  task_id: string;
  workflow_id: string;
  title: string;
  payload: unknown;
  status: string;
  assignee_agent_id: string | null;
  retry_count: number;
  task_template_id: string | null;
  loop_definition_id: string | null;
  iteration: number | null;
  spawned_from_task_id: string | null;
  concurrency_key: string | null;
  metadata: unknown | null;
  created_at: TimestampValue;
  updated_at: TimestampValue;
}

export interface TaskEdgeRow extends QueryResultRow {
  from_task_id: string;
  to_task_id: string;
  type: string;
}

export interface TaskTemplateRow extends QueryResultRow {
  task_template_id: string;
  workflow_definition_id: string;
  title: string;
  payload: unknown;
  default_assignee_agent_id: string | null;
  retry_count: number;
  concurrency_key: string | null;
  metadata: unknown | null;
  created_at: TimestampValue;
  updated_at: TimestampValue;
}

export interface TaskTemplateEdgeRow extends QueryResultRow {
  from_task_template_id: string;
  to_task_template_id: string;
  type: string;
}

export interface ScheduleRow extends QueryResultRow {
  schedule_id: string;
  type: string;
  cron_expression: string | null;
  run_at: TimestampValue | null;
  timezone: string | null;
  enabled: boolean;
  target_type: string;
  target_id: string;
  created_at: TimestampValue;
  updated_at: TimestampValue;
}

export interface RunRow extends QueryResultRow {
  run_id: string;
  task_id: string;
  agent_id: string;
  status: string;
  started_at: TimestampValue | null;
  finished_at: TimestampValue | null;
  output: unknown | null;
  error: string | null;
  created_at: TimestampValue;
  updated_at: TimestampValue;
}

export interface AgentRowInput {
  agent_id: string;
  name: string;
  runtime_type: string;
  capabilities: string;
  enabled: boolean;
  config: string;
}

export interface WorkflowRowInput {
  workflow_id: string;
  name: string;
  status: string;
  workflow_definition_id: string | null;
  trigger_source: string | null;
  triggered_by_schedule_id: string | null;
  started_at: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface WorkflowDefinitionRowInput {
  workflow_definition_id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface LoopDefinitionRowInput {
  loop_definition_id: string;
  workflow_definition_id: string;
  name: string;
  controller_task_template_id: string;
  entry_task_template_ids: string;
  body_task_template_ids: string;
  max_iterations: number;
  created_at: string;
  updated_at: string;
}

export interface TaskRowInput {
  task_id: string;
  workflow_id: string;
  title: string;
  payload: string;
  status: string;
  assignee_agent_id: string | null;
  retry_count: number;
  task_template_id: string | null;
  loop_definition_id: string | null;
  iteration: number | null;
  spawned_from_task_id: string | null;
  concurrency_key: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskEdgeRowInput {
  from_task_id: string;
  to_task_id: string;
  type: string;
}

export interface TaskTemplateRowInput {
  task_template_id: string;
  workflow_definition_id: string;
  title: string;
  payload: string;
  default_assignee_agent_id: string | null;
  retry_count: number;
  concurrency_key: string | null;
  metadata: string | null;
  created_at: string;
  updated_at: string;
}

export interface TaskTemplateEdgeRowInput {
  from_task_template_id: string;
  to_task_template_id: string;
  type: string;
}

export interface ScheduleRowInput {
  schedule_id: string;
  type: string;
  cron_expression: string | null;
  run_at: string | null;
  timezone: string | null;
  enabled: boolean;
  target_type: string;
  target_id: string;
  created_at: string;
  updated_at: string;
}

export interface RunRowInput {
  run_id: string;
  task_id: string;
  agent_id: string;
  status: string;
  started_at: string | null;
  finished_at: string | null;
  output: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}
