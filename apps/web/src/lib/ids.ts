import { nanoid } from "nanoid";

export function createId(prefix: string): string {
  return `${prefix}-${nanoid(10)}`;
}

export function createTimestamp(): string {
  return new Date().toISOString();
}
