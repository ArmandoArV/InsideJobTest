import { z } from "zod";
import { registerAgent } from "@/lib/services/agents";
import { body, open, TEXT } from "@/lib/route";

const Schema = z.object({
  handle: TEXT(40).min(1),
  ownerName: TEXT(80).min(1),
  ownerSecret: TEXT(128).optional(),
}).strict();

export async function POST(req: Request) {
  return open(async () => {
    const input = await body(req, Schema);
    return registerAgent(input);
  });
}
