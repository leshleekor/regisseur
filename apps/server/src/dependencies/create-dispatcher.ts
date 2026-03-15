import type { DispatchEnqueuePort } from "@regisseur/dispatcher";

import { createDispatcherLike } from "../plugins/dispatcher.js";
import type { DispatcherLike } from "../types.js";

export function createDispatcher(
  enqueuePort: DispatchEnqueuePort,
): DispatcherLike {
  return createDispatcherLike(enqueuePort);
}
