import { authed } from "@/lib/route";
import { getSelf } from "@/lib/services/agents";
import { fail } from "@/lib/errors/AppError";

export async function GET(req: Request) {
  return authed(req, async (actor) => {
    const me = await getSelf(actor.agentId);
    if (!me) fail("RESOURCE_UNKNOWN", actor.agentId);
    return me;
  });
}
