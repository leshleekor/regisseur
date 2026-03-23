import { describe, expect, it } from "vitest";

import { buildBreadcrumbs } from "./navigation";

describe("buildBreadcrumbs", () => {
  it("builds breadcrumbs for definition detail routes", () => {
    expect(buildBreadcrumbs("/workflow-definitions/definition-1/overview")).toEqual([
      {
        label: "Definitions",
        to: "/workflow-definitions",
      },
      {
        label: "Definition",
        to: "/workflow-definitions/definition-1",
      },
      {
        label: "Overview",
      },
    ]);
  });

  it("maps root to dashboard", () => {
    expect(buildBreadcrumbs("/")).toEqual([
      {
        label: "Dashboard",
      },
    ]);
  });
});
