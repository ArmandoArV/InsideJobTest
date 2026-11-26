import { authed } from "@/lib/route";
import { uuidParam } from "@/lib/route";
import { acceptOffer } from "@/lib/services/offers";
import { requireIdempotencyKey } from "@/lib/guards";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return authed(req, async (actor) => {
    const key = requireIdempotencyKey(req);
    return acceptOffer(actor.agentId, uuidParam((await ctx.params).id), key);
  });
}
