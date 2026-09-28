import { describe, expect, test } from "bun:test";
import {
  DEFAULT_MAX_RECONCILE_ATTEMPTS,
  DEFAULT_RATE_LIMIT_PER_MINUTE,
  DEFAULT_RECONCILE_AFTER_MS,
  allowanceFor,
  maxReconcileAttempts,
  rateLimitPerMinute,
  reconcileAfterMs,
  remainingAllowance,
} from "../src/convex/vtuReconcileConfig";

/**
 * The defaults are the contract between an unconfigured provider row and the
 * sweep. They are asserted here rather than left to be read out of the source,
 * because every one of them is a number that changes behaviour when it moves:
 * a larger `reconcileAfterMs` leaves customers waiting longer, a smaller
 * `maxReconcileAttempts` escalates more rows to a human, and a larger
 * `rateLimitPerMinute` gets an account blocked.
 */
describe("reconciliation defaults resolve in a stated order", () => {
  describe("reconcileAfterMs", () => {
    test("falls back per status when the row says nothing", () => {
      expect(reconcileAfterMs(null, "processing")).toBe(60_000);
      expect(reconcileAfterMs(undefined, "unknown")).toBe(30_000);
      expect(reconcileAfterMs({}, "processing")).toBe(
        DEFAULT_RECONCILE_AFTER_MS.processing,
      );
    });

    test("unknown waits LESS than processing", () => {
      // Not cosmetic. `processing` means the provider took the request and is
      // working on it — the webhook is probably coming. `unknown` means the
      // transport gave us nothing, so the webhook is the only remaining
      // channel and there is no evidence the provider is doing anything.
      expect(DEFAULT_RECONCILE_AFTER_MS.unknown).toBeLessThan(
        DEFAULT_RECONCILE_AFTER_MS.processing,
      );
    });

    test("a row value overrides BOTH statuses", () => {
      const row = { reconcileAfterMs: 5_000 };
      expect(reconcileAfterMs(row, "processing")).toBe(5_000);
      expect(reconcileAfterMs(row, "unknown")).toBe(5_000);
    });

    test("a zero or negative override falls back rather than being honoured", () => {
      // `reconcileAfterMs: 0` would poll every row in every sweep, which is
      // precisely the budget-destroying behaviour slice 5 exists to prevent.
      expect(reconcileAfterMs({ reconcileAfterMs: 0 }, "processing")).toBe(60_000);
      expect(reconcileAfterMs({ reconcileAfterMs: -1 }, "unknown")).toBe(30_000);
      expect(reconcileAfterMs({ reconcileAfterMs: NaN }, "unknown")).toBe(30_000);
      expect(reconcileAfterMs({ reconcileAfterMs: Infinity }, "unknown")).toBe(30_000);
    });
  });

  describe("rateLimitPerMinute", () => {
    test("defaults to a generous 60 when the provider publishes no limit", () => {
      expect(DEFAULT_RATE_LIMIT_PER_MINUTE).toBe(60);
      expect(rateLimitPerMinute({})).toBe(60);
      expect(rateLimitPerMinute(null)).toBe(60);
    });

    test("an explicit fractional rate is preserved, not rounded", () => {
      // AidaPay's published 3-per-5-minutes. Rounding this to 1 would let a
      // sweep exceed the real budget; rounding to 0 would stop reconciliation.
      expect(rateLimitPerMinute({ rateLimitPerMinute: 0.6 })).toBe(0.6);
    });

    test("zero is HONOURED as 'stop polling this provider'", () => {
      expect(rateLimitPerMinute({ rateLimitPerMinute: 0 })).toBe(0);
    });

    test("a negative or non-finite rate falls back", () => {
      expect(rateLimitPerMinute({ rateLimitPerMinute: -5 })).toBe(60);
      expect(rateLimitPerMinute({ rateLimitPerMinute: NaN })).toBe(60);
    });
  });

  describe("maxReconcileAttempts", () => {
    test("defaults to 5", () => {
      expect(DEFAULT_MAX_RECONCILE_ATTEMPTS).toBe(5);
      expect(maxReconcileAttempts({})).toBe(5);
      expect(maxReconcileAttempts(null)).toBe(5);
    });

    test("a configured integer is used", () => {
      expect(maxReconcileAttempts({ maxReconcileAttempts: 12 })).toBe(12);
      expect(maxReconcileAttempts({ maxReconcileAttempts: 1 })).toBe(1);
    });

    test("0 is NOT honoured — it would escalate without ever asking", () => {
      // Unlike the rate, a zero here is not expressible intent: "never poll"
      // is already `rateLimitPerMinute: 0`, and 0 would silently escalate
      // every stuck transaction on first sighting.
      expect(maxReconcileAttempts({ maxReconcileAttempts: 0 })).toBe(5);
      expect(maxReconcileAttempts({ maxReconcileAttempts: -3 })).toBe(5);
      expect(maxReconcileAttempts({ maxReconcileAttempts: 2.5 })).toBe(5);
    });
  });
});

