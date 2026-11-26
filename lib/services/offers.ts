import { asAgent, asPlatform } from "../db";
import { audit } from "../audit";
import { ApiError } from "../errors";
import { rateLimit, replayOrRecord } from "../guards";

const OFFER_TTL_HOURS = 24;
const MAX_ROUNDS = 12; // bounded negotiation: two agents cannot loop forever

/** A buy offer from a prospective buyer on someone else's active listing. */
export async function makeOffer(
  actor: string,
  listingId: string,
  input: { amountMinor: number; message: string },
) {
  return asAgent(actor, async (c) => {
    await rateLimit(c, actor, "offer");

    // No FOR UPDATE here: a row lock makes Postgres apply the UPDATE policy
    // as well as the SELECT policy, and a bidder has no update right on
    // someone else's listing — the row would simply disappear. Nothing about
    // inserting an offer mutates the listing, so no lock is warranted.
    const listing = await c.query(
      `select id, seller_agent_id, status from listing where id = $1`,
      [listingId],
    );
    if (!listing.rows[0] || listing.rows[0].status !== "active") {
      throw new ApiError("not_found");
    }
    if (listing.rows[0].seller_agent_id === actor) {
      throw new ApiError("invalid", "An agent cannot bid on its own listing.");
    }

    const rounds = await c.query(
      `select count(*)::int as n from offer where listing_id = $1 and buyer_agent_id = $2`,
      [listingId, actor],
    );
    if (rounds.rows[0].n >= MAX_ROUNDS) {
      throw new ApiError("invalid", "Negotiation round limit reached for this listing.");
    }

    const { rows } = await c.query(
      `insert into offer(listing_id, buyer_agent_id, direction, amount_minor, message, expires_at)
       values ($1, $2, 'buy', $3, $4, now() + ($5 || ' hours')::interval)
       returning id, listing_id, buyer_agent_id, direction, amount_minor, message, status, expires_at, created_at`,
      [listingId, actor, input.amountMinor, input.message, OFFER_TTL_HOURS],
    );
    await audit(c, {
      actor, action: "offer.create", target: rows[0].id,
      payload: { listingId, amountMinor: input.amountMinor },
    });
    return shape(rows[0]);
  });
}

/** The listing's seller counters an open buy offer. */
export async function counterOffer(
  actor: string,
  offerId: string,
  input: { amountMinor: number; message: string },
) {
  return asAgent(actor, async (c) => {
    await rateLimit(c, actor, "offer");

    const { rows: found } = await c.query(
      `select o.id, o.listing_id, o.buyer_agent_id, o.status, l.seller_agent_id
         from offer o join listing l on l.id = o.listing_id
        where o.id = $1 for update of o`,
      [offerId],
    );
    const o = found[0];
    if (!o) throw new ApiError("not_found");
    if (o.seller_agent_id !== actor) throw new ApiError("not_found");
    if (o.status !== "open") throw new ApiError("conflict");

    const moved = await c.query(
      `update offer set status = 'countered' where id = $1 and status = 'open'`,
      [offerId],
    );
    if (moved.rowCount === 0) throw new ApiError("conflict");

    const { rows } = await c.query(
      `insert into offer(listing_id, buyer_agent_id, parent_offer_id, direction,
                         amount_minor, message, expires_at)
       values ($1, $2, $3, 'sell', $4, $5, now() + ($6 || ' hours')::interval)
       returning id, listing_id, buyer_agent_id, direction, amount_minor, message, status, expires_at, created_at`,
      [o.listing_id, o.buyer_agent_id, offerId, input.amountMinor, input.message, OFFER_TTL_HOURS],
    );
    await audit(c, {
      actor, action: "offer.counter", target: rows[0].id,
      payload: { parent: offerId, amountMinor: input.amountMinor },
    });
    return shape(rows[0]);
  });
}

/**
 * Accept an offer, creating the trade.
 *
 * Who may accept depends on the offer's direction, and getting this wrong is
 * how an agent accepts its own price:
 *   direction 'buy'  — a bid from the buyer, so only the LISTING'S SELLER may accept.
 *   direction 'sell' — a counter from the seller, so only the BUYER may accept.
 * Any other actor gets 404, not 403: a 403 would confirm the offer exists.
 */
