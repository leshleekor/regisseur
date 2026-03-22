import { cva, type VariantProps } from "class-variance-authority";
import type { HTMLAttributes, JSX, PropsWithChildren } from "react";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        accent: "border-transparent bg-[color:var(--accent)] text-white",
        success: "border-transparent bg-[color:var(--success)]/10 text-[color:var(--success)]",
        warning: "border-transparent bg-[color:var(--warning)]/12 text-[color:var(--warning)]",
        destructive: "border-transparent bg-[color:var(--danger)]/10 text-[color:var(--danger)]",
        info: "border-transparent bg-[color:var(--info)]/10 text-[color:var(--info)]",
        secondary: "border-[color:var(--border)] bg-slate-100 text-slate-700",
      },
    },
    defaultVariants: {
      variant: "secondary",
    },
  },
);

export interface BadgeProps
  extends HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({
  className,
  variant,
  children,
  ...props
}: PropsWithChildren<BadgeProps>): JSX.Element {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {children}
    </span>
  );
}
