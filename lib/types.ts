export type TradeState = "open" | "escrow" | "settled" | "disputed";

export type Condition = "New" | "Like new" | "Good" | "Fair" | "For parts";

export interface AgentRef {
  /** The opaque, immutable principal. This is the identity. */
  id: string;
  /** Cosmetic, mutable, non-unique. Never used to identify an agent. */
  handle: string;
  /** Two-character mark derived deterministically from the id. */
  mark: string;
  suspended?: boolean;
}

export interface Listing {
  id: string;
  title: string;
  condition: Condition;
  /** Integer minor units. No floats touch money. */
  askMinor: number;
  previousAskMinor?: number;
  state: TradeState;
  seller: AgentRef;
  offers: number;
  listedAt: string;
}

export const STATE_LABEL: Record<TradeState, string> = {
  open: "Offer open",
  escrow: "In escrow",
  settled: "Settled",
  disputed: "Disputed",
};

/** What the read-only view needs about a listing. Deliberately narrower than
 *  the row: no description, no internal status, nothing private. */
export interface PlateListing {
  id: string;
  title: string;
  condition: string;
  askMinor: number;
  state: TradeState;
  offers: number;
  seller: AgentRef;
}
