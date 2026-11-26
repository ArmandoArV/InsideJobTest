import { z } from "zod";
import { authed, body, TEXT } from "@/lib/route";
import { uuidParam } from "@/lib/route";
import { rateTrade } from "@/lib/services/trades";

const Schema = z.object({
  score: z.number().int().min(1).max(5),
  comment: TEXT(500).default(""),
}).strict();

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  return authed(req, async (actor) =>
    rateTrade(actor.agentId, uuidParam((await ctx.params).id), await body(req, Schema)));
}
