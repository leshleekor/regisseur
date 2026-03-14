import { dispatchTask, type DispatchEnqueuePort } from "@regisseur/dispatcher";

import type { DispatcherLike } from "../types.js";

export function createDispatcherLike(
  enqueuePort: DispatchEnqueuePort,
): DispatcherLike {
  return {
    dispatch(task, agents, options) {
      return dispatchTask(task, agents, enqueuePort, options);
    },
  };
}
