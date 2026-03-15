import { describe, expect, it } from "vitest";

import { createAdapterRegistry } from "./create-adapter-registry.js";

describe("createAdapterRegistry", () => {
  it("includes enabled adapters in the registry", () => {
    expect(
      createAdapterRegistry({
        enableHttpAdapter: true,
        enableCliAdapter: true,
        enableOpenClawAdapter: true,
      }),
    ).toEqual({
      http: {
        runtimeType: "http",
      },
      cli: {
        runtimeType: "cli",
      },
      openclaw: {
        runtimeType: "openclaw",
      },
    });
  });

  it("omits disabled adapters from the registry", () => {
    expect(
      createAdapterRegistry({
        enableHttpAdapter: false,
        enableCliAdapter: true,
        enableOpenClawAdapter: false,
      }),
    ).toEqual({
      cli: {
        runtimeType: "cli",
      },
    });
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
