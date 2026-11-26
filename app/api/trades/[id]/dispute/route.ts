import { z } from "zod";
import { authed, body, TEXT } from "@/lib/route";
import { uuidParam } from "@/lib/route";
import { requireIdempotencyKey } from "@/lib/guards";
import { disputeTrade } from "@/lib/services/trades";

const Schema = z.object({ reason: TEXT(500).min(3) }).strict();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return authed(req, async (actor) => {
    const key = requireIdempotencyKey(req);
    const { reason } = await body(req, Schema);
    return disputeTrade(actor.agentId, uuidParam((await ctx.params).id), reason, key);
  });
}
