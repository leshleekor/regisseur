import { badRequest } from "../errors/http-error.js";

export type UnknownRecord = Record<string, unknown>;

export function isPlainObject(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function expectRecord(value: unknown, fieldName: string): UnknownRecord {
  if (!isPlainObject(value)) {
    throw badRequest(`${fieldName} must be an object`);
  }

  return value;
}

export function expectString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.length === 0) {
    throw badRequest(`${fieldName} must be a non-empty string`);
  }

  return value;
}

export function expectOptionalString(
  value: unknown,
  fieldName: string,
): string | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectString(value, fieldName);
}

export function expectBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== "boolean") {
    throw badRequest(`${fieldName} must be a boolean`);
  }

  return value;
}

export function expectObject(
  value: unknown,
  fieldName: string,
): Record<string, unknown> {
  if (!isPlainObject(value)) {
    throw badRequest(`${fieldName} must be an object`);
  }

  return value;
}

export function expectOptionalObject(
  value: unknown,
  fieldName: string,
): Record<string, unknown> | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectObject(value, fieldName);
}

export function expectStringArray(value: unknown, fieldName: string): string[] {
  if (
    !Array.isArray(value) ||
    value.some((entry) => typeof entry !== "string")
  ) {
    throw badRequest(`${fieldName} must be an array of strings`);
  }

  return [...value];
}

export function expectEnumValue<const TValues extends readonly string[]>(
  value: unknown,
  allowedValues: TValues,
  fieldName: string,
): TValues[number] {
  if (typeof value !== "string" || !allowedValues.includes(value)) {
    throw badRequest(
      `${fieldName} must be one of: ${allowedValues.join(", ")}`,
    );
  }

  return value;
}

export function expectTrueQueryFlag(
  value: unknown,
  fieldName: string,
): true | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (value !== "true") {
    throw badRequest(`${fieldName}=true is the only supported value`);
  }

  return true;
}
