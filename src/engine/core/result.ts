/**
 * Explicit success / error results. Expected failures (bad input, illegal
 * transitions, unreachable goals) are values, never silent no-ops.
 * Programming errors (broken invariants) throw instead.
 */
export type EngineErrorCode =
  | "invalid-coordinates"
  | "not-traversable"
  | "unknown-scenario"
  | "unknown-robot"
  | "unknown-mission"
  | "unknown-package"
  | "unknown-station"
  | "unknown-closure"
  | "invalid-station-kind"
  | "same-station"
  | "station-closed"
  | "cell-not-closable"
  | "already-closed"
  | "empty-closure"
  | "invalid-mission-transition"
  | "invalid-robot-transition"
  | "invalid-custody-transition"
  | "custody-conflict"
  | "robot-not-at-station"
  | "robot-unavailable"
  | "already-running"
  | "not-running"
  | "invalid-tick"
  | "invalid-priority"
  | "no-path";

export interface EngineError {
  readonly code: EngineErrorCode;
  readonly message: string;
}

export type Result<T = void> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: EngineError };

export const ok = <T = void>(value?: T): Result<T> => ({ ok: true, value: value as T });

export const err = <T = never>(code: EngineErrorCode, message: string): Result<T> => ({
  ok: false,
  error: { code, message },
});

/** Thrown when a safety invariant is violated. Indicates an engine bug. */
export class InvariantViolation extends Error {
  constructor(
    readonly tick: number,
    readonly violations: readonly string[],
  ) {
    super(`Invariant violation at tick ${tick}:\n- ${violations.join("\n- ")}`);
    this.name = "InvariantViolation";
  }
}
