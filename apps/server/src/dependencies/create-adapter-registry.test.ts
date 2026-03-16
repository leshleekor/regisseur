import { describe, expect, it } from "vitest";

import { createAdapterRegistry } from "./create-adapter-registry.js";

describe("createAdapterRegistry", () => {
  it("includes enabled adapters in the registry", () => {
    const registry = createAdapterRegistry({
      enableHttpAdapter: true,
      enableCliAdapter: true,
      enableOpenClawAdapter: true,
    });

    expect(registry.http?.runtimeType).toBe("http");
    expect(typeof registry.http?.execute).toBe("function");
    expect(registry.cli?.runtimeType).toBe("cli");
    expect(typeof registry.cli?.execute).toBe("function");
    expect(registry.openclaw?.runtimeType).toBe("openclaw");
    expect(typeof registry.openclaw?.execute).toBe("function");
  });

  it("omits disabled adapters from the registry", () => {
    const registry = createAdapterRegistry({
      enableHttpAdapter: false,
      enableCliAdapter: true,
      enableOpenClawAdapter: false,
    });

    expect(registry).toMatchObject({
      cli: {
        runtimeType: "cli",
      },
    });
    expect(registry.http).toBeUndefined();
    expect(registry.openclaw).toBeUndefined();
  });

  it("returns an empty registry when all adapters are disabled", () => {
    expect(
      createAdapterRegistry({
        enableHttpAdapter: false,
        enableCliAdapter: false,
        enableOpenClawAdapter: false,
      }),
    ).toEqual({});
  });
});
