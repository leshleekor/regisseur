export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

export function badRequest(message: string): HttpError {
  return new HttpError(400, "BAD_REQUEST", message);
}

export function notFound(message: string): HttpError {
  return new HttpError(404, "NOT_FOUND", message);
}

export function conflict(code: string, message: string): HttpError {
  return new HttpError(409, code, message);
}

export function badGateway(code: string, message: string): HttpError {
  return new HttpError(502, code, message);
}

export function internalServerError(): HttpError {
  return new HttpError(500, "INTERNAL_SERVER_ERROR", "Internal server error");
}
