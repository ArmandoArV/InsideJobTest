-- ============================================================================
-- Deadlines that actually fire.
--
-- Until now `expires_at`, `funding_deadline` and `auto_release_at` were written
-- and never read, which made them decoration and left a real hole: a buyer
-- could get an offer accepted and simply never fund it. The trade sat in
-- pending_funding forever, the one-live-trade-per-listing index held, and the
-- listing stayed reserved permanently. Denial of inventory, repeatable, free.
--
-- All four sweeps run in one transaction and return what they did, so a run is
-- auditable and the caller can assert on it.
-- ============================================================================

create or replace function sweep_deadlines(
  p_dispute_window interval default interval '7 days'
)
returns table(action text, affected int)
language plpgsql as $$
declare
  n int;
  r record;
  mint uuid;
begin
  -- 1. Offers past their TTL stop being acceptable.
  update offer set status = 'expired'
   where status = 'open' and expires_at <= now();
  get diagnostics n = row_count;
  action := 'offers_expired'; affected := n; return next;

  -- 2. Accepted but never funded: cancel and give the listing back. This is
  --    the inventory lock, closed.
  n := 0;
  for r in
    select * from trade
     where state = 'pending_funding'
       and funding_deadline is not null and funding_deadline <= now()
     for update
  loop
    update trade set state = 'cancelled' where id = r.id and state = 'pending_funding';
    update listing set status = 'active'
     where id = r.listing_id and status = 'reserved';
    insert into audit_event(actor_agent_id, action, target, payload_digest, prev_hash, hash)
      values (null, 'trade.expire_funding', r.id::text,
              encode(digest(r.id::text || 'expire_funding', 'sha256'), 'hex'), '', '');
    n := n + 1;
  end loop;
  action := 'funding_expired'; affected := n; return next;

  -- 3. Shipped, delivery never confirmed, past the auto-release deadline:
  --    release to the seller. Without this a silent buyer strands the seller's
  --    goods and their money indefinitely.
  n := 0;
  for r in
    select * from trade
     where state = 'shipped'
       and auto_release_at is not null and auto_release_at <= now()
     for update
  loop
    perform ledger_transfer(
      gen_random_uuid(),
      account_of(r.buyer_agent_id, 'agent_escrow'),
      account_of(r.seller_agent_id, 'agent_available'),
      r.amount_minor, 'escrow_release', r.id);
    update trade set state = 'settled', delivered_at = coalesce(delivered_at, now()),
                     settled_at = now()
     where id = r.id and state = 'shipped';
    update listing set status = 'sold' where id = r.listing_id;
    insert into audit_event(actor_agent_id, action, target, payload_digest, prev_hash, hash)
      values (null, 'trade.auto_release', r.id::text,
              encode(digest(r.id::text || 'auto_release', 'sha256'), 'hex'), '', '');
    n := n + 1;
  end loop;
  action := 'auto_released'; affected := n; return next;

  -- 4. Disputes resolve by deadline, because no human holds write access here.
  --    They resolve toward the buyer: the buyer paid, the goods were disputed,
  --    and the seller had the whole window to make it right. That rule is
  --    arguable, which is exactly why it is written down rather than implied.
  n := 0;
  for r in
    select * from trade
     where state = 'disputed'
       and coalesce(shipped_at, created_at) + p_dispute_window <= now()
     for update
  loop
    perform ledger_transfer(
      gen_random_uuid(),
      account_of(r.buyer_agent_id, 'agent_escrow'),
      account_of(r.buyer_agent_id, 'agent_available'),
      r.amount_minor, 'escrow_refund', r.id);
    update trade set state = 'cancelled' where id = r.id and state = 'disputed';
    update listing set status = 'withdrawn' where id = r.listing_id;
    insert into audit_event(actor_agent_id, action, target, payload_digest, prev_hash, hash)
      values (null, 'trade.resolve_refund', r.id::text,
              encode(digest(r.id::text || 'resolve_refund', 'sha256'), 'hex'), '', '');
    n := n + 1;
  end loop;
  action := 'disputes_refunded'; affected := n; return next;
end $$;
