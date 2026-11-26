import { asAgent, asPublic } from "../db";
import { audit } from "../audit";
import { fail } from "../errors/AppError";
import { rateLimit } from "../guards";

export const CONDITIONS = ["New", "Like new", "Good", "Fair", "For parts"] as const;

export async function createListing(
  actor: string,
  input: { title: string; description: string; condition: string; askMinor: number },
) {
  return asAgent(actor, async (c) => {
    await rateLimit(c, actor, "write");
    const { rows } = await c.query(
      `insert into listing(seller_agent_id, title, description, condition, ask_minor)
       values ($1, $2, $3, $4, $5)
       returning id, title, description, condition, ask_minor, status, created_at`,
      [actor, input.title, input.description, input.condition, input.askMinor],
    );
    await audit(c, {
      actor,
      action: "listing.create",
      target: rows[0].id,
      payload: { askMinor: input.askMinor, condition: input.condition },
    });
    return shape(rows[0]);
  });
}

/** Withdraw a listing. Seller only, and only while it is still active — a
 *  listing already reserved by a live trade cannot be pulled out from under
 *  its counterparty. */
export async function withdrawListing(actor: string, id: string) {
  return asAgent(actor, async (c) => {
    await rateLimit(c, actor, "withdraw");
    const { rows } = await c.query(
      `update listing set status = 'withdrawn'
        where id = $1 and seller_agent_id = $2 and status = 'active'
        returning id, title, description, condition, ask_minor, status, created_at`,
      [id, actor],
    );
    if (!rows[0]) fail("NOT_LISTING_SELLER", id);
    await audit(c, { actor, action: "listing.withdraw", target: id, payload: {} });
    return shape(rows[0]);
  });
}

/** Lexical search over active listings. Public: no credential required. */
export async function searchListings(params: {
  q?: string;
  condition?: string;
  maxMinor?: number;
  limit: number;
  offset: number;
}) {
  return asPublic(async (c) => {
    const { rows } = await c.query(
      `select l.id, l.title, l.description, l.condition, l.ask_minor, l.status,
              l.created_at, l.seller_agent_id,
              a.handle as seller_handle, a.mark as seller_mark,
              (select count(*) from offer o
                where o.listing_id = l.id and o.status = 'open') as offer_count,
              case when $1::text is null then 0
                   else ts_rank(l.search, plainto_tsquery('simple', $1)) end as rank
         from listing l
         join agent a on a.id = l.seller_agent_id
        where l.status = 'active'
          and ($1::text is null or l.search @@ plainto_tsquery('simple', $1))
          and ($2::text is null or l.condition = $2)
          and ($3::bigint is null or l.ask_minor <= $3)
        order by rank desc, l.created_at desc
        limit $4 offset $5`,
      [params.q ?? null, params.condition ?? null, params.maxMinor ?? null,
       params.limit, params.offset],
    );
    return rows.map(shapeWithSeller);
  });
}

export async function getListing(id: string, viewer: string | null) {
  const run = viewer
    ? <T,>(f: Parameters<typeof asAgent<T>>[1]) => asAgent(viewer, f)
    : <T,>(f: Parameters<typeof asPublic<T>>[0]) => asPublic(f);

  return run(async (c) => {
    const { rows } = await c.query(
      `select l.id, l.title, l.description, l.condition, l.ask_minor, l.status,
              l.created_at, l.seller_agent_id,
              a.handle as seller_handle, a.mark as seller_mark
         from listing l join agent a on a.id = l.seller_agent_id
        where l.id = $1`,
      [id],
    );
    // RLS has already removed anything this viewer may not see, so an empty
    // result is indistinguishable from a nonexistent id — which is the point.
    if (!rows[0]) fail("RESOURCE_UNKNOWN", id);
    return shapeWithSeller(rows[0]);
  });
}

type Row = Record<string, unknown>;
function shape(r: Row) {
  return {
    id: r.id as string,
    title: r.title as string,
    description: r.description as string,
    condition: r.condition as string,
    askMinor: Number(r.ask_minor),
    status: r.status as string,
    createdAt: r.created_at,
  };
}
function shapeWithSeller(r: Row) {
  return {
    ...shape(r),
    offers: r.offer_count === undefined ? undefined : Number(r.offer_count),
    seller: {
      id: r.seller_agent_id as string,
      handle: r.seller_handle as string,
      mark: r.seller_mark as string,
    },
  };
}
