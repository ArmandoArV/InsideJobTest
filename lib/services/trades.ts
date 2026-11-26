import { randomUUID } from "node:crypto";
import { asAgent, asPlatform } from "../db";
import { audit } from "../audit";
import { ApiError } from "../errors";
import { rateLimit, replayOrRecord } from "../guards";
import { transitionFor, type Role, type TradeState } from "../trade-machine";
import { shapeTrade } from "./offers";

const AUTO_RELEASE_DAYS = 3;

/** Resolve the actor's role on a trade. Anyone who is neither party gets 404. */
function roleOf(trade: { buyer_agent_id: string; seller_agent_id: string }, actor: string): Role {
  if (trade.buyer_agent_id === actor) return "buyer";
  if (trade.seller_agent_id === actor) return "seller";
  throw new ApiError("not_found");
}

/**
 * Apply one lifecycle event.
 *
 * Every transition is looked up in the table by (from, event, role), so the
 * authorization question "may this actor fire this event from this state?" has
 * exactly one answer in exactly one place. A seller firing `confirm_delivery`
 * finds no transition and is refused — which is the whole point of escrow.
 */
async function applyEvent(
  actor: string,
  tradeId: string,
  event: string,
  idemKey: string,
  onApplied?: (c: import("pg").PoolClient, trade: Record<string, unknown>) => Promise<void>,
) {
  return asPlatform(async (c) =>
    replayOrRecord(c, actor, idemKey, `trade.${event}`, async () => {
    await rateLimit(c, actor, "write");

    const { rows } = await c.query(
      `select * from trade where id = $1 for update`,
      [tradeId],
    );
    const t = rows[0];
    if (!t) throw new ApiError("not_found");

    const role = roleOf(t, actor);
    const transition = transitionFor(t.state as TradeState, event, role);
    if (!transition) {
      // Indistinguishable from "wrong state" on purpose: the refusal does not
      // tell an attacker which half of the check failed.
      throw new ApiError("conflict");
    }

    const moved = await c.query(
      `update trade set state = $2 where id = $1 and state = $3 returning *`,
      [tradeId, transition.to, transition.from],
    );
    if (moved.rowCount === 0) throw new ApiError("conflict");

    if (onApplied) await onApplied(c, moved.rows[0]);

    await audit(c, {
      actor, action: `trade.${event}`, target: tradeId,
      payload: { from: transition.from, to: transition.to, role },
    });

    // Re-read: onApplied may have advanced the trade further — confirming
    // delivery settles it in the same transaction — and returning the row
    // captured before that would report a state the trade is no longer in.
    const fresh = await c.query(`select * from trade where id = $1`, [tradeId]);
    return fresh.rows[0];
  }));
}

/** Buyer funds escrow: credits leave available and enter the escrow account. */
export async function fundTrade(actor: string, tradeId: string, idemKey: string) {
  const t = await applyEvent(actor, tradeId, "fund", idemKey, async (c, trade) => {
    const amount = Number(trade.amount_minor);
    const buyer = trade.buyer_agent_id as string;

    const cap = await c.query(`select spend_cap_minor from agent where id = $1`, [buyer]);
    if (amount > Number(cap.rows[0].spend_cap_minor)) {
      throw new ApiError("invalid", "Amount exceeds this agent's spend cap.");
    }

    await c.query(`select ensure_agent_accounts($1)`, [buyer]);
    await c.query(
      `select ledger_transfer($1, account_of($2,'agent_available'),
                              account_of($2,'agent_escrow'), $3, 'escrow_fund', $4)`,
      [randomUUID(), buyer, amount, trade.id],
    );
    await c.query(`update trade set funded_at = now() where id = $1`, [trade.id]);
  });
  return shapeTrade(t);
}

export async function shipTrade(actor: string, tradeId: string, idemKey: string) {
  const t = await applyEvent(actor, tradeId, "ship", idemKey, async (c, trade) => {
    await c.query(
      `update trade set shipped_at = now(),
              auto_release_at = now() + ($2 || ' days')::interval
        where id = $1`,
      [trade.id, AUTO_RELEASE_DAYS],
    );
  });
  return shapeTrade(t);
}

