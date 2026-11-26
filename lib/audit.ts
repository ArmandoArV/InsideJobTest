import { createHash } from "node:crypto";
import type { PoolClient } from "pg";

/**
 * Append one consequential action to the hash-chained audit log.
 *
 * Only the payload digest is supplied; prev_hash and hash are computed by a
 * database trigger, so the application cannot forge a link. Verified by
 * verify_audit_chain().
 */
export async function audit(
  c: PoolClient,
  entry: {
    actor: string | null;
    action: string;
    target?: string | null;
    payload?: unknown;
  },
): Promise<void> {
  const digest = createHash("sha256")
    .update(JSON.stringify(entry.payload ?? {}))
    .digest("hex");
  await c.query(
    `insert into audit_event(actor_agent_id, action, target, payload_digest, prev_hash, hash)
     values ($1, $2, $3, $4, '', '')`,
    [entry.actor, entry.action, entry.target ?? null, digest],
  );
}
