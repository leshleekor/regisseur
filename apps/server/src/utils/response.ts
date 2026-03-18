export function createErrorResponse(code: string, message: string) {
  return {
    error: {
      code,
      message,
    },
  };
}
