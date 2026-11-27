import type { PoolClient } from "pg";
import { fail } from "./errors/AppError";

/** Per-principal token bucket. Limits are per agent, never per IP: the
 *  principal is the thing we can actually hold accountable. */
export const LIMITS: Record<string, { perWindow: number; windowSec: number }> = {
  read:     { perWindow: 240, windowSec: 60 },
  write:    { perWindow: 60,  windowSec: 60 },
  offer:    { perWindow: 120, windowSec: 3600 },
  withdraw: { perWindow: 200, windowSec: 60 },
};

/* Limits for calls with no principal. Registration creates the principal, so
   it cannot be keyed on one; it is keyed on the client address instead, with a
   global ceiling underneath so a distributed attempt is still bounded.

   The per-address figure is deliberately loose: the simulation registers 24
   agents and the adversarial suite several more, all from one address, and a
   limit that breaks our own verification would get removed rather than tuned.
   Both are env-tunable so an evaluation can tighten them without a deploy. */
export const PUBLIC_LIMITS: Record<string, { perWindow: number; windowSec: number }> = {
  register_ip: {
    perWindow: Number(process.env.REGISTER_PER_IP_HOUR ?? 100),
    windowSec: 3600,
  },
  register_global: {
    perWindow: Number(process.env.REGISTER_PER_HOUR ?? 1000),
    windowSec: 3600,
  },
};

/** The address Vercel's edge attaches. Spoofable only upstream of the edge,
 *  which is why it is paired with a global ceiling rather than trusted alone. */
export function clientAddress(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim().slice(0, 64);
  return req.headers.get("x-real-ip")?.slice(0, 64) ?? "unknown";
}

export async function rateLimitPublic(
  c: PoolClient,
  subject: string,
  bucket: keyof typeof PUBLIC_LIMITS,
): Promise<void> {
  const { perWindow, windowSec } = PUBLIC_LIMITS[bucket];
  const { rows } = await c.query(
    `insert into public_bucket(subject, bucket, window_start, count)
     values ($1, $2, to_timestamp(floor(extract(epoch from now()) / $3) * $3), 1)
     on conflict (subject, bucket, window_start)
       do update set count = public_bucket.count + 1
     returning count`,
    [subject, bucket, windowSec],
  );
  if (Number(rows[0].count) > perWindow) fail("RATE_LIMITED", `${bucket} for ${subject}`);
}

export async function rateLimit(
  c: PoolClient,
  agentId: string,
  bucket: keyof typeof LIMITS,
): Promise<void> {
  const { perWindow, windowSec } = LIMITS[bucket];
  const { rows } = await c.query(
    `insert into rate_bucket(agent_id, bucket, window_start, count)
     values ($1, $2, to_timestamp(floor(extract(epoch from now()) / $3) * $3), 1)
     on conflict (agent_id, bucket, window_start)
       do update set count = rate_bucket.count + 1
     returning count`,
    [agentId, bucket, windowSec],
  );
  if (Number(rows[0].count) > perWindow) fail("RATE_LIMITED", `${bucket} bucket`);
}

/**
 * Idempotency. Every mutating endpoint requires a key; a replay returns the
 * first response rather than performing the action twice. The same key with a
 * different endpoint is a conflict, not a silent overwrite.
 */
export async function replayOrRecord<T>(
  c: PoolClient,
  agentId: string,
  key: string,
  endpoint: string,
  run: () => Promise<T>,
): Promise<T> {
  const existing = await c.query(
    `select endpoint, response from idempotency where agent_id = $1 and key = $2`,
    [agentId, key],
  );
  if (existing.rows[0]) {
    if (existing.rows[0].endpoint !== endpoint) {
      fail("IDEMPOTENCY_MISMATCH", `${existing.rows[0].endpoint} vs ${endpoint}`);
    }
    return existing.rows[0].response as T;
  }
  const result = await run();
  await c.query(
    `insert into idempotency(agent_id, key, endpoint, response)
     values ($1, $2, $3, $4)
     on conflict (agent_id, key) do nothing`,
    [agentId, key, endpoint, JSON.stringify(result)],
  );
  return result;
}

export function requireIdempotencyKey(req: Request): string {
  const key = req.headers.get("idempotency-key");
  if (!key || key.length < 8 || key.length > 128) {
    fail("MISSING_IDEMPOTENCY");
  }
  return key;
}
