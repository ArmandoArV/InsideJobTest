import { asPlatform } from "../db";
import { issueKey, macSecret } from "../auth";
import { randomBytes } from "node:crypto";
import { newAgentId, markFor } from "../ids";
import { audit } from "../audit";
import { ApiError } from "../errors";

const STARTING_CREDITS_MINOR = 10_000_000; // 100,000 cr

/**
 * Register an owner + agent + credential in one transaction and mint the
 * agent's starting balance. Runs as platform because it touches credentials
 * and the ledger; the only input that reaches the database is the handle,
 * which is cosmetic and bounded by a CHECK constraint.
 */
export async function registerAgent(input: {
  handle: string;
  ownerName: string;
  /** Present to enrol this agent under an existing owner. */
  ownerSecret?: string;
}) {
  return asPlatform(async (c) => {
    const agentId = newAgentId();
    const { prefix, token, mac } = issueKey();

    let ownerId: string;
    let issuedOwnerSecret: string | null = null;

    if (input.ownerSecret) {
      const found = await c.query(`select id from owner where secret_mac = $1`, [
        macSecret(input.ownerSecret),
      ]);
      // An unknown owner secret is "no such resource", not "wrong secret":
      // the refusal must not confirm that some other owner exists.
      if (!found.rows[0]) throw new ApiError("not_found");
      ownerId = found.rows[0].id;
    } else {
      const secret = randomBytes(32).toString("base64url");
      const owner = await c.query(
        `insert into owner(display_name, secret_mac) values ($1, $2) returning id`,
        [input.ownerName, macSecret(secret)],
      );
      ownerId = owner.rows[0].id;
      issuedOwnerSecret = secret;
    }

    await c.query(
      `insert into agent(id, owner_id, handle, mark) values ($1, $2, $3, $4)`,
      [agentId, ownerId, input.handle, markFor(agentId)],
    );
    await c.query(
      `insert into api_credential(agent_id, prefix, secret_mac) values ($1, $2, $3)`,
      [agentId, prefix, mac],
    );
    await c.query(`select mint_credits($1, $2)`, [agentId, STARTING_CREDITS_MINOR]);
    await audit(c, {
      actor: agentId,
      action: "agent.register",
      target: agentId,
      payload: { handle: input.handle },
    });

    // Both secrets are returned exactly once and never stored recoverably.
    return {
      agent: { id: agentId, handle: input.handle, mark: markFor(agentId) },
      apiKey: token,
      ...(issuedOwnerSecret ? { ownerSecret: issuedOwnerSecret } : {}),
      startingBalanceMinor: STARTING_CREDITS_MINOR,
    };
  });
}

export async function getSelf(agentId: string) {
  return asPlatform(async (c) => {
    const { rows } = await c.query(
      `select a.id, a.handle, a.mark, a.status, a.spend_cap_minor,
              account_balance(account_of(a.id,'agent_available')) as available_minor,
              account_balance(account_of(a.id,'agent_escrow'))    as escrow_minor
         from agent a where a.id = $1`,
      [agentId],
    );
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id,
      handle: r.handle,
      mark: r.mark,
      status: r.status,
      availableMinor: Number(r.available_minor ?? 0),
      escrowMinor: Number(r.escrow_minor ?? 0),
      spendCapMinor: Number(r.spend_cap_minor),
    };
  });
}
