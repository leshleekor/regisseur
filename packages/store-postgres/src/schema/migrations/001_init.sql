CREATE TABLE IF NOT EXISTS agents (
  agent_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  runtime_type TEXT NOT NULL,
  capabilities JSONB NOT NULL,
  enabled BOOLEAN NOT NULL,
  config JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT agents_capabilities_is_array CHECK (jsonb_typeof(capabilities) = 'array'),
  CONSTRAINT agents_config_is_object CHECK (jsonb_typeof(config) = 'object')
);

CREATE TABLE IF NOT EXISTS workflow_definitions (
  workflow_definition_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NULL,
  enabled BOOLEAN NOT NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS workflows (
  workflow_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  status TEXT NOT NULL,
  workflow_definition_id TEXT NULL
    REFERENCES workflow_definitions(workflow_definition_id),
  trigger_source TEXT NULL,
  triggered_by_schedule_id TEXT NULL,
  started_at TIMESTAMPTZ NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS task_templates (
  task_template_id TEXT PRIMARY KEY,
  workflow_definition_id TEXT NOT NULL
    REFERENCES workflow_definitions(workflow_definition_id),
  title TEXT NOT NULL,
  payload JSONB NOT NULL,
  default_assignee_agent_id TEXT NULL REFERENCES agents(agent_id),
  retry_count INTEGER NOT NULL,
  concurrency_key TEXT NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS loop_definitions (
  loop_definition_id TEXT PRIMARY KEY,
  workflow_definition_id TEXT NOT NULL
    REFERENCES workflow_definitions(workflow_definition_id),
  name TEXT NOT NULL,
  controller_task_template_id TEXT NOT NULL
    REFERENCES task_templates(task_template_id),
  entry_task_template_ids JSONB NOT NULL,
  body_task_template_ids JSONB NOT NULL,
  max_iterations INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT loop_definitions_entry_task_template_ids_is_array
    CHECK (jsonb_typeof(entry_task_template_ids) = 'array'),
  CONSTRAINT loop_definitions_body_task_template_ids_is_array
    CHECK (jsonb_typeof(body_task_template_ids) = 'array')
);

CREATE TABLE IF NOT EXISTS tasks (
  task_id TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(workflow_id),
  title TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL,
  assignee_agent_id TEXT NULL REFERENCES agents(agent_id),
  retry_count INTEGER NOT NULL,
  task_template_id TEXT NULL REFERENCES task_templates(task_template_id),
  loop_definition_id TEXT NULL REFERENCES loop_definitions(loop_definition_id),
  iteration INTEGER NULL,
  spawned_from_task_id TEXT NULL REFERENCES tasks(task_id),
  concurrency_key TEXT NULL,
  metadata JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS task_edges (
  from_task_id TEXT NOT NULL REFERENCES tasks(task_id),
  to_task_id TEXT NOT NULL REFERENCES tasks(task_id),
  type TEXT NOT NULL,
  PRIMARY KEY (from_task_id, to_task_id, type)
);

CREATE TABLE IF NOT EXISTS task_template_edges (
  from_task_template_id TEXT NOT NULL REFERENCES task_templates(task_template_id),
  to_task_template_id TEXT NOT NULL REFERENCES task_templates(task_template_id),
  type TEXT NOT NULL,
  PRIMARY KEY (from_task_template_id, to_task_template_id, type)
);

CREATE TABLE IF NOT EXISTS schedules (
  schedule_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  cron_expression TEXT NULL,
  run_at TIMESTAMPTZ NULL,
  timezone TEXT NULL,
  enabled BOOLEAN NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT schedules_type_fields_check CHECK (
    (type = 'once' AND run_at IS NOT NULL AND cron_expression IS NULL) OR
    (type = 'cron' AND cron_expression IS NOT NULL AND run_at IS NULL)
  )
);

CREATE TABLE IF NOT EXISTS runs (
  run_id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(task_id),
  agent_id TEXT NOT NULL REFERENCES agents(agent_id),
  status TEXT NOT NULL,
  started_at TIMESTAMPTZ NULL,
  finished_at TIMESTAMPTZ NULL,
  output JSONB NULL,
  error TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_workflow_id
  ON tasks (workflow_id);

CREATE INDEX IF NOT EXISTS idx_tasks_status
  ON tasks (status);

CREATE INDEX IF NOT EXISTS idx_tasks_assignee_agent_id
  ON tasks (assignee_agent_id);

CREATE INDEX IF NOT EXISTS idx_tasks_task_template_id
  ON tasks (task_template_id);

CREATE INDEX IF NOT EXISTS idx_tasks_loop_definition_id
  ON tasks (loop_definition_id);

CREATE INDEX IF NOT EXISTS idx_tasks_iteration
  ON tasks (iteration);

CREATE INDEX IF NOT EXISTS idx_tasks_spawned_from_task_id
  ON tasks (spawned_from_task_id);

CREATE INDEX IF NOT EXISTS idx_tasks_concurrency_key
  ON tasks (concurrency_key);

CREATE INDEX IF NOT EXISTS idx_task_edges_to_task_id
  ON task_edges (to_task_id);

CREATE INDEX IF NOT EXISTS idx_task_edges_from_task_id
  ON task_edges (from_task_id);

CREATE INDEX IF NOT EXISTS idx_workflow_definitions_enabled
  ON workflow_definitions (enabled);

CREATE INDEX IF NOT EXISTS idx_workflows_workflow_definition_id
  ON workflows (workflow_definition_id);

CREATE INDEX IF NOT EXISTS idx_task_templates_workflow_definition_id
  ON task_templates (workflow_definition_id);

CREATE INDEX IF NOT EXISTS idx_task_templates_default_assignee_agent_id
  ON task_templates (default_assignee_agent_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_loop_definitions_workflow_definition_id
  ON loop_definitions (workflow_definition_id);

CREATE INDEX IF NOT EXISTS idx_loop_definitions_controller_task_template_id
  ON loop_definitions (controller_task_template_id);

CREATE INDEX IF NOT EXISTS idx_task_template_edges_from_task_template_id
  ON task_template_edges (from_task_template_id);

CREATE INDEX IF NOT EXISTS idx_task_template_edges_to_task_template_id
  ON task_template_edges (to_task_template_id);

CREATE INDEX IF NOT EXISTS idx_schedules_enabled
  ON schedules (enabled);

CREATE INDEX IF NOT EXISTS idx_schedules_target
  ON schedules (target_type, target_id);

CREATE INDEX IF NOT EXISTS idx_runs_task_id
  ON runs (task_id);

CREATE INDEX IF NOT EXISTS idx_runs_agent_id
  ON runs (agent_id);

CREATE INDEX IF NOT EXISTS idx_runs_status
  ON runs (status);
