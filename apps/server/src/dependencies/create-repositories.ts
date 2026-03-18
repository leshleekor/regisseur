import {
  PostgresAgentsRepository,
  PostgresLoopDefinitionsRepository,
  PostgresRunsRepository,
  PostgresSchedulesRepository,
  PostgresTaskEdgesRepository,
  PostgresTaskTemplateEdgesRepository,
  PostgresTaskTemplatesRepository,
  PostgresTasksRepository,
  PostgresWorkflowDefinitionsRepository,
  PostgresWorkflowsRepository,
  type Queryable,
} from "@regisseur/store-postgres";

import type { ServerRepositories } from "../types.js";

export function createRepositories(db: Queryable): ServerRepositories {
  return {
    agentsRepository: new PostgresAgentsRepository(db),
    workflowsRepository: new PostgresWorkflowsRepository(db),
    tasksRepository: new PostgresTasksRepository(db),
    taskEdgesRepository: new PostgresTaskEdgesRepository(db),
    workflowDefinitionsRepository: new PostgresWorkflowDefinitionsRepository(
      db,
    ),
    taskTemplatesRepository: new PostgresTaskTemplatesRepository(db),
    taskTemplateEdgesRepository: new PostgresTaskTemplateEdgesRepository(db),
    loopDefinitionsRepository: new PostgresLoopDefinitionsRepository(db),
    schedulesRepository: new PostgresSchedulesRepository(db),
    runsRepository: new PostgresRunsRepository(db),
  };
}
