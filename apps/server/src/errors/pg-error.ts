const PG_INTEGRITY_ERROR_CODES = new Set(["23503", "23505", "23514"]);

interface PgErrorLike {
  code?: unknown;
}

export function isPgIntegrityError(error: unknown): error is PgErrorLike {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  return PG_INTEGRITY_ERROR_CODES.has((error as PgErrorLike).code as string);
}
