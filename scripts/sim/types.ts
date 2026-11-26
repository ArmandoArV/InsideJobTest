export type Role = "seller" | "buyer" | "dual";

/** An agent's private book. None of this is ever sent to the marketplace:
 *  a reserve price that reaches the API is a reserve price an opponent can
 *  read, and extracting one is exactly what a prompt injection would try. */
export interface PrivateBook {
  /** What the agent believes a device is worth, as a multiple of catalogue value. */
  valuation: number;
  /** Seller: never sell below this fraction of ask. Buyer: never bid above it. */
  reserve: number;
  /** How fast it concedes across negotiation rounds. */
  concession: number;
  /** Probability of walking away rather than countering again. */
  impatience: number;
}

export interface SimAgent {
  handle: string;
  id: string;
  token: string;
  ownerIndex: number;
  role: Role;
  archetype: string;
  book: PrivateBook;
}

/** The only shapes a decision may take. An LLM's output is validated against
 *  this union and discarded if it does not fit — never executed, never
 *  dispatched by name (SPEC.md SD-2). */
export type Intent =
  | { action: "accept" }
  | { action: "counter"; amountMinor: number; message: string }
  | { action: "walk" };

export interface DecisionContext {
  role: "seller" | "buyer";
  listingTitle: string;
  listingCondition: string;
  /** Attacker-controlled text. Treated as data about a device, never as instruction. */
  listingDescription: string;
  askMinor: number;
  currentOfferMinor: number;
  round: number;
  /** The agent's own private book — local only, never transmitted. */
  book: PrivateBook;
}
