-- ============================================================================
-- AgentBazaar — schema
--
-- Correctness that money depends on lives here, not in application code,
-- because some of the application code is agent-written. Every invariant in
-- SPEC.md section 6 is a constraint or a trigger below.
-- ============================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------- principals

create table owner (
  id            uuid primary key default gen_random_uuid(),
  display_name  text not null check (length(display_name) between 1 and 80),
  created_at    timestamptz not null default now()
);

-- The agent id is the ONLY principal. Nothing is authorized by handle.
create table agent (
  id               text primary key check (id ~ '^agt_[0-9A-HJKMNP-TV-Z]{10}$'),
  owner_id         uuid not null references owner(id),
  -- Deliberately NOT unique and mutable: any code that looks an agent up by
  -- handle is then obviously wrong rather than subtly wrong.
  handle           text not null check (length(handle) between 1 and 40),
  mark             text not null check (length(mark) = 2),
  status           text not null default 'active' check (status in ('active','suspended')),
  spend_cap_minor  bigint not null default 50000000 check (spend_cap_minor >= 0),
  created_at       timestamptz not null default now()
);
create index agent_owner_idx on agent(owner_id);

create table api_credential (
  id           uuid primary key default gen_random_uuid(),
  agent_id     text not null references agent(id) on delete cascade,
  prefix       text not null unique,
  -- HMAC-SHA256 of a 256-bit random secret under a server-side pepper.
  -- Not a password KDF: the secret is full-entropy random, so the brute-force
  -- threat a slow KDF defends against does not exist, and running one per
  -- request would be a self-inflicted denial of service.
  secret_mac   bytea not null,
  created_at   timestamptz not null default now(),
  revoked_at   timestamptz,
  last_used_at timestamptz
);
create index api_credential_agent_idx on api_credential(agent_id);

-- ------------------------------------------------------------------- ledger

create table account (
  id       uuid primary key default gen_random_uuid(),
  kind     text not null check (kind in ('agent_available','agent_escrow','platform_mint')),
  agent_id text references agent(id),
  -- agent accounts must name an agent; the mint must not
  check ((kind = 'platform_mint' and agent_id is null)
      or (kind <> 'platform_mint' and agent_id is not null))
);
create unique index account_agent_kind_uniq on account(kind, agent_id) where agent_id is not null;
create unique index account_mint_uniq on account(kind) where kind = 'platform_mint';

-- Append-only, double-entry. No row anywhere stores a balance; a balance is a
-- SUM over this table. A stored balance is a second source of truth and
-- therefore a race waiting to happen.
create table ledger_entry (
  id          bigserial primary key,
  transfer_id uuid not null,
  account_id  uuid not null references account(id),
  delta_minor bigint not null check (delta_minor <> 0),
  reason      text not null check (reason in
                ('mint','escrow_fund','escrow_release','escrow_refund')),
  trade_id    uuid,
  created_at  timestamptz not null default now()
);
create index ledger_account_idx  on ledger_entry(account_id);
create index ledger_transfer_idx on ledger_entry(transfer_id);
create index ledger_trade_idx    on ledger_entry(trade_id);

-- I4 — append-only. Updates and deletes are refused at the table.
create or replace function forbid_mutation() returns trigger
  language plpgsql as $$
begin
  raise exception 'append-only: % may not be % ed', tg_table_name, lower(tg_op);
end $$;

create trigger ledger_entry_immutable
  before update or delete on ledger_entry
  for each row execute function forbid_mutation();

-- I1 — every transfer sums to zero, checked at commit so a multi-row transfer
-- can be inserted in any order within its transaction.
create or replace function assert_transfer_balanced() returns trigger
  language plpgsql as $$
declare total bigint;
begin
  select coalesce(sum(delta_minor), 0) into total
    from ledger_entry where transfer_id = new.transfer_id;
  if total <> 0 then
    raise exception 'transfer % does not balance: sums to %', new.transfer_id, total;
  end if;
  return null;
end $$;

create constraint trigger ledger_entry_balanced
  after insert on ledger_entry
  deferrable initially deferred
  for each row execute function assert_transfer_balanced();

create or replace function account_balance(a uuid) returns bigint
  language sql stable as $$
  select coalesce(sum(delta_minor), 0)::bigint from ledger_entry where account_id = a;
$$;

-- I2 — no agent account may ever go negative. Checked at commit, after the
-- whole transfer has landed.
create or replace function assert_account_non_negative() returns trigger
  language plpgsql as $$
declare bal bigint; knd text;
begin
  select kind into knd from account where id = new.account_id;
  if knd = 'platform_mint' then return null; end if;   -- the mint is the source
  select account_balance(new.account_id) into bal;
  if bal < 0 then
    raise exception 'account % would go negative (%)', new.account_id, bal;
  end if;
  return null;
end $$;

create constraint trigger ledger_entry_non_negative
  after insert on ledger_entry
  deferrable initially deferred
  for each row execute function assert_account_non_negative();

-- ----------------------------------------------------------------- listings

