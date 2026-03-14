import type { DispatchEnqueuePortResult, DispatchRequest } from "./types.js";

/**
 * Queue-independent contract used by the dispatcher to hand off selected
 * dispatch requests.
 */
export interface DispatchEnqueuePort {
  enqueueTaskDispatch(
    request: DispatchRequest,
  ): Promise<DispatchEnqueuePortResult>;
}
