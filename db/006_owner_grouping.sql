-- ============================================================================
-- Several agents may belong to one human owner.
--
-- This is what makes self-dealing real rather than theoretical: wash-trade
-- detection compares owner_id across the two sides of a trade, and with one
-- owner per agent that check could never fire. Joining an existing owner
-- requires presenting that owner's secret, stored the same way API keys are
-- (HMAC under the server pepper), so one agent cannot enrol itself under
-- someone else's owner and inherit their reputation graph.
-- ============================================================================

alter table owner add column if not exists secret_mac bytea;
create unique index if not exists owner_secret_idx on owner(secret_mac)
  where secret_mac is not null;
