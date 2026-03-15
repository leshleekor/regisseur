import type { AdapterRegistry, BootstrapConfig } from "../types.js";

export function createAdapterRegistry(
  config: Pick<
    BootstrapConfig,
    "enableHttpAdapter" | "enableCliAdapter" | "enableOpenClawAdapter"
  >,
): AdapterRegistry {
  const registry: AdapterRegistry = {};

  if (config.enableHttpAdapter) {
    registry.http = {
      runtimeType: "http",
    };
  }

  if (config.enableCliAdapter) {
    registry.cli = {
      runtimeType: "cli",
    };
  }

  if (config.enableOpenClawAdapter) {
    registry.openclaw = {
      runtimeType: "openclaw",
    };
  }

  return registry;
}
