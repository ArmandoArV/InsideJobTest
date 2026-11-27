/* ============================================================================
 * Regression test for the deadline sweep.
 *
 * The hole this closes: a buyer could get an offer accepted and never fund it.
 * The trade sat in pending_funding forever, the one-live-trade-per-listing
 * index held, and the listing stayed reserved permanently — denial of
 * inventory, free and repeatable. Deadlines were written and never read.
 *
 * Drives the market over the public API, then back-dates the deadline directly
 * (something no agent can do) and asserts the sweep releases the listing.
 * ========================================================================== */
import { Pool } from "pg";

const BASE = process.env.BASE_URL ?? "http://localhost:3000";
let passed = 0, failed = 0;

function check(name: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  ${detail}` : ""}`);
  ok ? passed++ : failed++;
}

async function call(path: string, opts: { method?: string; token?: string; body?: unknown; idem?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.token) headers.authorization = `Bearer ${opts.token}`;
  if (opts.idem) headers["idempotency-key"] = opts.idem;
  const res = await fetch(`${BASE}${path}`, {
    method: opts.method ?? "GET", headers,
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  const text = await res.text();
  let body: any = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  return { status: res.status, body };
}
const uniq = () => Math.random().toString(36).slice(2, 10);

async function register(h: string) {
  const r = await call("/api/agents/register", {
    method: "POST", body: { handle: h, ownerName: h },
  });
  if (r.status !== 200) throw new Error(`register ${r.status}: ${JSON.stringify(r.body)}`);
  return { id: r.body.agent.id as string, token: r.body.apiKey as string };
}

async function main() {
  console.log(`\nDeadline sweep verification against ${BASE}\n`);
  const pool = new Pool({ connectionString: process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL, max: 2 });

  const tag = uniq();
  const seller = await register(`sweep-seller-${tag}`);
  const buyer = await register(`sweep-buyer-${tag}`);

  // ---- 1. unfunded acceptance must not lock the listing forever -----------
  const listing = await call("/api/listings", {
    method: "POST", token: seller.token,
    body: { title: `Sweep probe ${tag}`, description: "deadline test",
            condition: "Good", askMinor: 500000 },
  });
  const listingId = listing.body.id as string;

  const offer = await call(`/api/listings/${listingId}/offers`, {
    method: "POST", token: buyer.token, body: { amountMinor: 400000, message: "" },
  });
  const accepted = await call(`/api/offers/${offer.body.id}/accept`, {
    method: "POST", token: seller.token, idem: `sweep-${tag}` });
  const tradeId = accepted.body.id as string;
  check("a trade is created and awaits funding", accepted.body.state === "pending_funding");

  const reserved = await pool.query(`select status from listing where id = $1`, [listingId]);
  check("the listing is reserved while funding is pending", reserved.rows[0].status === "reserved");

  // Back-date the deadline. No agent can do this; it is how we reach the state
  // an attacker reaches by simply waiting.
  await pool.query(
    `update trade set funding_deadline = now() - interval '1 minute' where id = $1`, [tradeId]);

  const swept = await pool.query(`select * from sweep_deadlines()`);
  const fundingExpired = Number(swept.rows.find((r) => r.action === "funding_expired")?.affected ?? 0);
  check("the sweep cancels the unfunded trade", fundingExpired >= 1, `${fundingExpired} cancelled`);

  const after = await pool.query(
    `select t.state, l.status from trade t join listing l on l.id = t.listing_id where t.id = $1`,
    [tradeId]);
  check("the trade is cancelled", after.rows[0].state === "cancelled", after.rows[0].state);
  check("the listing returns to the market", after.rows[0].status === "active", after.rows[0].status);

  // ---- 2. the listing is tradeable again ---------------------------------
  const reoffer = await call(`/api/listings/${listingId}/offers`, {
    method: "POST", token: buyer.token, body: { amountMinor: 420000, message: "second run" } });
  check("a new offer can be made on the released listing", reoffer.status === 200,
        `got ${reoffer.status}`);

  // ---- 3. offers past their TTL stop being acceptable ---------------------
  await pool.query(`update offer set expires_at = now() - interval '1 minute' where id = $1`,
                   [reoffer.body.id]);
  await pool.query(`select * from sweep_deadlines()`);
  const expired = await pool.query(`select status from offer where id = $1`, [reoffer.body.id]);
  check("an expired offer is marked expired", expired.rows[0].status === "expired",
        expired.rows[0].status);

  const acceptExpired = await call(`/api/offers/${reoffer.body.id}/accept`, {
    method: "POST", token: seller.token, idem: `sweep-exp-${tag}` });
  check("an expired offer cannot be accepted", acceptExpired.status === 409,
        `got ${acceptExpired.status}`);

  // ---- 4. money still balances after the sweep moved it -------------------
  const integrity = await call("/api/integrity");
  check("ledger integrity holds after sweeping", integrity.body?.ok === true,
        JSON.stringify(integrity.body?.checks?.filter((c: any) => !c.ok)));

  await pool.end();
  console.log(`\n${passed} passed, ${failed} failed\n`);
  if (failed) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
export {};
