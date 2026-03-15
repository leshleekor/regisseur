import type { ShutdownController, ShutdownResources } from "../types.js";

export type ShutdownSignal = "SIGINT" | "SIGTERM";

export interface ProcessSignalBindingLike {
  once(event: ShutdownSignal, listener: () => void): unknown;
  off?(event: ShutdownSignal, listener: () => void): unknown;
  removeListener?(event: ShutdownSignal, listener: () => void): unknown;
}

export function createShutdownController(
  resources: ShutdownResources,
): ShutdownController {
  let shutdownPromise: Promise<void> | null = null;

  return {
    async shutdown() {
      if (shutdownPromise) {
        return shutdownPromise;
      }

      shutdownPromise = (async () => {
        const results = await Promise.allSettled([
          resources.app.close(),
          resources.pool.end(),
          resources.queueResources.close(),
          ...(resources.workerResources
            ? [resources.workerResources.close()]
            : []),
        ]);
        const rejection = results.find(
          (result): result is PromiseRejectedResult =>
            result.status === "rejected",
        );

        if (rejection) {
          throw rejection.reason;
        }
      })();

      return shutdownPromise;
    },
  };
}

export function registerShutdownHandlers(
  controller: ShutdownController,
  processRef: ProcessSignalBindingLike = process,
): () => void {
  const listener = () => {
    void controller.shutdown().catch(() => undefined);
  };

  processRef.once("SIGINT", listener);
  processRef.once("SIGTERM", listener);

  return () => {
    if (typeof processRef.off === "function") {
      processRef.off("SIGINT", listener);
      processRef.off("SIGTERM", listener);
      return;
    }

    if (typeof processRef.removeListener === "function") {
      processRef.removeListener("SIGINT", listener);
      processRef.removeListener("SIGTERM", listener);
    }
  };
}
