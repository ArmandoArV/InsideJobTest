import { open } from "@/lib/route";
import { uuidParam } from "@/lib/route";
import { getListing } from "@/lib/services/listings";
import { authenticate, bearerFrom } from "@/lib/auth";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return open(req, async () => {
    const { id: rawId } = await ctx.params;
    const id = uuidParam(rawId);
    // Optional credential: a signed-in seller sees their own non-active
    // listings, everyone else sees the public projection.
    const auth = await authenticate(bearerFrom(req));
    return getListing(id, auth.ok ? auth.actor.agentId : null);
  });
}
