import { authed } from "@/lib/route";
import { uuidParam } from "@/lib/route";
import { getTrade } from "@/lib/services/trades";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return authed(req, async (actor) => getTrade(actor.agentId, uuidParam((await ctx.params).id)));
}
