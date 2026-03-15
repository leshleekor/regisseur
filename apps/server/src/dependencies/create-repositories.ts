import {
  PostgresAgentsRepository,
  PostgresRunsRepository,
  PostgresSchedulesRepository,
  PostgresTaskEdgesRepository,
  PostgresTasksRepository,
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
    schedulesRepository: new PostgresSchedulesRepository(db),
    runsRepository: new PostgresRunsRepository(db),
  };
}
