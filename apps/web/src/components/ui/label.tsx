import type { HTMLAttributes, JSX } from "react";

import { cn } from "@/lib/utils";

export function Label({
  className,
  ...props
}: HTMLAttributes<HTMLLabelElement>): JSX.Element {
  return (
    <label
      className={cn(
        "text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--muted)]",
        className,
      )}
      {...props}
    />
  );
}
