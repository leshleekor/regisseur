import { describe, expect, it } from "vitest";

import { PACKAGE_NAME } from "./index.js";

describe("core scaffold", () => {
  it("exports the package name", () => {
    expect(PACKAGE_NAME).toBe("core");
  });
});