export async function acceptOffer(actor: string, offerId: string, idemKey: string) {
  return asPlatform(async (c) =>
    replayOrRecord(c, actor, idemKey, "offer.accept", async () => {
    await rateLimit(c, actor, "write");

    const { rows: found } = await c.query(
      `select o.id, o.listing_id, o.buyer_agent_id, o.direction, o.amount_minor,
              o.status, o.expires_at,
              l.seller_agent_id, l.status as listing_status,
              sb.owner_id as buyer_owner, ss.owner_id as seller_owner
         from offer o
         join listing l on l.id = o.listing_id
         join agent sb on sb.id = o.buyer_agent_id
         join agent ss on ss.id = l.seller_agent_id
        where o.id = $1
        for update of o, l`,
      [offerId],
    );
    const o = found[0];
    if (!o) throw new ApiError("not_found");

    const acceptor = o.direction === "buy" ? o.seller_agent_id : o.buyer_agent_id;
    if (acceptor !== actor) throw new ApiError("not_found");

    if (o.status !== "open") throw new ApiError("conflict");
    if (new Date(o.expires_at) <= new Date()) throw new ApiError("conflict");
    if (o.listing_status !== "active") throw new ApiError("conflict");

    // Compare-and-swap: if two acceptances race, exactly one affects a row.
    const claimed = await c.query(
      `update offer set status = 'accepted' where id = $1 and status = 'open'`,
      [offerId],
    );
    if (claimed.rowCount === 0) throw new ApiError("conflict");

    await c.query(`update listing set status = 'reserved' where id = $1`, [o.listing_id]);

    // Same human on both sides: permitted, but flagged and excluded from
    // reputation. Detected on the immutable owner graph, never on handles.
    const wash = o.buyer_owner === o.seller_owner;

    const { rows } = await c.query(
      `insert into trade(listing_id, buyer_agent_id, seller_agent_id, accepted_offer_id,
                         amount_minor, state, wash, funding_deadline)
       values ($1, $2, $3, $4, $5, 'pending_funding', $6, now() + interval '30 minutes')
       returning id, listing_id, buyer_agent_id, seller_agent_id, amount_minor,
                 state, wash, created_at, funding_deadline`,
      [o.listing_id, o.buyer_agent_id, o.seller_agent_id, offerId, o.amount_minor, wash],
    );
    await audit(c, {
      actor, action: "offer.accept", target: rows[0].id,
      payload: { offerId, amountMinor: Number(o.amount_minor), wash },
    });
    return shapeTrade(rows[0]);
  }));
}

export async function listOffersForListing(actor: string, listingId: string) {
  return asAgent(actor, async (c) => {
    const { rows } = await c.query(
      `select id, listing_id, buyer_agent_id, direction, amount_minor, message,
              status, expires_at, created_at
         from offer where listing_id = $1 order by created_at desc limit 100`,
      [listingId],
    );
    return rows.map(shape);
  });
}

export async function getOffer(actor: string, offerId: string) {
  return asAgent(actor, async (c) => {
    const { rows } = await c.query(
      `select id, listing_id, buyer_agent_id, direction, amount_minor, message,
              status, expires_at, created_at from offer where id = $1`,
      [offerId],
    );
    if (!rows[0]) throw new ApiError("not_found");
    return shape(rows[0]);
  });
}

type Row = Record<string, unknown>;
function shape(r: Row) {
  return {
    id: r.id as string,
    listingId: r.listing_id as string,
    buyerAgentId: r.buyer_agent_id as string,
    direction: r.direction as string,
    amountMinor: Number(r.amount_minor),
    message: r.message as string,
    status: r.status as string,
    expiresAt: r.expires_at,
    createdAt: r.created_at,
  };
}
export function shapeTrade(r: Row) {
  return {
    id: r.id as string,
    listingId: r.listing_id as string,
    buyerAgentId: r.buyer_agent_id as string,
    sellerAgentId: r.seller_agent_id as string,
    amountMinor: Number(r.amount_minor),
    state: r.state as string,
    wash: Boolean(r.wash),
    createdAt: r.created_at,
    fundingDeadline: r.funding_deadline ?? null,
  };
}
