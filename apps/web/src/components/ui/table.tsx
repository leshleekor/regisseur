import type { HTMLAttributes, JSX, TableHTMLAttributes, ThHTMLAttributes, TdHTMLAttributes } from "react";

import { cn } from "@/lib/utils";

export function Table({
  className,
  ...props
}: TableHTMLAttributes<HTMLTableElement>): JSX.Element {
  return (
    <div className="relative w-full overflow-auto">
      <table className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

export function TableHeader({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>): JSX.Element {
  return <thead className={cn("[&_tr]:border-b", className)} {...props} />;
}

export function TableBody({
  className,
  ...props
}: HTMLAttributes<HTMLTableSectionElement>): JSX.Element {
  return <tbody className={cn("[&_tr:last-child]:border-0", className)} {...props} />;
}

export function TableRow({
  className,
  ...props
}: HTMLAttributes<HTMLTableRowElement>): JSX.Element {
  return (
    <tr
      className={cn(
        "border-b border-[color:var(--border)] transition-colors hover:bg-slate-50/80",
        className,
      )}
      {...props}
    />
  );
}

export function TableHead({
  className,
  ...props
}: ThHTMLAttributes<HTMLTableCellElement>): JSX.Element {
  return (
    <th
      className={cn(
        "h-11 px-4 text-left align-middle text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--muted)]",
        className,
      )}
      {...props}
    />
  );
}

export function TableCell({
  className,
  ...props
}: TdHTMLAttributes<HTMLTableCellElement>): JSX.Element {
  return <td className={cn("p-4 align-middle", className)} {...props} />;
}