/**
 * Buyer confirms delivery. Release follows as a system consequence in the same
 * transaction — the seller never has a request that releases their own escrow.
 */
export async function confirmDelivery(actor: string, tradeId: string, idemKey: string) {
  const t = await applyEvent(actor, tradeId, "confirm_delivery", idemKey, async (c, trade) => {
    await c.query(`update trade set delivered_at = now() where id = $1`, [trade.id]);
    await releaseEscrow(c, trade);
  });
  return shapeTrade(t);
}

export async function disputeTrade(actor: string, tradeId: string, reason: string, idemKey: string) {
  const t = await applyEvent(actor, tradeId, "dispute", idemKey, async (c, trade) => {
    await audit(c, {
      actor, action: "trade.dispute.reason", target: trade.id as string,
      payload: { reason: reason.slice(0, 500) },
    });
  });
  return shapeTrade(t);
}

/** System-only. Moves escrow to the seller and settles. Never an HTTP route. */
async function releaseEscrow(c: import("pg").PoolClient, trade: Record<string, unknown>) {
  const amount = Number(trade.amount_minor);
  const buyer = trade.buyer_agent_id as string;
  const seller = trade.seller_agent_id as string;

  await c.query(`select ensure_agent_accounts($1)`, [seller]);
  await c.query(
    `select ledger_transfer($1, account_of($2,'agent_escrow'),
                            account_of($3,'agent_available'), $4, 'escrow_release', $5)`,
    [randomUUID(), buyer, seller, amount, trade.id],
  );
  await c.query(
    `update trade set state = 'settled', settled_at = now() where id = $1`,
    [trade.id],
  );
  await c.query(`update listing set status = 'sold' where id = $1`, [trade.listing_id]);
}

export async function getTrade(actor: string, tradeId: string) {
  return asAgent(actor, async (c) => {
    const { rows } = await c.query(`select * from trade where id = $1`, [tradeId]);
    if (!rows[0]) throw new ApiError("not_found");
    return shapeTrade(rows[0]);
  });
}

export async function listMyTrades(actor: string) {
  return asAgent(actor, async (c) => {
    const { rows } = await c.query(
      `select * from trade order by created_at desc limit 100`,
    );
    return rows.map(shapeTrade);
  });
}

/** Rate a settled trade. One per side, immutable, counterparties only. */
export async function rateTrade(
  actor: string,
  tradeId: string,
  input: { score: number; comment: string },
) {
  return asPlatform(async (c) => {
    await rateLimit(c, actor, "write");
    const { rows } = await c.query(`select * from trade where id = $1 for update`, [tradeId]);
    const t = rows[0];
    if (!t) throw new ApiError("not_found");

    const role = roleOf(t, actor);
    if (t.state !== "settled") throw new ApiError("conflict");

    const ratee = role === "buyer" ? t.seller_agent_id : t.buyer_agent_id;
    try {
      const r = await c.query(
        `insert into rating(trade_id, rater_agent_id, ratee_agent_id, score, comment)
         values ($1, $2, $3, $4, $5)
         returning id, trade_id, rater_agent_id, ratee_agent_id, score, comment, created_at`,
        [tradeId, actor, ratee, input.score, input.comment],
      );
      await audit(c, {
        actor, action: "trade.rate", target: tradeId,
        payload: { ratee, score: input.score },
      });
      return {
        id: r.rows[0].id,
        tradeId: r.rows[0].trade_id,
        rateeAgentId: r.rows[0].ratee_agent_id,
        score: r.rows[0].score,
        comment: r.rows[0].comment,
      };
    } catch (err) {
      // unique (trade_id, rater_agent_id) — one rating per side, enforced by
      // the database rather than by a read-then-write race in code.
      if ((err as { code?: string }).code === "23505") throw new ApiError("conflict");
      throw err;
    }
  });
}
