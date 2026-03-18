import type { DispatchEnqueuePort } from "@regisseur/dispatcher";
import type { ScheduleTriggerJobPayload } from "@regisseur/queue-bullmq";

import {
  handleScheduleTrigger,
  type HandleScheduleTriggerOptions,
} from "../schedules/trigger-service.js";
import type { ScheduleTriggerRepositories } from "../schedules/trigger-service.js";

export interface CreateScheduleTriggerProcessorOptions extends HandleScheduleTriggerOptions {
  repositories: ScheduleTriggerRepositories;
  enqueuePort: DispatchEnqueuePort;
}

export function createScheduleTriggerProcessor(
  options: CreateScheduleTriggerProcessorOptions,
): (payload: ScheduleTriggerJobPayload) => Promise<void> {
  return async (payload) => {
    await handleScheduleTrigger(
      payload,
      options.repositories,
      options.enqueuePort,
      options,
    );
  };
}
