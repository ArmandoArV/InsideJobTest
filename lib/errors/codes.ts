/* ============================================================================
 * Two layers of error vocabulary, and the separation is the point.
 *
 * PUBLIC codes are what a client sees. They are deliberately coarse: a code
 * granular enough to be helpful is granular enough to be an oracle. "This
 * offer is already accepted" tells an attacker the offer exists, who is in it,
 * and roughly when it moved — so the wire says `conflict` and nothing more.
 *
 * INTERNAL reasons are the opposite: as specific as we can make them. They go
 * to logs, metrics and alerts, never across the wire. A request id ties the
 * two together, so a legitimate agent can report "request abc failed" and we
 * can read exactly why without ever having told them.
 * ========================================================================== */

/** The complete set of codes that may cross the wire. */
export const PUBLIC_CODES = [
  "unauthorized",
  "not_found",
  "invalid",
  "conflict",
  "rate_limited",
  "idempotency_conflict",
  "internal",
] as const;
export type PublicCode = (typeof PUBLIC_CODES)[number];

export const HTTP_STATUS: Record<PublicCode, number> = {
  unauthorized: 401,
  not_found: 404,
  invalid: 422,
  conflict: 409,
  rate_limited: 429,
  idempotency_conflict: 409,
  internal: 500,
};

/** Client-facing text. Says what to do, never what went wrong internally. */
export const PUBLIC_MESSAGE: Record<PublicCode, string> = {
  unauthorized: "Authentication required.",
  not_found: "No such resource.",
  invalid: "The request did not validate.",
  conflict: "The resource changed before this request was applied.",
  rate_limited: "Too many requests. Retry after the window resets.",
  idempotency_conflict: "This idempotency key was used with a different request.",
  internal: "The request could not be completed.",
};

/**
 * `info`  — ordinary, expected. An agent got something wrong.
 * `warn`  — worth watching in aggregate. A spike means something changed.
 * `alert` — should page someone. Either we are broken, or someone is probing
 *           a boundary that should never move.
 */
export type Severity = "info" | "warn" | "alert";

export interface ReasonSpec {
  /** Stable identifier, safe to put in a runbook. Never sent to a client. */
  id: string;
  /** What the client is told instead. */
  publicCode: PublicCode;
  severity: Severity;
  /** True when a spike is evidence of probing rather than of a bug. */
  security: boolean;
  /** One line for the person reading the alert at 3am. */
  note: string;
}

const R = (
  id: string, publicCode: PublicCode, severity: Severity, security: boolean, note: string,
): ReasonSpec => ({ id, publicCode, severity, security, note });

