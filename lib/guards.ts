import type { PoolClient } from "pg";
import { ApiError } from "./errors";

/** Per-principal token bucket. Limits are per agent, never per IP: the
 *  principal is the thing we can actually hold accountable. */
export const LIMITS: Record<string, { perWindow: number; windowSec: number }> = {
  read:     { perWindow: 240, windowSec: 60 },
  write:    { perWindow: 60,  windowSec: 60 },
  offer:    { perWindow: 120, windowSec: 3600 },
  register: { perWindow: 5,   windowSec: 3600 },
  withdraw: { perWindow: 200, windowSec: 60 },
};

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
  if (Number(rows[0].count) > perWindow) throw new ApiError("rate_limited");
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
    if (existing.rows[0].endpoint !== endpoint) throw new ApiError("idempotency_conflict");
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
    throw new ApiError("invalid", "An Idempotency-Key header of 8–128 characters is required.");
  }
  return key;
}
