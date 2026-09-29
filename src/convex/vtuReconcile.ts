/**
 * Reconciliation data access — the V8 half of slice 5.
 *
 * The sweep itself is a Node action (it opens credentials and calls
 * `adapter.verify`), so everything it needs from the database lives here as
 * ordinary queries and mutations: candidate selection, the atomic budget
 * reservation, the per-poll attempt counter, and the sweep summary.
 *
 * Split from the action for the same reason `vtuProviderConfig` is split from
 * `vtuProviderCall`: the V8 half is exercisable by `convex-test` on its own,
 * and it cannot decrypt anything even by accident.
 *
 * ── Why candidate selection reads a window, not a threshold ──────────
 *
 * The staleness threshold is per-provider policy (`reconcileAfterMs`), but the
 * index is on `(status, updatedAt)` and knows nothing about provider rows. So
 * the query takes every row of a pollable status that has aged at all, and the
 * ACTION applies the provider's threshold afterwards. Reading only what the
 * index can decide and refining against policy in one pass is the difference
 * between an indexed range scan and a table scan with `.filter()`, which is
 * forbidden.
 */

import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";
import { effectiveProvider } from "./vtuServiceRouting";
import type { ReconcilePolicySource } from "./vtuReconcileConfig";
import {
  DEFAULT_DISPATCH_WINDOW_MS,
  rateLimitPerMinute,
  remainingAllowance,
} from "./vtuReconcileConfig";

/**
 * Per status, per sweep. Bounded rather than `.collect()`: a stuck-transaction
 * backlog that outgrows this is a provider incident, and the right response is
 * the next sweep, not one action that reads the whole table into memory.
 */
const MAX_CANDIDATES_PER_STATUS = 100;

/** The provider policy carried back for the action's own arithmetic. */
export type ProviderReconcilePolicy = ReconcilePolicySource;

export type SweepCandidate = {
  transactionId: any;
  status: "pending" | "processing" | "unknown";
  updatedAt: number;
  /** Snapshot-derived — `routedProvider ?? provider ?? "pairgate"`. */
  provider: string;
  /** The reference to poll with. Absent means the provider cannot be asked. */
  providerReference?: string;
  reconcileAttempts: number;
};

/**
 * Every transaction the sweep might act on, oldest first per status.
 *
 * `pending` rows are cut off at the DISPATCH window because nothing was ever
 * sent to ask about — they are escalation candidates, not poll candidates. The
 * two dispatched statuses are cut off at `now` rather than at a default
 * threshold: a row whose provider override is SHORTER than the default must
 * still be reachable, and only the provider row knows the override.
 */
export const listSweepCandidates = internalQuery({
  args: { now: v.number() },
  handler: async (ctx, args) => {
    const read = async (status: SweepCandidate["status"], cutoff: number) => {
      const rows = await ctx.db
        .query("vtuTransactions")
        .withIndex("by_status_updatedAt", (q) =>
          q.eq("status", status).lt("updatedAt", cutoff),
        )
        .take(MAX_CANDIDATES_PER_STATUS);
      return rows.map((row) => ({
        transactionId: row._id,
        status: row.status as SweepCandidate["status"],
        updatedAt: row.updatedAt,
        provider: effectiveProvider(row),
        providerReference: row.providerReference,
        reconcileAttempts: row.reconcileAttempts ?? 0,
      }));
    };

    const candidates: SweepCandidate[] = [
      ...(await read("pending", args.now - DEFAULT_DISPATCH_WINDOW_MS)),
      ...(await read("processing", args.now)),
      ...(await read("unknown", args.now)),
    ];

    // One policy read per distinct provider, NOT per transaction: N stuck rows
    // on one provider is one row of configuration, and reading it N times is
    // the N+1 pattern this codebase forbids.
    const providers: Record<string, ProviderReconcilePolicy | null> = {};
    for (const name of new Set(candidates.map((c) => c.provider))) {
      const row = await ctx.db
        .query("vtuProviders")
        .withIndex("by_name", (q) => q.eq("name", name))
        .unique();
      providers[name] = row
        ? {
            reconcileAfterMs: row.reconcileAfterMs,
            rateLimitPerMinute: row.rateLimitPerMinute,
            maxReconcileAttempts: row.maxReconcileAttempts,
          }
        : null;
    }

    return { candidates, providers };
  },
});

// ─── Budget ─────────────────────────────────────────────────────────

export type ReserveResult =
  | { ok: true; granted: number }
  | { ok: false; reason: "provider_missing" };

