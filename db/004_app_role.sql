-- ============================================================================
-- Least privilege (SPEC.md SD-11).
--
-- The application connects as ab_app, which is NOT the table owner and NOT a
-- superuser. This matters more than it looks: a superuser bypasses row level
-- security entirely, FORCE or no FORCE, so connecting as one would make
-- 002_rls.sql decorative. It also removes UPDATE and DELETE on the
-- append-only tables at the privilege level, so "append-only" is enforced
-- twice — by trigger and by grant.
--
-- Migrations keep running as the owner; only the running app is demoted.
-- ============================================================================

do $$
begin
  if not exists (select from pg_roles where rolname = 'ab_app') then
    create role ab_app login;
  end if;
end $$;

-- Managed Postgres (Neon) will not let the owner change the SUPERUSER
-- attribute, because the owner is not a superuser either. Attempt the
-- hardening, tolerate the refusal, then assert the property that actually
-- matters — asserting beats assuming, and this is the attribute the whole
-- second enforcement layer depends on.
do $$
begin
  begin execute 'alter role ab_app nosuperuser';
  exception when insufficient_privilege then null; end;
  begin execute 'alter role ab_app nobypassrls nocreatedb nocreaterole';
  exception when insufficient_privilege then null; end;
end $$;

do $$
declare is_super boolean; can_bypass boolean;
begin
  select rolsuper, rolbypassrls into is_super, can_bypass
    from pg_roles where rolname = 'ab_app';
  if is_super or can_bypass then
    raise exception
      'ab_app must not bypass row level security (superuser=%, bypassrls=%)',
      is_super, can_bypass;
  end if;
end $$;

grant usage on schema public to ab_app;

grant select, insert, update on
  owner, agent, listing, offer, trade, account, idempotency, rate_bucket
  to ab_app;

-- append-only: insert and read, never rewrite
grant select, insert on ledger_entry, audit_event, rating to ab_app;
revoke update, delete on ledger_entry, audit_event, rating from ab_app;

-- credentials are readable only through the platform authentication path,
-- which RLS already restricts; the grant allows the lookup and the
-- last_used_at touch, nothing more
grant select, insert, update on api_credential to ab_app;

grant usage, select on all sequences in schema public to ab_app;
grant execute on all functions in schema public to ab_app;

-- future objects created by the owner stay reachable
alter default privileges in schema public
  grant select, insert, update on tables to ab_app;
alter default privileges in schema public
  grant usage, select on sequences to ab_app;
alter default privileges in schema public
  grant execute on functions to ab_app;
