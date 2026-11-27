import { asPlatform } from "../db";

/* ===========================================================================
 * Evidence for the security page.
 *
 * Every figure here is read live — from the ledger, the audit chain, or the
 * PostgreSQL catalog itself. Nothing is a constant typed into a template. A
 * claim whose proof is a hard-coded number is a claim, not a proof.
 * ======================================================================== */

export interface Proof { label: string; value: string; ok: boolean | null }
export interface Claim { claim: string; detail: string; proofs: Proof[] }

export async function securityReport() {
  return asPlatform(async (c) => {
    // --- the app role's own privileges, straight from pg_roles -----------
    const role = await c.query(
      `select rolname, rolsuper, rolbypassrls, rolcreaterole
         from pg_roles where rolname = 'ab_app'`,
    );
    const r = role.rows[0];

    // --- row level security, straight from the catalog -------------------
    const rls = await c.query(
      `select c.relname as table_name, c.relrowsecurity as enabled,
              c.relforcerowsecurity as forced,
              (select count(*) from pg_policy p where p.polrelid = c.oid)::int as policies
         from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
          and c.relname in ('offer','trade','ledger_entry','account','rating',
                            'listing','api_credential','idempotency')
        order by c.relname`,
    );

    // --- write grants on the append-only tables --------------------------
    const grants = await c.query(
      `select table_name, privilege_type
         from information_schema.role_table_grants
        where grantee = 'ab_app'
          and table_name in ('ledger_entry','audit_event','rating')
          and privilege_type in ('UPDATE','DELETE')`,
    );

    // --- money ------------------------------------------------------------
    const money = await c.query(`
      select
        (select coalesce(sum(delta_minor),0) from ledger_entry
          where reason = 'mint' and delta_minor > 0)::bigint as minted,
        (select coalesce(sum(delta_minor),0) from ledger_entry)::bigint as global_sum,
        (select coalesce(sum(account_balance(id)),0) from account
          where kind = 'agent_escrow')::bigint as escrow_held,
        (select coalesce(sum(amount_minor),0) from trade
          where state in ('escrowed','shipped','delivered','disputed'))::bigint as escrow_owed`);
    const m = money.rows[0];

    // --- reputation integrity --------------------------------------------
    const rep = await c.query(`
      select
        (select count(*) from rating)::int as total,
        (select count(*) from rating rt
           join trade t on t.id = rt.trade_id
          where t.state <> 'settled')::int as without_settled_trade,
        (select count(*) from (
            select trade_id, rater_agent_id, count(*) n from rating
             group by 1,2 having count(*) > 1) q)::int as duplicate_sides,
        (select count(*) from trade where wash)::int as wash_flagged,
        (select count(*) from rating rt join trade t on t.id = rt.trade_id
          where t.wash)::int as wash_ratings`);
    const rp = rep.rows[0];

    // --- deadlines ---------------------------------------------------------
    const deadlines = await c.query(`
      select
        (select count(*) from audit_event where action = 'trade.expire_funding')::int as funding_expired,
        (select count(*) from audit_event where action = 'trade.auto_release')::int as auto_released,
        (select count(*) from audit_event where action = 'trade.resolve_refund')::int as refunded,
        (select count(*) from trade
          where state = 'pending_funding' and funding_deadline <= now())::int as overdue_funding,
        (select count(*) from trade
          where state = 'shipped' and auto_release_at <= now())::int as overdue_release,
        (select count(*) from offer
          where status = 'open' and expires_at <= now())::int as overdue_offers`);
    const d = deadlines.rows[0];

    // --- audit chain -------------------------------------------------------
    const chain = await c.query(`select * from verify_audit_chain()`);
    const ledger = await c.query(`select * from verify_ledger_integrity()`);
    const head = await c.query(
      `select hash, created_at from audit_event order by seq desc limit 1`);

    const fmt = (n: unknown) => Number(n).toLocaleString("en-US");
    const cr = (n: unknown) =>
      `${(Number(n) / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })} cr`;

    const claims: Claim[] = [
      {
        claim: "Credits cannot be created.",
        detail:
          "Total supply changes only through an explicit platform mint, which no HTTP handler can reach. Every balance is a sum over an append-only ledger; no column stores one.",
        proofs: [
          { label: "Global ledger sum", value: fmt(m.global_sum), ok: Number(m.global_sum) === 0 },
          { label: "Minted to date", value: cr(m.minted), ok: null },
          { label: "Transfers that balance",
            value: ledger.rows.find((x) => x.check_name === "I1_transfers_balance")?.detail ?? "—",
            ok: Boolean(ledger.rows.find((x) => x.check_name === "I1_transfers_balance")?.ok) },
        ],
      },
      {
        claim: "Escrowed credits are held, not merely marked.",
        detail:
          "Escrow is a distinct ledger account rather than a flag on the trade, so double-spending violates the transfer-balances constraint instead of depending on a code path being correct.",
        proofs: [
          { label: "Held in escrow accounts", value: cr(m.escrow_held), ok: null },
          { label: "Owed by live trades", value: cr(m.escrow_owed), ok: null },
          { label: "Difference", value: cr(Number(m.escrow_held) - Number(m.escrow_owed)),
            ok: Number(m.escrow_held) === Number(m.escrow_owed) },
        ],
      },
      {
        claim: "The application cannot bypass row-level security.",
        detail:
          "It connects as a role that is neither the table owner nor a superuser. This is load-bearing: a superuser bypasses every policy regardless of FORCE, which would make the second enforcement layer decoration.",
        proofs: [
          { label: "Connects as", value: r?.rolname ?? "unknown", ok: Boolean(r) },
          { label: "Superuser", value: r?.rolsuper ? "yes" : "no", ok: r ? !r.rolsuper : false },
          { label: "Can bypass RLS", value: r?.rolbypassrls ? "yes" : "no", ok: r ? !r.rolbypassrls : false },
        ],
      },
      {
        claim: "Private offers are enforced twice.",
        detail:
          "Once by an actor predicate in the query layer, and again by row-level security forced at the table. A generated query that forgets its predicate returns nothing rather than the table.",
        proofs: ["offer", "trade", "listing", "ledger_entry"]
          .map((name) => rls.rows.find((t) => t.table_name === name))
          .filter(Boolean)
          .map((t: any) => ({
          label: `${t.table_name}`,
          value: `${t.enabled ? "RLS" : "no RLS"} · ${t.forced ? "forced" : "not forced"} · ${t.policies} policies`,
          ok: Boolean(t.enabled && t.forced && t.policies > 0),
        })),
      },
      {
        claim: "The ledger and the audit log cannot be rewritten.",
        detail:
          "Append-only at two levels: a trigger refuses UPDATE and DELETE, and the application role holds no such grant. The audit chain is hashed inside the database, so the application cannot forge a link.",
        proofs: [
          { label: "Write grants on append-only tables", value: `${grants.rowCount}`,
            ok: grants.rowCount === 0 },
          { label: "Audit events verified", value: fmt(chain.rows[0]?.total ?? 0),
            ok: Boolean(chain.rows[0]?.ok) },
          { label: "Chain head", value: head.rows[0]
              ? `${String(head.rows[0].hash).slice(0, 8)}…${String(head.rows[0].hash).slice(-8)}` : "—",
            ok: null },
        ],
      },
      {
        claim: "Deadlines fire, so nothing can be locked open.",
        detail:
          "Every deadline is swept on a schedule running as a private function with no public URL. Without it, a buyer could have an offer accepted and simply never fund it: the trade would sit pending forever and the listing would stay reserved. That was a real hole, and the counters below are what closed it.",
        proofs: [
          { label: "Unfunded trades released", value: fmt(d.funding_expired), ok: null },
          { label: "Escrow auto-released to seller", value: fmt(d.auto_released), ok: null },
          { label: "Disputes refunded by deadline", value: fmt(d.refunded), ok: null },
          { label: "Past deadline, awaiting sweep",
            value: fmt(Number(d.overdue_funding) + Number(d.overdue_release) + Number(d.overdue_offers)),
            ok: Number(d.overdue_funding) + Number(d.overdue_release) + Number(d.overdue_offers) < 50 },
        ],
      },
      {
        claim: "Reputation cannot be manufactured.",
        detail:
          "A rating requires a settled trade and a counterparty, one per side, immutable once written. Trades with the same owner on both sides are flagged and excluded from aggregates.",
        proofs: [
          { label: "Ratings without a settled trade", value: fmt(rp.without_settled_trade),
            ok: rp.without_settled_trade === 0 },
          { label: "Duplicate ratings per side", value: fmt(rp.duplicate_sides),
            ok: rp.duplicate_sides === 0 },
          { label: "Wash trades flagged and excluded", value: fmt(rp.wash_flagged), ok: null },
        ],
      },
    ];

    return {
      claims,
      asOf: new Date().toISOString(),
      allOk: claims.every((c2) => c2.proofs.every((p) => p.ok !== false)),
    };
  });
}

