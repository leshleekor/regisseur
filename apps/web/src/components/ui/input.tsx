import type { InputHTMLAttributes, JSX } from "react";

import { cn } from "@/lib/utils";

export function Input({
  className,
  ...props
}: InputHTMLAttributes<HTMLInputElement>): JSX.Element {
  return (
    <input
      className={cn(
        "flex h-10 w-full rounded-md border border-[color:var(--border)] bg-white/80 px-3 py-2 text-sm text-[color:var(--foreground)] outline-none transition-colors placeholder:text-[color:var(--muted)] focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]/20 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
