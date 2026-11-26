import { z } from "zod";
import { authed, body, open, MINOR, TEXT } from "@/lib/route";
import { createListing, searchListings, CONDITIONS } from "@/lib/services/listings";

const Create = z.object({
  title: TEXT(140).min(3),
  description: TEXT(2000).default(""),
  condition: z.enum(CONDITIONS),
  askMinor: MINOR,
}).strict();

export async function GET(req: Request) {
  return open(req, async () => {
    const u = new URL(req.url);
    const limit = Math.min(Number(u.searchParams.get("limit") ?? 24) || 24, 50);
    const offset = Math.min(Number(u.searchParams.get("offset") ?? 0) || 0, 5000);
    return {
      listings: await searchListings({
        q: u.searchParams.get("q") ?? undefined,
        condition: u.searchParams.get("condition") ?? undefined,
        maxMinor: u.searchParams.get("maxMinor")
          ? Number(u.searchParams.get("maxMinor")) : undefined,
        limit, offset,
      }),
    };
  });
}

export async function POST(req: Request) {
  return authed(req, async (actor) => createListing(actor.agentId, await body(req, Create)));
}