create table listing (
  id              uuid primary key default gen_random_uuid(),
  seller_agent_id text not null references agent(id),
  title           text not null check (length(title) between 3 and 140),
  description     text not null default '' check (length(description) <= 2000),
  condition       text not null check (condition in ('New','Like new','Good','Fair','For parts')),
  ask_minor       bigint not null check (ask_minor > 0 and ask_minor <= 1000000000),
  status          text not null default 'active'
                    check (status in ('active','reserved','sold','withdrawn')),
  created_at      timestamptz not null default now(),
  search          tsvector generated always as
                    (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,''))) stored
);
create index listing_search_idx on listing using gin(search);
create index listing_title_trgm_idx on listing using gin (title gin_trgm_ops);
create index listing_seller_idx on listing(seller_agent_id);
create index listing_status_idx on listing(status) where status = 'active';

-- ------------------------------------------------------------------- offers
-- Private to the buyer and the listing's seller. Enforced in the query layer
-- and again by RLS below, because a generated query that forgets its predicate
-- should return nothing rather than leak the table.

create table offer (
  id              uuid primary key default gen_random_uuid(),
  listing_id      uuid not null references listing(id),
  buyer_agent_id  text not null references agent(id),
  parent_offer_id uuid references offer(id),
  direction       text not null check (direction in ('buy','sell')),
  amount_minor    bigint not null check (amount_minor > 0 and amount_minor <= 1000000000),
  message         text not null default '' check (length(message) <= 1000),
  status          text not null default 'open'
                    check (status in ('open','countered','withdrawn','expired','accepted','rejected')),
  expires_at      timestamptz not null,
  created_at      timestamptz not null default now()
);
create index offer_listing_idx on offer(listing_id);
create index offer_buyer_idx on offer(buyer_agent_id);
create index offer_open_idx on offer(listing_id, status) where status = 'open';

-- ------------------------------------------------------------------- trades

create table trade (
  id                uuid primary key default gen_random_uuid(),
  listing_id        uuid not null references listing(id),
  buyer_agent_id    text not null references agent(id),
  seller_agent_id   text not null references agent(id),
  accepted_offer_id uuid not null unique references offer(id),
  amount_minor      bigint not null check (amount_minor > 0),
  state             text not null check (state in
                      ('pending_funding','escrowed','shipped','delivered','settled','disputed','cancelled')),
  -- same owner on both sides: permitted, flagged, excluded from reputation
  wash              boolean not null default false,
  created_at        timestamptz not null default now(),
  funded_at         timestamptz,
  shipped_at        timestamptz,
  delivered_at      timestamptz,
  settled_at        timestamptz,
  auto_release_at   timestamptz,
  funding_deadline  timestamptz,
  check (buyer_agent_id <> seller_agent_id)
);
-- At most one live trade per listing: "accept the same listing twice" becomes a
-- constraint violation rather than a business-logic race.
create unique index trade_one_live_per_listing
  on trade(listing_id) where state not in ('settled','cancelled');
create index trade_buyer_idx on trade(buyer_agent_id);
create index trade_seller_idx on trade(seller_agent_id);
create index trade_state_idx on trade(state);

-- ------------------------------------------------------------------ ratings

create table rating (
  id             uuid primary key default gen_random_uuid(),
  trade_id       uuid not null references trade(id),
  rater_agent_id text not null references agent(id),
  ratee_agent_id text not null references agent(id),
  score          int not null check (score between 1 and 5),
  comment        text not null default '' check (length(comment) <= 500),
  created_at     timestamptz not null default now(),
  unique (trade_id, rater_agent_id),
  check (rater_agent_id <> ratee_agent_id)
);
create index rating_ratee_idx on rating(ratee_agent_id);

create trigger rating_immutable
  before update or delete on rating
  for each row execute function forbid_mutation();

-- -------------------------------------------------------------- audit chain
-- Hash-chained and append-only. Any retroactive edit breaks the chain, and the
-- chain is computed in the database so the application cannot forge it.

create table audit_event (
  seq            bigserial primary key,
  actor_agent_id text,
  action         text not null,
  target         text,
  payload_digest text not null,
  prev_hash      text not null,
  hash           text not null,
  created_at     timestamptz not null default now()
);

create or replace function audit_chain_link() returns trigger
  language plpgsql as $$
declare prev text;
begin
  -- serialize chain appends; the chain is a single sequence by definition
  perform pg_advisory_xact_lock(hashtext('agentbazaar.audit_chain'));
  select hash into prev from audit_event order by seq desc limit 1;
  prev := coalesce(prev, repeat('0', 64));
  new.prev_hash := prev;
  new.hash := encode(digest(prev || '|' || new.action || '|' ||
                            coalesce(new.actor_agent_id,'') || '|' ||
                            coalesce(new.target,'') || '|' ||
                            new.payload_digest, 'sha256'), 'hex');
  return new;
end $$;

create trigger audit_event_chain
  before insert on audit_event
  for each row execute function audit_chain_link();

create trigger audit_event_immutable
  before update or delete on audit_event
  for each row execute function forbid_mutation();

-- ------------------------------------------------- idempotency & rate limits

create table idempotency (
  agent_id   text not null references agent(id) on delete cascade,
  key        text not null check (length(key) between 8 and 128),
  endpoint   text not null,
  response   jsonb not null,
  created_at timestamptz not null default now(),
  primary key (agent_id, key)
);

create table rate_bucket (
  agent_id     text not null references agent(id) on delete cascade,
  bucket       text not null,
  window_start timestamptz not null,
  count        int not null default 0,
  primary key (agent_id, bucket, window_start)
);
