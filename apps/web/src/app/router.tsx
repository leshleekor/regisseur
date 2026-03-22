import {
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { JSX } from "react";

import { AppShell } from "@/components/layout/app-shell";
import {
  AgentEditorPage,
  AgentsPage,
  DashboardPage,
  DefinitionDetailShell,
  DefinitionGraphPage,
  DefinitionLoopPage,
  DefinitionOverviewPage,
  DefinitionRunsPage,
  DefinitionSchedulesPage,
  DefinitionTasksPage,
  NewWorkflowDefinitionPage,
  RunDetailPage,
  ScheduleEditorPage,
  SchedulesPage,
  TaskDetailPage,
  WorkflowDefinitionsPage,
  WorkflowDetailPage,
  WorkflowsPage,
} from "@/pages/console-pages";

const rootRoute = createRootRoute({
  component: AppShell,
});

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: DashboardPage,
});

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/dashboard",
  component: DashboardPage,
});

const workflowDefinitionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workflow-definitions",
  component: WorkflowDefinitionsPage,
});

const workflowDefinitionNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workflow-definitions/new",
  component: NewWorkflowDefinitionPage,
});

const workflowDefinitionDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workflow-definitions/$workflowDefinitionId",
  component: () => {
    const { workflowDefinitionId } = workflowDefinitionDetailRoute.useParams();

    return <DefinitionDetailShell workflowDefinitionId={workflowDefinitionId} />;
  },
});

const workflowDefinitionOverviewRoute = createRoute({
  getParentRoute: () => workflowDefinitionDetailRoute,
  path: "/overview",
  component: () => {
    const { workflowDefinitionId } = workflowDefinitionDetailRoute.useParams();

    return <DefinitionOverviewPage workflowDefinitionId={workflowDefinitionId} />;
  },
});

const workflowDefinitionTasksRoute = createRoute({
  getParentRoute: () => workflowDefinitionDetailRoute,
  path: "/tasks",
  component: () => {
    const { workflowDefinitionId } = workflowDefinitionDetailRoute.useParams();

    return <DefinitionTasksPage workflowDefinitionId={workflowDefinitionId} />;
  },
});

const workflowDefinitionGraphRoute = createRoute({
  getParentRoute: () => workflowDefinitionDetailRoute,
  path: "/graph",
  component: () => {
    const { workflowDefinitionId } = workflowDefinitionDetailRoute.useParams();

    return <DefinitionGraphPage workflowDefinitionId={workflowDefinitionId} />;
  },
});

const workflowDefinitionLoopRoute = createRoute({
  getParentRoute: () => workflowDefinitionDetailRoute,
  path: "/loop",
  component: () => {
    const { workflowDefinitionId } = workflowDefinitionDetailRoute.useParams();

    return <DefinitionLoopPage workflowDefinitionId={workflowDefinitionId} />;
  },
});

const workflowDefinitionSchedulesRoute = createRoute({
  getParentRoute: () => workflowDefinitionDetailRoute,
  path: "/schedules",
  component: () => {
    const { workflowDefinitionId } = workflowDefinitionDetailRoute.useParams();

    return <DefinitionSchedulesPage workflowDefinitionId={workflowDefinitionId} />;
  },
});

const workflowDefinitionRunsRoute = createRoute({
  getParentRoute: () => workflowDefinitionDetailRoute,
  path: "/runs",
  component: () => {
    const { workflowDefinitionId } = workflowDefinitionDetailRoute.useParams();

    return <DefinitionRunsPage workflowDefinitionId={workflowDefinitionId} />;
  },
});

const agentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents",
  component: AgentsPage,
});

const agentNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents/new",
  component: () => <AgentEditorPage />,
});

const agentDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/agents/$agentId",
  component: () => {
    const { agentId } = agentDetailRoute.useParams();

    return <AgentEditorPage agentId={agentId} />;
  },
});

const schedulesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/schedules",
  component: SchedulesPage,
});

const scheduleNewRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/schedules/new",
  component: () => <ScheduleEditorPage />,
});

const scheduleDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/schedules/$scheduleId",
  component: () => {
    const { scheduleId } = scheduleDetailRoute.useParams();

    return <ScheduleEditorPage scheduleId={scheduleId} />;
  },
});

const workflowsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workflows",
  component: WorkflowsPage,
});

const workflowDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/workflows/$workflowId",
  component: () => {
    const { workflowId } = workflowDetailRoute.useParams();

    return <WorkflowDetailPage workflowId={workflowId} />;
  },
});

const taskDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks/$taskId",
  component: () => {
    const { taskId } = taskDetailRoute.useParams();

    return <TaskDetailPage taskId={taskId} />;
  },
});

const runDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/runs/$runId",
  component: () => {
    const { runId } = runDetailRoute.useParams();

    return <RunDetailPage runId={runId} />;
  },
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  dashboardRoute,
  workflowDefinitionsRoute,
  workflowDefinitionNewRoute,
  workflowDefinitionDetailRoute.addChildren([
    workflowDefinitionOverviewRoute,
    workflowDefinitionTasksRoute,
    workflowDefinitionGraphRoute,
    workflowDefinitionLoopRoute,
    workflowDefinitionSchedulesRoute,
    workflowDefinitionRunsRoute,
  ]),
  agentsRoute,
  agentNewRoute,
  agentDetailRoute,
  schedulesRoute,
  scheduleNewRoute,
  scheduleDetailRoute,
  workflowsRoute,
  workflowDetailRoute,
  taskDetailRoute,
  runDetailRoute,
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

export function AppRouterProvider(): JSX.Element {
  return <RouterProvider router={router} />;
}
