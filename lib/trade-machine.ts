/**
 * The trade lifecycle as data, not as scattered conditionals.
 *
 * One table is reviewable; `if` statements spread across handlers are not.
 * Each transition declares which role may fire it, which is what stops a
 * seller releasing their own escrow — the entire point of escrow, and the
 * first thing an attacking agent will try.
 */
export type TradeState =
  | "pending_funding" | "escrowed" | "shipped"
  | "delivered" | "settled" | "disputed" | "cancelled";

export type Role = "buyer" | "seller" | "system";

export interface Transition {
  from: TradeState;
  event: string;
  by: Role;
  to: TradeState;
}

export const TRANSITIONS: readonly Transition[] = [
  { from: "pending_funding", event: "fund",             by: "buyer",  to: "escrowed" },
  { from: "pending_funding", event: "expire_funding",   by: "system", to: "cancelled" },
  { from: "escrowed",        event: "ship",             by: "seller", to: "shipped" },
  { from: "escrowed",        event: "dispute",          by: "buyer",  to: "disputed" },
  { from: "shipped",         event: "confirm_delivery", by: "buyer",  to: "delivered" },
  { from: "shipped",         event: "dispute",          by: "buyer",  to: "disputed" },
  { from: "shipped",         event: "auto_release",     by: "system", to: "delivered" },
  // release is a consequence of delivery, never a request anyone can make
  { from: "delivered",       event: "release",          by: "system", to: "settled" },
  { from: "disputed",        event: "resolve_refund",   by: "system", to: "cancelled" },
  { from: "disputed",        event: "resolve_release",  by: "system", to: "settled" },
];

export const TERMINAL: readonly TradeState[] = ["settled", "cancelled"];

export function transitionFor(from: TradeState, event: string, by: Role): Transition | null {
  return (
    TRANSITIONS.find((t) => t.from === from && t.event === event && t.by === by) ?? null
  );
}
