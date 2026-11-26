import { authed } from "@/lib/route";
import { uuidParam } from "@/lib/route";
import { getOffer } from "@/lib/services/offers";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return authed(req, async (actor) => getOffer(actor.agentId, uuidParam((await ctx.params).id)));
}
