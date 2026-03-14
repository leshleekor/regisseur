import type {
  DispatcherLike,
  ServerDependencies,
  ServerRepositories,
} from "../types.js";

export function createServerDependencies(
  repositories: ServerRepositories,
  dispatcher: DispatcherLike,
  logger?: ServerDependencies["logger"],
): ServerDependencies {
  return {
    ...repositories,
    dispatcher,
    logger,
  };
}
