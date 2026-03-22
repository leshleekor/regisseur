import type { JSX, TextareaHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>): JSX.Element {
  return (
    <textarea
      className={cn(
        "flex min-h-28 w-full rounded-md border border-[color:var(--border)] bg-white/80 px-3 py-2 text-sm text-[color:var(--foreground)] outline-none transition-colors placeholder:text-[color:var(--muted)] focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/20 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
