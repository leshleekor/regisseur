export interface BreadcrumbItem {
  label: string;
  to?: string;
}

const staticLabels = new Map<string, string>([
  ["/dashboard", "Dashboard"],
  ["/workflow-definitions", "Definitions"],
  ["/workflow-definitions/new", "New Definition"],
  ["/agents", "Agents"],
  ["/agents/new", "New Agent"],
  ["/schedules", "Schedules"],
  ["/schedules/new", "New Schedule"],
  ["/workflows", "Workflows"],
]);

export function buildBreadcrumbs(pathname: string): BreadcrumbItem[] {
  const normalized = pathname === "/" ? "/dashboard" : pathname;
  const segments = normalized.split("/").filter(Boolean);
  const breadcrumbs: BreadcrumbItem[] = [];

  for (let index = 0; index < segments.length; index += 1) {
    const currentPath = `/${segments.slice(0, index + 1).join("/")}`;
    const segment = segments[index];
    const previousSegment = segments[index - 1];
    const isLast = index === segments.length - 1;

    breadcrumbs.push({
      label: staticLabels.get(currentPath) ?? inferLabel(segment, previousSegment),
      to: isLast ? undefined : currentPath,
    });
  }

  return breadcrumbs.length > 0
    ? breadcrumbs
    : [
        {
          label: "Dashboard",
        },
      ];
}

function inferLabel(segment: string, previousSegment?: string): string {
  if (previousSegment === "workflow-definitions") {
    return "Definition";
  }

  if (previousSegment === "workflows") {
    return "Workflow";
  }

  if (previousSegment === "tasks") {
    return "Task";
  }

  if (previousSegment === "runs") {
    return "Run";
  }

  if (previousSegment === "agents") {
    return "Agent";
  }

  if (previousSegment === "schedules") {
    return "Schedule";
  }

  return humanizeSegment(segment);
}

function humanizeSegment(value: string): string {
  return value
    .split("-")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
