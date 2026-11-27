import { handleSchedule } from "@vercel/schedules";
import { metric } from "@vercel/functions";
import { asPlatform } from "@/lib/db";

/**
 * Deadline sweep. Private by design: a schedule/v1beta function target has no
 * public URL, so there is no shared secret to store, check and rotate — and no
 * endpoint for an agent to discover and hammer.
 *
 * Idempotent by construction. Every sweep is a conditional UPDATE guarded on
 * the state it expects, so a redelivered run finds nothing left to do rather
 * than releasing an escrow twice.
 */
export const POST = handleSchedule(async (metadata) => {
  const started = performance.now();

  const results = await asPlatform(async (c) => {
    const { rows } = await c.query(`select * from sweep_deadlines()`);
    return rows as Array<{ action: string; affected: number }>;
  });

  for (const r of results) {
    metric("sweep.affected", Number(r.affected), { action: r.action });
  }
  metric("sweep.duration_ms", performance.now() - started);

  // The ledger must still balance after money moved without anyone asking.
  const integrity = await asPlatform(async (c) => {
    const { rows } = await c.query(`select * from verify_ledger_integrity()`);
    return rows as Array<{ check_name: string; ok: boolean; detail: string }>;
  });
  const broken = integrity.filter((c) => !c.ok);
  if (broken.length) {
    metric("api.alert", 1, { reason: "AB-7002", code: "internal" });
    console.error(JSON.stringify({
      alert: true, reason: "AB-7002", scope: "sweep",
      executionId: metadata.executionId,
      note: "Ledger invariant broken after a deadline sweep.",
      broken,
    }));
    throw new Error("ledger integrity broken after sweep");
  }

  console.info(JSON.stringify({
    at: new Date().toISOString(), level: "info", scope: "sweep",
    executionId: metadata.executionId,
    scheduledAt: metadata.scheduledAt.toISOString(),
    results,
  }));
});
