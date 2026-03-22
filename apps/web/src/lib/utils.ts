import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatDateTime(value?: string | null): string {
  if (!value) {
    return "—";
  }

  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

export function formatRelativeListCount(count: number, singular: string): string {
  return `${count.toLocaleString()} ${singular}${count === 1 ? "" : "s"}`;
}

export function copyText(value: string): Promise<void> {
  if (navigator.clipboard) {
    return navigator.clipboard.writeText(value);
  }

  return Promise.reject(new Error("Clipboard API unavailable"));
}

export function sortByUpdatedAtDescending<T extends { updatedAt?: string; createdAt?: string }>(
  values: readonly T[],
): T[] {
  return [...values].sort((left, right) => {
    const leftValue = left.updatedAt ?? left.createdAt ?? "";
    const rightValue = right.updatedAt ?? right.createdAt ?? "";

    return rightValue.localeCompare(leftValue);
  });
}

export function asPrettyJson(value: unknown): string {
  return JSON.stringify(value, null, 2);
}
