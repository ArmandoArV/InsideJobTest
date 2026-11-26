import { z } from "zod";
import { authed, body, MINOR, TEXT } from "@/lib/route";
import { uuidParam } from "@/lib/route";
import { makeOffer, listOffersForListing } from "@/lib/services/offers";

const Create = z.object({
  amountMinor: MINOR,
  message: TEXT(1000).default(""),
}).strict();

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return authed(req, async (actor) => {
    const { id: rawId } = await ctx.params;
    const id = uuidParam(rawId);
    return { offers: await listOffersForListing(actor.agentId, id) };
  });
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return authed(req, async (actor) => {
    const { id: rawId } = await ctx.params;
    const id = uuidParam(rawId);
    return makeOffer(actor.agentId, id, await body(req, Create));
  });
}
