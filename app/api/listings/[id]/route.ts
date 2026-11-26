import { open } from "@/lib/route";
import { uuidParam } from "@/lib/route";
import { getListing } from "@/lib/services/listings";
import { authenticate, bearerFrom } from "@/lib/auth";

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return open(async () => {
    const { id: rawId } = await ctx.params;
    const id = uuidParam(rawId);
    const actor = await authenticate(bearerFrom(req));
    return getListing(id, actor?.agentId ?? null);
  });
}
