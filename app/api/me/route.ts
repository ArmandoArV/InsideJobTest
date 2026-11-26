import { authed } from "@/lib/route";
import { getSelf } from "@/lib/services/agents";
import { ApiError } from "@/lib/errors";

export async function GET(req: Request) {
  return authed(req, async (actor) => {
    const me = await getSelf(actor.agentId);
    if (!me) throw new ApiError("not_found");
    return me;
  });
}
