/**
 * Reconciliation policy resolution — pure, no Convex, no Node.
 *
 * Every threshold the sweep needs is provider CONFIGURATION (see
 * `vtuSchema/providers.ts`): rate limits and staleness windows are properties
 * of the aggregator, exactly like `baseUrl`. This module turns a provider row
 * plus a transaction status into concrete numbers, and it is the only place
 * that knows what the defaults are.
 *
 * Pure and dependency-free on purpose: the sweep's arithmetic — especially the
 * budget, which is the difference between reconciling and getting an account
 * blocked — is testable without spinning up a Convex harness.
 */

/** Staleness thresholds, per transaction status. */
export const DEFAULT_RECONCILE_AFTER_MS = {
  /**
   * The provider accepted the request and has not sent a terminal webhook.
   * Usually resolves in seconds; a minute is a generous allowance before we
   * spend a poll on it.
   */
  processing: 60_000,
  /**
   * The transport gave us nothing, so the webhook is the ONLY remaining
   * channel — and it may never come. Shorter, because unlike `processing`
   * there is no evidence the provider is even working on it.
   */
  unknown: 30_000,
} as const;

/**
 * Generous, because it is the fallback for providers that publish no limits.
 * Providers WITH published limits set `rateLimitPerMinute` explicitly —
 * AidaPay is 0.6, and relying on that default for it would exhaust its
 * 3-per-5-minute budget in the first sweep.
 */
export const DEFAULT_RATE_LIMIT_PER_MINUTE = 60;

/** Polls before escalating to `unresolved` for a human. */
export const DEFAULT_MAX_RECONCILE_ATTEMPTS = 5;

/** The subset of a provider row this module reads. */
export interface ReconcilePolicySource {
  reconcileAfterMs?: number;
  rateLimitPerMinute?: number;
  maxReconcileAttempts?: number;
}

/** The statuses the sweep is allowed to poll, and therefore to delay. */
export type ReconcilePollableStatus = keyof typeof DEFAULT_RECONCILE_AFTER_MS;

/**
 * How long a row of this status may sit before it counts as stuck.
 *
 * Resolution order — the ROW WINS:
 *   1. `provider.reconcileAfterMs`, if it is a usable number
 *   2. the per-status default (processing 60s, unknown 30s)
 *
 * The row value overrides BOTH statuses deliberately. An operator who sets one
 * number for a provider should not have to work out which of two statuses
 * they meant, and a value that applied to only one of them would be a subtle
 * trap the day a provider's `unknown` rate spiked.
 *
 * A non-positive or non-finite override falls back rather than being honoured:
 * `reconcileAfterMs: 0` would poll every row in every sweep, which is exactly
 * the budget-destroying behaviour this slice exists to prevent, and it is far
 * more likely to be a typo than an intention.
 */
export function reconcileAfterMs(
  provider: ReconcilePolicySource | null | undefined,
  status: ReconcilePollableStatus,
): number {
  const override = provider?.reconcileAfterMs;
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return override;
  }
  return DEFAULT_RECONCILE_AFTER_MS[status];
}

/**
 * The provider's request budget per minute.
 *
 * A rate of 0 is HONOURED, not defaulted, because it is a meaningful operator
 * intent: "stop polling this provider". Negative and non-finite values fall
 * back, since neither means anything.
 */
export function rateLimitPerMinute(
  provider: ReconcilePolicySource | null | undefined,
): number {
  const value = provider?.rateLimitPerMinute;
  if (typeof value === "number" && Number.isFinite(value) && value >= 0) return value;
  return DEFAULT_RATE_LIMIT_PER_MINUTE;
}

/**
 * How many polls a transaction gets before it escalates.
 *
 * Must be at least 1. A 0 would escalate every stuck transaction on its first
 * sighting without ever asking the provider anything, which is not a
 * configuration an operator can reasonably want — "don't poll at all" is
 * already expressible as `rateLimitPerMinute: 0`.
 */
export function maxReconcileAttempts(
  provider: ReconcilePolicySource | null | undefined,
): number {
  const value = provider?.maxReconcileAttempts;
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Number.isInteger(value) &&
    value >= 1
  ) {
    return value;
  }
  return DEFAULT_MAX_RECONCILE_ATTEMPTS;
}

/**
 * How many calls a window of `windowMs` may spend at this rate.
 *
 *   floor(ratePerMinute * windowMs / 60_000)
 *
 * FLOORED, never rounded up. Rounding up would exceed the provider's published
 * budget, and exceeding it is the outcome that gets an account blocked —
 * AidaPay's limit is enforced on their side, so a sweep that overspends does
 * not merely misbehave, it takes the account down for every purchase.
 *
 * The consequences of flooring are correct and worth stating, because they
 * look like a bug in a log:
 *
 *   - AidaPay, 5-minute sweep: floor(0.6 * 5) = 3  -> exactly its budget.
 *   - AidaPay, 1-minute sweep: floor(0.6 * 1) = 0  -> polls NOTHING. At
 *     0.6/min there is no budget for a call every single minute, so such a
 *     sweep would make no calls at all, ever.
 *   - A provider with no published limit: floor(60 * 5) = 300.
 *
 * That second case is why the window is not simply "whatever the cron does".
 * The fractional remainder is DISCARDED, not accumulated: a window of
 * `windowMs` grants `floor(rate * windowMs / 60_000)` calls and forgets the
 * rest. Discarding is the conservative direction — it can only ever under-spend
 * the provider's budget, never exceed it. The shipped cron uses a 5-minute
 * window, where the remainder is exactly zero for AidaPay, so nothing is lost
 * in practice. Shrinking the window below ~100s is the setting that would
 * silently stop reconciliation at 0.6/min, which is why `windowMs` must stay
 * coupled to the cron interval.
 */
export function allowanceFor(ratePerMinute: number, windowMs: number): number {
  if (!Number.isFinite(ratePerMinute) || ratePerMinute <= 0) return 0;
  if (!Number.isFinite(windowMs) || windowMs <= 0) return 0;
  return Math.floor((ratePerMinute * windowMs) / 60_000);
}

/**
 * How many calls this sweep may still make, given what the window has spent.
 *
 * Clamped at zero so a window that has already overspent yields "make no
 * calls" rather than a negative allowance that some caller might treat as
 * unbounded.
 */
export function remainingAllowance(
  ratePerMinute: number,
  windowMs: number,
  callsAlreadyInWindow: number,
): number {
  const total = allowanceFor(ratePerMinute, windowMs);
  const spent = Number.isFinite(callsAlreadyInWindow) ? callsAlreadyInWindow : 0;
  return Math.max(0, total - spent);
}