describe("the per-window budget never exceeds the provider's published limit", () => {
  const FIVE_MIN = 300_000;

  test("AidaPay's 0.6/min over a 5-minute sweep is exactly 3", () => {
    // The number this whole design is arranged around: AidaPay throttles
    // GET /transaction/{ref} to 3 per 5 minutes, and a 5-minute sweep spends
    // exactly that. Not fewer (reconciliation would be needlessly slow) and
    // not more (the account gets blocked).
    expect(allowanceFor(0.6, FIVE_MIN)).toBe(3);
  });

  test("it is FLOORED, never rounded up", () => {
    // Rounding up would exceed the provider's budget, and exceeding it is the
    // one outcome that is not merely suboptimal.
    expect(allowanceFor(0.75, FIVE_MIN)).toBe(3);
    expect(allowanceFor(0.99, 60_000)).toBe(0);
    expect(allowanceFor(1.9, FIVE_MIN)).toBe(9);
  });

  test("a sub-integer rate over a one-minute window polls nothing", () => {
    // Correct, and it looks like a bug in a log. Documented in
    // `allowanceFor`, and the reason the shipped window is 5 minutes: at
    // 0.6/min there is no budget for a call every minute.
    expect(allowanceFor(0.6, 60_000)).toBe(0);
  });

  test("a provider with no published limit gets the generous default", () => {
    expect(allowanceFor(DEFAULT_RATE_LIMIT_PER_MINUTE, FIVE_MIN)).toBe(300);
  });

  test("a zero rate yields no calls at all", () => {
    expect(allowanceFor(0, FIVE_MIN)).toBe(0);
  });

  test("a degenerate window or rate yields no calls rather than a huge one", () => {
    // Fails CLOSED. An unguarded floor of a divide-by-tiny would produce a
    // large allowance and blow the budget on a configuration mistake.
    expect(allowanceFor(60, 0)).toBe(0);
    expect(allowanceFor(60, -1)).toBe(0);
    expect(allowanceFor(NaN, FIVE_MIN)).toBe(0);
    expect(allowanceFor(60, NaN)).toBe(0);
  });

  test("what the window has already spent is subtracted", () => {
    // This is the pre-dispatch enforcement: the second sweep inside one
    // window sees the first sweep's spend and gets the remainder, so two
    // sweeps cannot each claim the full allowance.
    expect(remainingAllowance(0.6, FIVE_MIN, 0)).toBe(3);
    expect(remainingAllowance(0.6, FIVE_MIN, 1)).toBe(2);
    expect(remainingAllowance(0.6, FIVE_MIN, 3)).toBe(0);
  });

  test("an overspent window clamps to zero, never negative", () => {
    // A negative allowance would be treated as unbounded by a careless
    // `take(allowance)`, which is the worst possible failure direction.
    expect(remainingAllowance(0.6, FIVE_MIN, 4)).toBe(0);
    expect(remainingAllowance(0.6, FIVE_MIN, 999)).toBe(0);
    expect(remainingAllowance(0.6, FIVE_MIN, NaN)).toBe(3);
  });

  test("an hour of 5-minute sweeps averages out to the published rate", () => {
    // Twelve 5-minute windows in an hour, 3 calls each, is 36 calls/hour —
    // 0.6/min, the published rate exactly.
    const perSweep = allowanceFor(0.6, FIVE_MIN);
    expect(perSweep * 12).toBe(36);
    expect((perSweep * 12) / 60).toBeCloseTo(0.6, 10);
  });
});
