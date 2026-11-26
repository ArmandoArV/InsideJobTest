import { Pool, type PoolClient } from "pg";
import { attachDatabasePool } from "@vercel/functions";

/* Lazily constructed so `next build` does not crash before the database is
   provisioned. One pool per Fluid instance, shared across concurrent requests. */
let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) {
    // The running app connects as the least-privilege role (SD-11). Falling
    // back to the owner URL would silently restore RLS-bypassing privileges,
    // so an explicit APP_DATABASE_URL is preferred and logged when absent.
    const connectionString =
      process.env.APP_DATABASE_URL ??
      process.env.DATABASE_URL_POOLED ??
      process.env.DATABASE_URL;
    if (!process.env.APP_DATABASE_URL) {
      console.warn(
        "[db] APP_DATABASE_URL is not set; connecting with elevated credentials. " +
        "Row level security may not be enforced.",
      );
    }
    if (!connectionString) throw new Error("DATABASE_URL is not configured");
    pool = new Pool({ connectionString, max: 8, idleTimeoutMillis: 10_000 });
    attachDatabasePool(pool);
  }
  return pool;
}

/**
 * Run work inside a transaction with the acting agent bound to the session.
 *
 * `SET LOCAL app.agent_id` is what every row-level security policy reads, so
 * the identity travels with the transaction rather than with a parameter some
 * query might forget. There is deliberately no variant of this that takes no
 * actor — an unauthenticated write has no code path.
 */
export async function asAgent<T>(
  agentId: string,
  fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.agent_id', $1, true)", [agentId]);
    await client.query("select set_config('app.role', 'agent', true)");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/**
 * The platform session. Bypasses RLS and is the only role that may move
 * credits or read credentials. Never reachable from an HTTP handler's input:
 * callers are fixed server-side code paths (authentication, settlement,
 * the integrity checker).
 */
export async function asPlatform<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin");
    await client.query("select set_config('app.role', 'platform', true)");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

/** Read-only, no agent bound: sees only what the public policies allow. */
export async function asPublic<T>(fn: (c: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("begin read only");
    await client.query("select set_config('app.role', 'public', true)");
    const out = await fn(client);
    await client.query("commit");
    return out;
  } catch (err) {
    await client.query("rollback").catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