/* -- AB-1xxx authentication ------------------------------------------------ */
export const REASONS = {
  MISSING_CREDENTIAL:   R("AB-1001", "unauthorized", "info",  false, "No bearer token presented."),
  MALFORMED_TOKEN:      R("AB-1002", "unauthorized", "info",  true,  "Token was not prefix.secret."),
  UNKNOWN_PREFIX:       R("AB-1003", "unauthorized", "warn",  true,  "No credential with that prefix. A spike means key guessing."),
  BAD_SECRET:           R("AB-1004", "unauthorized", "alert", true,  "Real prefix, wrong secret. Someone holds a partial credential."),
  REVOKED_CREDENTIAL:   R("AB-1005", "unauthorized", "warn",  true,  "Revoked key still in use."),
  SUSPENDED_AGENT:      R("AB-1006", "unauthorized", "info",  false, "Agent is suspended."),

  /* -- AB-2xxx authorization ---------------------------------------------- */
  RESOURCE_UNKNOWN:     R("AB-2000", "not_found",    "info",  false, "Id did not resolve to a row."),
  NOT_COUNTERPARTY:     R("AB-2001", "not_found",    "warn",  true,  "Acted on a trade the actor is not party to."),
  NOT_LISTING_SELLER:   R("AB-2002", "not_found",    "warn",  true,  "Acted on a listing the actor does not own."),
  NOT_OFFER_PARTY:      R("AB-2003", "not_found",    "warn",  true,  "Read an offer the actor is not party to."),
  ROLE_NOT_PERMITTED:   R("AB-2004", "conflict",     "alert", true,  "Right trade, wrong role. A seller trying to release escrow lands here."),
  OWNER_SECRET_UNKNOWN: R("AB-2005", "not_found",    "warn",  true,  "Tried to join an owner with a bad secret."),

  /* -- AB-3xxx lifecycle --------------------------------------------------- */
  OFFER_NOT_OPEN:       R("AB-3001", "conflict",     "info",  false, "Offer already accepted, countered or withdrawn."),
  OFFER_EXPIRED:        R("AB-3002", "conflict",     "info",  false, "Offer passed its TTL."),
  LISTING_NOT_ACTIVE:   R("AB-3003", "conflict",     "info",  false, "Listing is reserved, sold or withdrawn. Used where the actor is already a party."),
  LISTING_UNAVAILABLE:  R("AB-3008", "not_found",    "info",  false, "Listing not open to this actor. Reads as absent so it cannot confirm existence."),
  TRANSITION_FORBIDDEN: R("AB-3004", "conflict",     "info",  false, "No transition for (state, event, role)."),
  CAS_LOST:             R("AB-3005", "conflict",     "warn",  false, "Compare-and-swap lost a race. Expected occasionally; a spike means contention."),
  TRADE_NOT_SETTLED:    R("AB-3006", "conflict",     "info",  false, "Rating attempted before settlement."),
  ALREADY_RATED:        R("AB-3007", "conflict",     "info",  false, "One rating per side, enforced by a unique index."),

  /* -- AB-4xxx input ------------------------------------------------------- */
  BODY_NOT_JSON:        R("AB-4001", "invalid",      "info",  false, "Body was not parseable JSON."),
  BODY_TOO_LARGE:       R("AB-4002", "invalid",      "warn",  true,  "Body over the size cap."),
  SCHEMA_VIOLATION:     R("AB-4003", "invalid",      "info",  false, "Failed Zod validation."),
  UNKNOWN_FIELD:        R("AB-4004", "invalid",      "alert", true,  "Strict schema rejected an extra field. Often a mass-assignment probe."),
  MALFORMED_ID:         R("AB-4005", "not_found",    "info",  true,  "Path id was not a UUID."),
  MISSING_IDEMPOTENCY:  R("AB-4006", "invalid",      "info",  false, "Mutating call without an Idempotency-Key."),
  SELF_DEALING_BID:     R("AB-4007", "invalid",      "info",  false, "Agent bid on its own listing."),

  /* -- AB-5xxx limits ------------------------------------------------------ */
  RATE_LIMITED:         R("AB-5001", "rate_limited", "warn",  true,  "Token bucket exhausted for this principal."),
  SPEND_CAP_EXCEEDED:   R("AB-5002", "invalid",      "warn",  true,  "Funding above the agent's per-window cap."),
  NEGOTIATION_DEPTH:    R("AB-5003", "invalid",      "info",  false, "Round limit reached on this listing pair."),

  /* -- AB-6xxx idempotency ------------------------------------------------- */
  IDEMPOTENCY_MISMATCH: R("AB-6001", "idempotency_conflict", "warn", true, "Same key, different endpoint."),

  /* -- AB-7xxx ledger ------------------------------------------------------ */
  INSUFFICIENT_FUNDS:   R("AB-7001", "conflict",     "info",  false, "Available balance too low."),
  LEDGER_CONSTRAINT:    R("AB-7002", "internal",     "alert", false, "A ledger invariant refused the write. The database caught what code did not."),

  /* -- AB-9xxx system ------------------------------------------------------ */
  UNHANDLED:            R("AB-9001", "internal",     "alert", false, "Unclassified failure. Every occurrence is a gap in this table."),
  DATABASE_UNAVAILABLE: R("AB-9002", "internal",     "alert", false, "Could not reach PostgreSQL."),
} as const;

export type ReasonKey = keyof typeof REASONS;

/** Family prefix, for low-cardinality metric tags. AB-2001 → AB-2xxx */
export function family(spec: ReasonSpec): string {
  return `${spec.id.slice(0, 4)}xxx`;
}
