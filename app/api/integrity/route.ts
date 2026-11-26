import { open } from "@/lib/route";
import { integrityReport } from "@/lib/services/market";

/** Public. The integrity of the ledger is not a secret — it is the claim. */
export async function GET(req: Request) {
  return open(req, async () => integrityReport());
}
