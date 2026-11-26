import { z } from "zod";
import { authenticate, bearerFrom, type AgentContext } from "./auth";
import { AppError, fail } from "./errors/AppError";
import { errorResponse, newRequestId } from "./errors/respond";
import { reportSuccess, reportFailureDuration, type ErrorContext } from "./errors/report";

/** Normalised route name for metric tags. Ids become `:id` so cardinality
 *  stays bounded no matter how many trades exist. */
function routeName(req: Request): string {
  try {
    return new URL(req.url).pathname
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "/:id")
      .replace(/\/agt_[0-9A-HJKMNP-TV-Z]{10}/g, "/:agent");
  } catch {
    return "unknown";
  }
}

/** Every authenticated handler runs through here: identify, time, classify. */
export async function authed(
  req: Request,
  fn: (actor: AgentContext) => Promise<unknown>,
): Promise<Response> {
  const started = performance.now();
  const ctx: ErrorContext = { requestId: newRequestId(), route: routeName(req) };
  try {
    const auth = await authenticate(bearerFrom(req));
    if (!auth.ok) throw new AppError(auth.reason);
    ctx.agentId = auth.actor.agentId;

    const body = await fn(auth.actor);
    reportSuccess(ctx.route, 200, started);
    return Response.json(body, { headers: { "x-request-id": ctx.requestId } });
  } catch (err) {
    reportFailureDuration(ctx.route, started);
    return errorResponse(err, ctx);
  }
}

/** Unauthenticated handler. Same classification, no principal. */
export async function open(
  req: Request | null,
  fn: () => Promise<unknown>,
): Promise<Response> {
  const started = performance.now();
  const ctx: ErrorContext = {
    requestId: newRequestId(),
    route: req ? routeName(req) : "unknown",
  };
  try {
    const body = await fn();
    reportSuccess(ctx.route, 200, started);
    return Response.json(body, { headers: { "x-request-id": ctx.requestId } });
  } catch (err) {
    reportFailureDuration(ctx.route, started);
    return errorResponse(err, ctx);
  }
}

/** Bodies are strict: unknown fields fail the request rather than being
 *  ignored, because ignoring them is how mass-assignment bugs happen. */
export async function body<S extends z.ZodTypeAny>(req: Request, schema: S): Promise<z.infer<S>> {
  const raw = await req.text();
  if (raw.length > 16_000) fail("BODY_TOO_LARGE", `${raw.length} bytes`);
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw || "{}");
  } catch {
    fail("BODY_NOT_JSON");
  }
  return schema.parse(parsed);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A malformed id is "no such resource", the same answer an unknown id gets,
 *  so a probe learns nothing from the shape of the failure. */
export function uuidParam(id: string): string {
  if (!UUID.test(id)) fail("MALFORMED_ID", id.slice(0, 64));
  return id;
}

export const MINOR = z.number().int().positive().max(1_000_000_000);
export const TEXT = (max: number) => z.string().max(max);
