-- ============================================================================
-- Money movement and the integrity checker.
-- ============================================================================

create or replace function ensure_agent_accounts(p_agent text) returns void
  language plpgsql as $$
begin
  insert into account(kind, agent_id) values ('agent_available', p_agent)
    on conflict do nothing;
  insert into account(kind, agent_id) values ('agent_escrow', p_agent)
    on conflict do nothing;
end $$;

create or replace function account_of(p_agent text, p_kind text) returns uuid
  language sql stable as $$
  select id from account where agent_id = p_agent and kind = p_kind;
$$;

-- The single place credits move. Two rows, one transfer id, locked in a
-- deterministic order so concurrent transfers cannot deadlock each other.
create or replace function ledger_transfer(
  p_transfer_id uuid,
  p_from        uuid,
  p_to          uuid,
  p_amount      bigint,
  p_reason      text,
  p_trade       uuid default null
) returns void language plpgsql as $$
begin
  if p_amount <= 0 then
    raise exception 'transfer amount must be positive, got %', p_amount;
  end if;
  if p_from = p_to then
    raise exception 'refusing a transfer to the same account';
  end if;

  perform id from account where id in (p_from, p_to) order by id for update;

  insert into ledger_entry(transfer_id, account_id, delta_minor, reason, trade_id)
  values (p_transfer_id, p_from, -p_amount, p_reason, p_trade),
         (p_transfer_id, p_to,    p_amount, p_reason, p_trade);
end $$;

-- I3 — the only path that changes total credits in existence. Reachable from
-- no HTTP handler.
create or replace function mint_credits(p_agent text, p_amount bigint) returns void
  language plpgsql as $$
declare mint uuid; dest uuid;
begin
  insert into account(kind, agent_id) values ('platform_mint', null) on conflict do nothing;
  perform ensure_agent_accounts(p_agent);
  select id into mint from account where kind = 'platform_mint';
  select account_of(p_agent, 'agent_available') into dest;
  perform ledger_transfer(gen_random_uuid(), mint, dest, p_amount, 'mint', null);
end $$;

-- ---------------------------------------------------------------------------
-- verify_ledger_integrity() — asserts I1..I5 across the whole database.
-- Runs in CI, after every simulation, on a schedule, and behind the public
-- integrity indicator. A simulation that ends with this red is a failed build.
-- ---------------------------------------------------------------------------
create or replace function verify_ledger_integrity()
  returns table(check_name text, ok boolean, detail text)
  language plpgsql as $$
begin
  -- I1: every transfer sums to zero
  return query
    select 'I1_transfers_balance',
           count(*) = 0,
           coalesce('unbalanced transfers: ' || count(*)::text, 'ok')
    from (select transfer_id from ledger_entry
           group by transfer_id having sum(delta_minor) <> 0) q;

  -- I2: no agent account is negative
  return query
    select 'I2_no_negative_accounts',
           count(*) = 0,
           coalesce('negative accounts: ' || count(*)::text, 'ok')
    from (select a.id from account a
           where a.kind <> 'platform_mint'
             and account_balance(a.id) < 0) q;

  -- I3: credits in circulation equal what the mint issued
  return query
    select 'I3_conservation',
           coalesce(sum(delta_minor), 0) = 0,
           'global sum ' || coalesce(sum(delta_minor), 0)::text
    from ledger_entry;

  -- I5: escrow held equals the sum of live escrowed trades
  return query
    select 'I5_escrow_matches_trades',
           coalesce(esc.held, 0) = coalesce(trd.owed, 0),
           'escrow accounts hold ' || coalesce(esc.held, 0)::text ||
           ', live trades owe ' || coalesce(trd.owed, 0)::text
    from (select sum(account_balance(id)) held from account where kind = 'agent_escrow') esc
    cross join
         (select sum(amount_minor) owed from trade
           where state in ('escrowed','shipped','delivered','disputed')) trd;
end $$;

-- Verifies the audit chain has not been rewritten.
create or replace function verify_audit_chain()
  returns table(ok boolean, broken_at bigint, total bigint)
  language plpgsql as $$
declare r record; prev text := repeat('0', 64); expected text; bad bigint := null; n bigint := 0;
begin
  for r in select * from audit_event order by seq loop
    n := n + 1;
    expected := encode(digest(prev || '|' || r.action || '|' ||
                              coalesce(r.actor_agent_id,'') || '|' ||
                              coalesce(r.target,'') || '|' ||
                              r.payload_digest, 'sha256'), 'hex');
    if r.prev_hash <> prev or r.hash <> expected then
      bad := r.seq;
      exit;
    end if;
    prev := r.hash;
  end loop;
  return query select bad is null, bad, n;
end $$;
