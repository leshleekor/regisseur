import type { JSX, ReactNode } from "react";

import { cn } from "@/lib/utils";

import { Badge as ShadcnBadge } from "./badge";
import { Button as ShadcnButton } from "./button";
import { Card as ShadcnCard } from "./card";
import { Input as ShadcnInput } from "./input";
import { Label as ShadcnLabel } from "./label";
import { Select as ShadcnSelect } from "./select";
import { Textarea as ShadcnTextarea } from "./textarea";

export const Button = ShadcnButton;
export const Input = ShadcnInput;
export const Card = ShadcnCard;
export const Label = ShadcnLabel;
export const Select = ShadcnSelect;
export const Textarea = ShadcnTextarea;

export function Badge({
  tone = "muted",
  className,
  children,
}: {
  tone?: "accent" | "success" | "warning" | "danger" | "info" | "muted";
  className?: string;
  children: ReactNode;
}): JSX.Element {
  const variant = {
    accent: "accent",
    success: "success",
    warning: "warning",
    danger: "destructive",
    info: "info",
    muted: "secondary",
  }[tone] as "accent" | "success" | "warning" | "destructive" | "info" | "secondary";

  return (
    <ShadcnBadge className={className} variant={variant}>
      {children}
    </ShadcnBadge>
  );
}

export function SectionHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}): JSX.Element {
  return (
    <div className="flex flex-col gap-3 border-b border-[color:var(--border)]/80 pb-4 md:flex-row md:items-end md:justify-between">
      <div className="space-y-1">
        <h2 className="font-sans text-2xl font-bold tracking-tight text-[color:var(--foreground)]">
          {title}
        </h2>
        {description ? <p className="max-w-3xl text-sm text-[color:var(--muted)]">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  tone = "accent",
}: {
  label: string;
  value: string;
  tone?: "accent" | "success" | "warning" | "danger" | "info" | "muted";
}): JSX.Element {
  const barClass = {
    accent: "bg-[color:var(--accent)]",
    success: "bg-[color:var(--success)]",
    warning: "bg-[color:var(--warning)]",
    danger: "bg-[color:var(--danger)]",
    info: "bg-[color:var(--info)]",
    muted: "bg-slate-300",
  }[tone];

  return (
    <Card className="relative overflow-hidden p-5">
      <div className={cn("absolute inset-x-0 top-0 h-1", barClass)} />
      <div className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--muted)]">
        {label}
      </div>
      <div className="mt-3 font-sans text-3xl font-bold">{value}</div>
    </Card>
  );
}

export function EmptyState({
  title,
  description,
}: {
  title: string;
  description: string;
}): JSX.Element {
  return (
    <Card className="border-dashed p-8 text-center">
      <h3 className="font-sans text-xl font-bold">{title}</h3>
      <p className="mt-2 text-sm text-[color:var(--muted)]">{description}</p>
    </Card>
  );
}

export function ErrorState({ message }: { message: string }): JSX.Element {
  return (
    <Card className="border-[color:var(--danger)]/20 bg-red-50 p-4 text-sm text-[color:var(--danger)]">
      {message}
    </Card>
  );
}

export function SkeletonBlock({ className }: { className?: string }): JSX.Element {
  return <div className={cn("animate-pulse rounded-md bg-stone-200/80", className)} />;
}
