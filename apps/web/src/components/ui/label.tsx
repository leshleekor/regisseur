import type { HTMLAttributes, JSX } from "react";

import { cn } from "@/lib/utils";

export function Label({
  className,
  ...props
}: HTMLAttributes<HTMLLabelElement>): JSX.Element {
  return (
    <label
      className={cn(
        "text-sm font-medium leading-none text-[color:var(--foreground)]",
        className,
      )}
      {...props}
    />
  );
}
