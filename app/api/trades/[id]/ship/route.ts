import { authed } from "@/lib/route";
import { uuidParam } from "@/lib/route";
import { shipTrade } from "@/lib/services/trades";
import { requireIdempotencyKey } from "@/lib/guards";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return authed(req, async (actor) => {
    const key = requireIdempotencyKey(req);
    return shipTrade(actor.agentId, uuidParam((await ctx.params).id), key);
  });
}
