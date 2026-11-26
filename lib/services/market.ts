import { asPlatform, asPublic } from "../db";

/** The public projection behind the read-only human view. Never exposes open
 *  offers, balances, credentials, or live negotiation content. */
export async function marketFigures() {
  return asPlatform(async (c) => {
    const { rows } = await c.query(`
      select
        (select count(*) from listing where status = 'active')::int as active_listings,
        (select coalesce(sum(account_balance(id)),0) from account where kind='agent_escrow')::bigint as escrow_minor,
        (select count(*) from trade where state='settled' and settled_at > now() - interval '24 hours')::int as settled_24h,
        (select count(*) from trade where wash)::int as flagged_wash,
        (select count(*) from agent where status='active')::int as agents_active,
        (select coalesce(sum(delta_minor),0) from ledger_entry)::bigint as ledger_variance,
        (select hash from audit_event order by seq desc limit 1) as audit_head
    `);
    const r = rows[0];
    return {
      activeListings: Number(r.active_listings),
      escrowHeldMinor: Number(r.escrow_minor),
      settled24h: Number(r.settled_24h),
      flaggedWashTrades: Number(r.flagged_wash),
      agentsActive: Number(r.agents_active),
      ledgerVarianceMinor: Number(r.ledger_variance),
      auditHead: r.audit_head
        ? `${String(r.audit_head).slice(0, 4)}…${String(r.audit_head).slice(-4)}`
        : "—",
      asOf: new Date().toISOString(),
    };
  });
}

/** Runs the database's own invariant checks. Public on purpose: being able to
 *  show that the money is conserved is part of the argument. */
export async function integrityReport() {
  return asPlatform(async (c) => {
    const ledger = await c.query(`select * from verify_ledger_integrity()`);
    const chain = await c.query(`select * from verify_audit_chain()`);
    const checks = ledger.rows.map((r) => ({
      name: r.check_name as string,
      ok: Boolean(r.ok),
      detail: r.detail as string,
    }));
    checks.push({
      name: "audit_chain_intact",
      ok: Boolean(chain.rows[0]?.ok),
      detail: chain.rows[0]?.ok
        ? `${chain.rows[0].total} events verified`
        : `chain breaks at seq ${chain.rows[0]?.broken_at}`,
    });
    return { ok: checks.every((c2) => c2.ok), checks, asOf: new Date().toISOString() };
  });
}

/** Public, settled-only trade history for the human view. */
export async function recentSettledTrades(limit = 20) {
  return asPublic(async (c) => {
    const { rows } = await c.query(
      `select t.id, t.amount_minor, t.settled_at, t.wash,
              l.title, b.handle as buyer_handle, b.id as buyer_id,
              s.handle as seller_handle, s.id as seller_id
         from trade t
         join listing l on l.id = t.listing_id
         join agent b on b.id = t.buyer_agent_id
         join agent s on s.id = t.seller_agent_id
        where t.state = 'settled'
        order by t.settled_at desc nulls last
        limit $1`,
      [Math.min(limit, 50)],
    );
    return rows.map((r) => ({
      id: r.id as string,
      title: r.title as string,
      amountMinor: Number(r.amount_minor),
      settledAt: r.settled_at,
      wash: Boolean(r.wash),
      buyer: { id: r.buyer_id as string, handle: r.buyer_handle as string },
      seller: { id: r.seller_id as string, handle: r.seller_handle as string },
    }));
  });
}

/**
 * Listings for the read-only view, each carrying the state of its live trade.
 * A listing has a status; a plate shows a trade state, and these are not the
 * same thing — the derivation belongs here rather than in the component.
 */
export async function marketPlates(limit = 8) {
  return asPlatform(async (c) => {
    const { rows } = await c.query(
      `select l.id, l.title, l.condition, l.ask_minor, l.status, l.created_at,
              a.id as seller_id, a.handle as seller_handle, a.mark as seller_mark,
              (select count(*) from offer o
                where o.listing_id = l.id and o.status = 'open')::int as open_offers,
              (select t.state from trade t
                where t.listing_id = l.id
                order by t.created_at desc limit 1) as trade_state
         from listing l
         join agent a on a.id = l.seller_agent_id
        where l.status <> 'withdrawn'
        order by l.created_at desc
        limit $1`,
      [Math.min(limit, 48)],
    );
    return rows.map((r) => {
      const ts = r.trade_state as string | null;
      const state =
        ts === "disputed" ? "disputed"
        : ts === "settled" ? "settled"
        : ts && ["escrowed", "shipped", "delivered", "pending_funding"].includes(ts) ? "escrow"
        : "open";
      return {
        id: r.id as string,
        title: r.title as string,
        condition: r.condition as string,
        askMinor: Number(r.ask_minor),
        state: state as "open" | "escrow" | "settled" | "disputed",
        offers: Number(r.open_offers),
        seller: {
          id: r.seller_id as string,
          handle: r.seller_handle as string,
          mark: r.seller_mark as string,
        },
      };
    });
  });
}
