-- ============================================================================
-- Policy completion.
--
-- Found by the adversarial suite once RLS was genuinely in force: `account`
-- carried a read policy but no insert policy, so account creation failed for
-- every caller including the platform. Accounts are created only by the
-- platform path (registration and ensure_agent_accounts); no agent-authored
-- request reaches it.
-- ============================================================================

create policy account_insert on account for insert with check (is_platform());

-- Agents never rewrite an account row; only the ledger moves.
create policy account_no_update on account for update using (false);
