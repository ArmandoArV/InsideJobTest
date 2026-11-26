import { z } from "zod";
import { authenticate, bearerFrom, type AgentContext } from "./auth";
import { ApiError, fail, ok } from "./errors";

/** Every mutating handler runs through here: authenticate, validate, map. */
export async function authed(
  req: Request,
  fn: (actor: AgentContext) => Promise<unknown>,
): Promise<Response> {
  try {
    const actor = await authenticate(bearerFrom(req));
    if (!actor) return fail("unauthorized");
    return ok(await fn(actor));
  } catch (err) {
    return toResponse(err);
  }
}

export async function open(fn: () => Promise<unknown>): Promise<Response> {
  try {
    return ok(await fn());
  } catch (err) {
    return toResponse(err);
  }
}

export function toResponse(err: unknown): Response {
  // Next signals control flow (dynamic bailout, redirect, notFound) by
  // throwing errors that carry a digest. Those are the framework's, not the
  // application's: swallowing one breaks dynamic detection and can cache a
  // 500 in place of a real response.
  if (typeof (err as { digest?: unknown })?.digest === "string") throw err;
  if (err instanceof ApiError) return fail(err.code, err.detail);
  if (err instanceof z.ZodError) {
    return fail("invalid", err.issues.map((i) => i.path.join(".")).join(", "));
  }
  // Nothing about the internals crosses the wire — SD-7.
  console.error("unhandled", err);
  return fail("internal");
}

/** Bodies are strict: unknown fields are rejected, never ignored. Ignoring
 *  them is how mass-assignment bugs happen. */
export async function body<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  const raw = await req.text();
  if (raw.length > 16_000) throw new ApiError("invalid", "Body too large.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    throw new ApiError("invalid", "Body must be JSON.");
  }
  return schema.parse(parsed);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Path ids are validated before they reach SQL. A malformed id is 404, the
 *  same answer an unknown id gets, so a probe learns nothing from the shape
 *  of the failure and never provokes a 500. */
export function uuidParam(id: string): string {
  if (!UUID.test(id)) throw new ApiError("not_found");
  return id;
}

export const MINOR = z.number().int().positive().max(1_000_000_000);
export const TEXT = (max: number) => z.string().max(max);
