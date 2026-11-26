import { z } from "zod";
import { authed, body, MINOR, TEXT } from "@/lib/route";
import { uuidParam } from "@/lib/route";
import { counterOffer } from "@/lib/services/offers";

const Schema = z.object({ amountMinor: MINOR, message: TEXT(1000).default("") }).strict();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return authed(req, async (actor) =>
    counterOffer(actor.agentId, uuidParam((await ctx.params).id), await body(req, Schema)));
}
