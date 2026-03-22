import { Link, Outlet, useRouterState } from "@tanstack/react-router";
import { LayoutDashboard, Network, Orbit, PlaySquare, Repeat2, Workflow } from "lucide-react";
import type { JSX } from "react";

import { cn } from "@/lib/utils";

const navItems = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: LayoutDashboard,
  },
  {
    to: "/workflow-definitions",
    label: "Definitions",
    icon: Workflow,
  },
  {
    to: "/workflows",
    label: "Workflows",
    icon: PlaySquare,
  },
  {
    to: "/schedules",
    label: "Schedules",
    icon: Repeat2,
  },
  {
    to: "/agents",
    label: "Agents",
    icon: Orbit,
  },
] as const;

export function AppShell(): JSX.Element {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });

  return (
    <div className="min-h-screen bg-[color:var(--background)] px-4 py-4 md:px-6">
      <div className="mx-auto grid min-h-[calc(100vh-2rem)] max-w-[1500px] gap-4 lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="rounded-md border border-[color:var(--border)] bg-white p-5 text-[color:var(--foreground)] shadow-panel">
          <div className="flex items-center gap-3 border-b border-[color:var(--border)] pb-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-md bg-[color:var(--accent)] text-white">
              <Network className="h-6 w-6" />
            </div>
            <div>
              <div className="font-sans text-2xl font-bold leading-none">
                Regisseur
              </div>
              <div className="mt-1 text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">
                Operations Console
              </div>
            </div>
          </div>

          <nav className="mt-6 space-y-2">
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = pathname.startsWith(item.to);

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex items-center gap-3 rounded-md border border-transparent px-4 py-3 text-sm font-medium transition-colors",
                    active
                      ? "bg-[color:var(--accent)] text-white"
                      : "text-[color:var(--muted)] hover:bg-slate-100 hover:text-[color:var(--foreground)]",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>

          <div className="mt-8 rounded-md border border-[color:var(--border)] bg-slate-50 p-4">
            <div className="text-xs uppercase tracking-[0.2em] text-[color:var(--muted)]">Operating Mode</div>
            <div className="mt-2 font-sans text-xl font-bold">Authoring + Runtime</div>
            <p className="mt-2 text-sm leading-6 text-[color:var(--muted)]">
              Definitions and live workflows are separated, but reachable from one console.
            </p>
          </div>
        </aside>

        <main className="overflow-hidden rounded-md border border-[color:var(--border)] bg-white shadow-panel">
          <div className="border-b border-[color:var(--border)] px-6 py-4">
            <div className="font-sans text-3xl font-bold tracking-tight">
              {pathname === "/dashboard" ? "System Pulse" : "Control Surface"}
            </div>
            <div className="mt-1 text-sm text-[color:var(--muted)]">
              Workflow authoring, monitoring, and operator controls in one place.
            </div>
          </div>
          <div className="space-y-8 px-6 py-6">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
