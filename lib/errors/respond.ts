import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HTTP_STATUS, PUBLIC_MESSAGE, REASONS, type PublicCode } from "./codes";
import { AppError, isAppError } from "./AppError";
import { report, type ErrorContext } from "./report";

/**
 * The wire format. Three fields, and `requestId` is the only one that varies
 * with what actually happened — it is an opaque handle, not a hint.
 *
 * A legitimate agent that hits a problem can quote its request id; we can then
 * read the exact internal reason from the logs without ever having disclosed
 * it over the wire.
 */
export interface ErrorEnvelope {
  error: { code: PublicCode; message: string; requestId: string };
}

export function newRequestId(): string {
  return randomUUID();
}

export function errorResponse(err: unknown, ctx: ErrorContext): Response {
  // Next signals control flow (dynamic bailout, redirect, notFound) with
  // errors carrying a digest. Those belong to the framework, not to us.
  if (typeof (err as { digest?: unknown })?.digest === "string") throw err;

  const appError = classify(err);
  report(appError.spec, ctx, appError.internalDetail);

  const body: ErrorEnvelope = {
    error: {
      code: appError.spec.publicCode,
      message: PUBLIC_MESSAGE[appError.spec.publicCode],
      requestId: ctx.requestId,
    },
  };
  return Response.json(body, {
    status: HTTP_STATUS[appError.spec.publicCode],
    headers: { "x-request-id": ctx.requestId },
  });
}

/** Everything becomes a classified AppError, or AB-9001 by definition. */
function classify(err: unknown): AppError {
  if (isAppError(err)) return err;

  if (err instanceof z.ZodError) {
    const unknownField = err.issues.some((i) => i.code === "unrecognized_keys");
    return new AppError(
      unknownField ? "UNKNOWN_FIELD" : "SCHEMA_VIOLATION",
      err.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.code}`).join("; "),
    );
  }

  const pg = err as { code?: string; message?: string };
  if (typeof pg?.code === "string") {
    // 23xxx is the integrity-constraint class: the database refusing a write
    // the application should not have attempted.
    if (pg.code === "23505") return new AppError("ALREADY_RATED", pg.message);
    if (pg.code.startsWith("23")) return new AppError("LEDGER_CONSTRAINT", pg.message);
    if (pg.code.startsWith("08") || pg.code === "57P01") {
      return new AppError("DATABASE_UNAVAILABLE", pg.message);
    }
  }

  return new AppError(
    "UNHANDLED",
    err instanceof Error ? `${err.name}: ${err.message}` : String(err),
  );
}

export { REASONS };
