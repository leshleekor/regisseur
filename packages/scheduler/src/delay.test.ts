import { describe, expect, it } from "vitest";

import { calculateDelayMs } from "./index.js";

describe("scheduler delay calculation", () => {
  it("returns a positive delay for future run times", () => {
    const now = new Date("2026-03-13T00:00:00.000Z");

    expect(calculateDelayMs("2026-03-13T00:00:05.000Z", now)).toBe(5_000);
  });

  it("clamps past run times to zero", () => {
    const now = new Date("2026-03-13T00:00:10.000Z");

    expect(calculateDelayMs("2026-03-13T00:00:05.000Z", now)).toBe(0);
  });
});
