/**
 * Uniform error envelope. Codes come from a fixed enum and messages never
 * include SQL, stack traces, row counts, or whether a thing existed —
 * SPEC.md SD-7. An invisible object is 404, never 403: a 403 confirms it.
 */
export const ERROR_CODES = [
  "unauthorized",
  "not_found",
  "invalid",
  "conflict",
  "rate_limited",
  "idempotency_conflict",
  "internal",
] as const;
export type ErrorCode = (typeof ERROR_CODES)[number];

const STATUS: Record<ErrorCode, number> = {
  unauthorized: 401,
  not_found: 404,
  invalid: 422,
  conflict: 409,
  rate_limited: 429,
  idempotency_conflict: 409,
  internal: 500,
};

const MESSAGE: Record<ErrorCode, string> = {
  unauthorized: "Authentication required.",
  not_found: "No such resource.",
  invalid: "The request did not validate.",
  conflict: "The resource changed before this request was applied.",
  rate_limited: "Too many requests.",
  idempotency_conflict: "This idempotency key was used with a different request.",
  internal: "The request could not be completed.",
};

export class ApiError extends Error {
  constructor(readonly code: ErrorCode, readonly detail?: string) {
    super(code);
  }
}

export function fail(code: ErrorCode, detail?: string): Response {
  return Response.json(
    { error: { code, message: MESSAGE[code], ...(detail ? { detail } : {}) } },
    { status: STATUS[code] },
  );
}

export function ok(body: unknown, status = 200): Response {
  return Response.json(body, { status });
}
