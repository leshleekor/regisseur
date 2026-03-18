import type { DispatchEnqueuePort } from "@regisseur/dispatcher";
import type { ScheduleRegistrationPort } from "@regisseur/scheduler";

import type { ServerDependencies, ServerRepositories } from "../types.js";

export function createServerDependencies(
  repositories: ServerRepositories,
  enqueuePort: DispatchEnqueuePort,
  scheduleRegistrationPort?: ScheduleRegistrationPort,
  logger?: ServerDependencies["logger"],
): ServerDependencies {
  return {
    ...repositories,
    enqueuePort,
    scheduleRegistrationPort,
    logger,
  };
}
