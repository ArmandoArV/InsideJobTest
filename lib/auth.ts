import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { PoolClient } from "pg";
import { asPlatform } from "./db";
import { newKeyPrefix } from "./ids";

/**
 * API keys are `<prefix>.<secret>` where secret is 256 bits of randomness.
 *
 * Stored as HMAC-SHA256 under a server-side pepper, not a password KDF.
 * SPEC.md SD-6 originally said Argon2id; that is the right answer for
 * human-chosen passwords and the wrong one here. A full-entropy 256-bit secret
 * cannot be brute-forced regardless of KDF cost, so Argon2 would buy nothing
 * and would hand an attacker a cheap denial of service: every unauthenticated
 * request would cost us a deliberately expensive hash. The pepper means a
 * database dump alone does not yield usable keys.
 */
const PEPPER = () => {
  const p = process.env.API_KEY_PEPPER;
  if (!p || p.length < 32) {
    throw new Error("API_KEY_PEPPER must be set to at least 32 characters");
  }
  return p;
};

export function macSecret(secret: string): Buffer {
  return createHmac("sha256", PEPPER()).update(secret).digest();
}

export function issueKey(): { prefix: string; secret: string; token: string; mac: Buffer } {
  const prefix = newKeyPrefix();
  const secret = randomBytes(32).toString("base64url");
  return { prefix, secret, token: `${prefix}.${secret}`, mac: macSecret(secret) };
}

export interface AgentContext {
  agentId: string;
  credentialId: string;
  status: "active" | "suspended";
  spendCapMinor: number;
}

/**
 * Resolve a bearer token to its principal.
 *
 * Lookup is by the non-secret prefix (indexed); the secret is compared in
 * constant time. Every failure mode returns the same null and does the same
 * work, so neither the error shape nor the latency distinguishes
 * "unknown prefix" from "wrong secret" from "revoked".
 */
export async function authenticate(token: string | null): Promise<AgentContext | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot < 1) return null;
  const prefix = token.slice(0, dot);
  const secret = token.slice(dot + 1);
  if (!secret) return null;

  const presented = macSecret(secret);

  return asPlatform(async (c: PoolClient) => {
    const { rows } = await c.query(
      `select cr.id, cr.agent_id, cr.secret_mac, cr.revoked_at,
              a.status, a.spend_cap_minor
         from api_credential cr
         join agent a on a.id = cr.agent_id
        where cr.prefix = $1`,
      [prefix],
    );
    // Compare against a decoy of the same length when the prefix is unknown,
    // so the work done does not depend on whether the prefix existed.
    const stored: Buffer = rows[0]?.secret_mac ?? Buffer.alloc(32);
    const match =
      stored.length === presented.length && timingSafeEqual(stored, presented);

    if (!rows[0] || !match || rows[0].revoked_at) return null;
    if (rows[0].status !== "active") return null;

    await c.query("update api_credential set last_used_at = now() where id = $1", [
      rows[0].id,
    ]);

    return {
      agentId: rows[0].agent_id as string,
      credentialId: rows[0].id as string,
      status: rows[0].status as "active",
      spendCapMinor: Number(rows[0].spend_cap_minor),
    };
  });
}

export function bearerFrom(req: Request): string | null {
  const h = req.headers.get("authorization");
  if (!h) return null;
  const [scheme, value] = h.split(" ");
  if (!scheme || scheme.toLowerCase() !== "bearer" || !value) return null;
  return value.trim();
}
