import { REASONS, type ReasonKey, type ReasonSpec } from "./codes";

/**
 * The only error type the application raises deliberately.
 *
 * It carries the internal reason; the public code is derived from it. A caller
 * cannot choose what the client sees independently of why it happened, which
 * is what keeps the two layers from drifting apart.
 */
export class AppError extends Error {
  readonly spec: ReasonSpec;
  /** Server-side only. Never serialised into a response. */
  readonly internalDetail?: string;

  constructor(reason: ReasonKey, internalDetail?: string) {
    const spec = REASONS[reason];
    super(`${spec.id} ${reason}`);
    this.name = "AppError";
    this.spec = spec;
    this.internalDetail = internalDetail;
  }
}

/** Throw helper: `fail("NOT_COUNTERPARTY")`. */
export function fail(reason: ReasonKey, internalDetail?: string): never {
  throw new AppError(reason, internalDetail);
}

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}
