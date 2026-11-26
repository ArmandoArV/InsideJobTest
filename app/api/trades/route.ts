import { authed } from "@/lib/route";
import { listMyTrades } from "@/lib/services/trades";

export async function GET(req: Request) {
  return authed(req, async (actor) => ({ trades: await listMyTrades(actor.agentId) }));
}