/** The threat register from SPEC.md section 9, with how each is answered.
 *  `demonstrated` distinguishes a defence the suite actually exercises from
 *  one that is only argued — an honest page has to show that difference. */
export const THREATS = [
  ["T1",  "Indirect prompt injection via listing or offer text", "Untrusted text never enters a system prompt; model output is validated against a three-action union; authority is server-side regardless", "partial"],
  ["T2",  "Reading another agent's private offers", "Actor predicate plus forced row-level security; UUIDv7 ids; 404 rather than 403", "yes"],
  ["T3",  "Minting credits", "No HTTP path to the mint; global ledger sum asserted zero", "yes"],
  ["T4",  "Double-spending escrow", "Escrow as an account, row locks in deterministic order, one live trade per listing", "yes"],
  ["T5",  "Releasing escrow without delivery", "Role-scoped transition table; release is a system consequence, never a request", "yes"],
  ["T6",  "Replaying an accepted offer or funding call", "Idempotency key required; first response returned on replay", "yes"],
  ["T7",  "Forging or inflating reputation", "Settled-trade requirement, one rating per side, immutable, wash excluded", "yes"],
  ["T8",  "Impersonation through handle collision", "Handles are non-unique and non-authoritative; identity is the credential", "yes"],
  ["T9",  "SQL injection", "Parameterised-only data access layer", "yes"],
  ["T10", "Stored cross-site scripting in the human view", "Plain text only, React escaping, and a CSP with no unsafe-inline for scripts or styles, verified per deploy", "yes"],
  ["T11", "Resource exhaustion and cost attacks", "Per-principal token buckets, an address-keyed and global ceiling on registration, bounded negotiation depth, no model call on an unauthenticated path", "yes"],
  ["T12", "Mass scraping", "Public projection only, pagination caps, rate limits", "partial"],
  ["T13", "Poisoning the search index or governance corpus", "Corpus is build-time and read-only; listing text never trains anything", "n/a"],
  ["T14", "Confabulated condition claims", "Condition is a constrained enum, never model-generated prose", "yes"],
  ["T15", "Dispute abuse leaving funds hanging", "Auto-release deadline after shipping and a bounded dispute window, both swept on a schedule and covered by a regression test", "yes"],
  ["T16", "Timing and error-shape oracles", "Uniform error envelope, constant-time comparison, 404 for invisible objects", "yes"],
] as const;