/**
 * Reserve poll budget for one provider, ATOMICALLY, before any call is made.
 *
 * This is the enforcement point the slice's hardest constraint names: the
 * per-provider limit is spent by a read-modify-write on the provider row, not
 * by counting polls afterwards. Convex serialises mutations, so two overlapping
 * sweeps cannot both read "1 used" and both dispatch — the second one observes
 * the first one's committed counter.
 *
 * Reserving and then NOT dispatching (an adapter that throws, a credential
 * that will not open) spends budget we did not use. That is deliberate and in
 * the safe direction: it can only ever UNDER-spend the provider's published
 * limit, and under-spending costs a delayed reconciliation while overspending
 * costs a blocked account.
 *
 * Returns `granted`, never a rejection: "you may make 0 calls this window" is
 * a normal, expected outcome at 0.6/min, not an error.
 */
export const reserveReconcileBudget = internalMutation({
  args: {
    providerName: v.string(),
    requested: v.number(),
    sweepIntervalMs: v.number(),
  },
  handler: async (ctx, args): Promise<ReserveResult> => {
    const row = await ctx.db
      .query("vtuProviders")
      .withIndex("by_name", (q) => q.eq("name", args.providerName))
      .unique();
    if (!row) return { ok: false, reason: "provider_missing" };

    const requested = Math.max(0, Math.floor(args.requested));
    const now = Date.now();

    // A window is measured from its own start, so a missed or late sweep
    // cannot inherit a stale window that still looks current.
    let windowStart = row.reconcileWindowStartAt ?? 0;
    let spent = row.reconcileCallsInWindow ?? 0;
    if (now - windowStart >= args.sweepIntervalMs) {
      windowStart = now;
      spent = 0;
    }

    const remaining = remainingAllowance(
      rateLimitPerMinute(row),
      args.sweepIntervalMs,
      spent,
    );
    const granted = Math.min(requested, remaining);

    await ctx.db.patch(row._id, {
      reconcileWindowStartAt: windowStart,
      reconcileCallsInWindow: spent + granted,
    });

    return { ok: true, granted };
  },
});

// The floor rule itself is NOT restated here: `remainingAllowance` and
// `rateLimitPerMinute` live in `vtuReconcileConfig.ts` beside the defaults, so
// "never round up" is written in exactly one place.

// ─── Per-poll bookkeeping ───────────────────────────────────────────

export type AttemptResult =
  | { ok: true; attempts: number }
  | { ok: false; reason: "not_found" | "not_pollable" };

/**
 * Count a poll BEFORE it is dispatched.
 *
 * Incrementing first rather than after the call is the conservative ordering:
 * an action that dies between the reservation and the counter would otherwise
 * leave a transaction that WAS polled looking unpolled, and the next sweep
 * would spend a second call on it. Wasting an attempt on a crash is
 * recoverable; overspending a 3-per-5-minute budget is not.
 *
 * Refuses anything that is not `processing`/`unknown`, so a transaction the
 * webhook settled between candidate selection and this mutation stops here
 * instead of being polled and then no-oped.
 */
export const recordReconcileAttempt = internalMutation({
  args: { transactionId: v.id("vtuTransactions") },
  handler: async (ctx, args): Promise<AttemptResult> => {
    const tx = await ctx.db.get(args.transactionId);
    if (!tx) return { ok: false, reason: "not_found" };
    if (tx.status !== "processing" && tx.status !== "unknown") {
      return { ok: false, reason: "not_pollable" };
    }
    const attempts = (tx.reconcileAttempts ?? 0) + 1;
    await ctx.db.patch(args.transactionId, {
      reconcileAttempts: attempts,
      lastReconcileAt: Date.now(),
    });
    return { ok: true, attempts };
  },
});

/**
 * Record what a provider's sweep did, for the admin queue.
 *
 * Written once per provider per sweep, including when zero calls were made —
 * "attempted 0, 7 still pending" is exactly the observation that tells an
 * operator the budget is saturated rather than that reconciliation is broken.
 */
export const recordSweepOutcome = internalMutation({
  args: {
    providerName: v.string(),
    attempted: v.number(),
    resolved: v.number(),
    stillPending: v.number(),
  },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("vtuProviders")
      .withIndex("by_name", (q) => q.eq("name", args.providerName))
      .unique();
    if (!row) return { ok: false as const };
    await ctx.db.patch(row._id, {
      lastReconcileSweepAt: Date.now(),
      lastSweepAttempted: args.attempted,
      lastSweepResolved: args.resolved,
      lastSweepStillPending: args.stillPending,
    });
    return { ok: true as const };
  },
});
