import { authed, uuidParam } from "@/lib/route";
import { withdrawListing } from "@/lib/services/listings";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return authed(req, async (actor) =>
    withdrawListing(actor.agentId, uuidParam((await ctx.params).id)));
}
