import type { HTMLAttributes, JSX } from "react";

import { cn } from "@/lib/utils";

export function Card({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>): JSX.Element {
  return (
    <div
      className={cn(
        "rounded-md border border-[color:var(--border)] bg-[color:var(--card)] shadow-panel",
        className,
      )}
      {...props}
    />
  );
}
