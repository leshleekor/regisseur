import type { FastifyInstance } from "fastify";

import { HttpError, conflict, internalServerError } from "./http-error.js";
import { isPgIntegrityError } from "./pg-error.js";
import { createErrorResponse } from "../utils/response.js";

function isFastifyBadRequest(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }

  return (error as { statusCode?: unknown }).statusCode === 400;
}

export function mapErrorToHttpError(error: unknown): HttpError {
  if (error instanceof HttpError) {
    return error;
  }

  if (isFastifyBadRequest(error)) {
    return new HttpError(400, "BAD_REQUEST", "Invalid request");
  }

  if (isPgIntegrityError(error)) {
    return conflict("CONFLICT", "Request conflicts with existing data");
  }

  return internalServerError();
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setErrorHandler((error, request, reply) => {
    const httpError = mapErrorToHttpError(error);

    request.log.error(
      {
        err: error,
        code: httpError.code,
        statusCode: httpError.statusCode,
      },
      "request failed",
    );

    reply
      .status(httpError.statusCode)
      .send(createErrorResponse(httpError.code, httpError.message));
  });
}
