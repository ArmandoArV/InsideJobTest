import { metric } from "@vercel/functions";
import { family, type ReasonSpec } from "./codes";

/* ===========================================================================
 * Where an error goes once it has been classified.
 *
 * Three destinations, each with a different job:
 *   - a metric, so a spike is visible as a shape rather than a feeling
 *   - a structured log line, so one request can be reconstructed
 *   - an alert line for anything the catalogue marks `alert`
 *
 * Metric tags stay low-cardinality on purpose: public code, reason family,
 * severity. The request id and the detail go to the log, never to a tag.
 * ======================================================================== */

export interface ErrorContext {
  requestId: string;
  route: string;
  /** Present only once authentication has succeeded. */
  agentId?: string;
}

export function report(spec: ReasonSpec, ctx: ErrorContext, detail?: string): void {
  metric("api.error", 1, {
    code: spec.publicCode,
    reason: family(spec),
    severity: spec.severity,
  });

  const line = {
    at: new Date().toISOString(),
    level: spec.severity === "alert" ? "error" : spec.severity === "warn" ? "warn" : "info",
    reason: spec.id,
    publicCode: spec.publicCode,
    security: spec.security,
    requestId: ctx.requestId,
    route: ctx.route,
    agentId: ctx.agentId,
    note: spec.note,
    detail,
  };

  if (spec.severity === "alert") {
    // Deliberately one line of JSON at error level: log drains and alert
    // rules key on `reason`, and a stack trace here would bury it.
    console.error(JSON.stringify({ alert: true, ...line }));
    metric("api.alert", 1, { reason: spec.id, code: spec.publicCode });
  } else if (spec.severity === "warn") {
    console.warn(JSON.stringify(line));
  } else {
    console.info(JSON.stringify(line));
  }
}

export function reportSuccess(route: string, status: number, startedAt: number): void {
  metric("api.request", 1, { route, outcome: "success" });
  metric("api.duration_ms", performance.now() - startedAt, { route, outcome: "success" });
  void status;
}

export function reportFailureDuration(route: string, startedAt: number): void {
  metric("api.request", 1, { route, outcome: "error" });
  metric("api.duration_ms", performance.now() - startedAt, { route, outcome: "error" });
}
