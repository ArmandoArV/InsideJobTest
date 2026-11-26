-- ============================================================================
-- Row level security — the second, independent enforcement layer.
--
-- The repository layer already includes an actor predicate in every private
-- read. This exists because some of that layer is agent-written: if a generated
-- query forgets its WHERE clause, RLS returns zero rows instead of the table.
--
-- FORCE is essential. Without it the table owner — which is the role the app
-- connects as on a managed Postgres — bypasses every policy below, and this
-- file becomes decoration.
-- ============================================================================

create or replace function current_agent() returns text
  language sql stable as $$
  select nullif(current_setting('app.agent_id', true), '');
$$;

-- Set only by server-side paths that are not reachable from any HTTP handler.
create or replace function is_platform() returns boolean
  language sql stable as $$
  select coalesce(current_setting('app.role', true), '') = 'platform';
$$;

-- ----------------------------------------------------------------- listing
alter table listing enable row level security;
alter table listing force row level security;

create policy listing_read on listing for select using (
  is_platform() or status = 'active' or seller_agent_id = current_agent()
);
create policy listing_insert on listing for insert with check (
  is_platform() or seller_agent_id = current_agent()
);
create policy listing_update on listing for update using (
  is_platform() or seller_agent_id = current_agent()
);

-- ------------------------------------------------------------------- offer
-- The assignment's "private offers". The most likely thing the attacking
-- agents will probe, so it is the policy worth getting exactly right.
alter table offer enable row level security;
alter table offer force row level security;

create policy offer_read on offer for select using (
  is_platform()
  or buyer_agent_id = current_agent()
  or exists (select 1 from listing l
              where l.id = offer.listing_id
                and l.seller_agent_id = current_agent())
);
create policy offer_insert on offer for insert with check (
  is_platform()
  or buyer_agent_id = current_agent()
  or exists (select 1 from listing l
              where l.id = offer.listing_id
                and l.seller_agent_id = current_agent())
);
create policy offer_update on offer for update using (
  is_platform()
  or buyer_agent_id = current_agent()
  or exists (select 1 from listing l
              where l.id = offer.listing_id
                and l.seller_agent_id = current_agent())
);

-- ------------------------------------------------------------------- trade
alter table trade enable row level security;
alter table trade force row level security;

create policy trade_read on trade for select using (
  is_platform()
  or buyer_agent_id = current_agent()
  or seller_agent_id = current_agent()
);
create policy trade_write on trade for all using (
  is_platform()
  or buyer_agent_id = current_agent()
  or seller_agent_id = current_agent()
) with check (
  is_platform()
  or buyer_agent_id = current_agent()
  or seller_agent_id = current_agent()
);

-- ----------------------------------------------------------------- account
alter table account enable row level security;
alter table account force row level security;

create policy account_read on account for select using (
  is_platform() or agent_id = current_agent()
);

-- ------------------------------------------------------------ ledger_entry
alter table ledger_entry enable row level security;
alter table ledger_entry force row level security;

create policy ledger_read on ledger_entry for select using (
  is_platform()
  or exists (select 1 from account a
              where a.id = ledger_entry.account_id
                and a.agent_id = current_agent())
);
-- Money only ever moves through the platform path. There is no HTTP route
-- that reaches it, so there is no agent-authored write to the ledger at all.
create policy ledger_insert on ledger_entry for insert with check (is_platform());

-- ------------------------------------------------------------------ rating
-- Reputation is public by design: it is the signal the market runs on.
alter table rating enable row level security;
alter table rating force row level security;

create policy rating_read on rating for select using (true);
create policy rating_insert on rating for insert with check (
  is_platform() or rater_agent_id = current_agent()
);

-- --------------------------------------------------------------- api keys
alter table api_credential enable row level security;
alter table api_credential force row level security;

-- Credentials are never readable through an agent session; only the
-- authentication path, which runs as platform, may look them up.
create policy credential_platform_only on api_credential for all
  using (is_platform()) with check (is_platform());

-- ------------------------------------------------------------ idempotency
alter table idempotency enable row level security;
alter table idempotency force row level security;
create policy idem_own on idempotency for all
  using (is_platform() or agent_id = current_agent())
  with check (is_platform() or agent_id = current_agent());
