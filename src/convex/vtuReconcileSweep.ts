"use node";

/**
 * The reconciliation sweep — slice 5's job.
 *
 * Stuck transactions (`processing`, `unknown`, and a `pending` row that should
 * have been dispatched) get one of three fates here:
 *
 *   1. polled and settled, when the provider tells us what happened;
 *   2. escalated to `unresolved`, when we have exhausted the poll budget for
 *      that transaction or cannot ask the provider at all — a human decides,
 *      and the default is never to refund;
 *   3. left alone for this window, when the row is not stale yet or the
 *      provider's call budget is spent.
 *
 * ── The three rules this file exists to obey ──────────────────────────
 *
 * NO RE-ROUTING. The provider to ask comes from the transaction's
 * `routedProvider` snapshot (resolved by `effectiveProvider` in the V8 query),
 * never from the routing table, which may have been re-pointed since the
 * purchase was dispatched. Asking the wrong provider about a transaction is
 * worse than not asking: it burns a rate-limited call and gets an answer about
 * something else.
 *
 * BUDGET BEFORE DISPATCH. `reserveReconcileBudget` is a mutation that spends
 * the provider's allowance atomically, and nothing is sent until it returns
 * `granted > 0`. AidaPay allows 3 calls per 5 minutes; a sweep that counted
 * afterwards would blow that in one pass over a backlog of twenty and take the
 * account down for every purchase, not just reconciliation.
 *
 * ONE WRITER. Terminal states are written only through `settleTransaction`, so
 * a webhook landing in the same tick as a poll settles once — the second caller
 * sees the terminal status and no-ops. This file never patches a status
 * directly.
 *
 * It is a Node action because `adapter.verify` performs outbound HTTP and the
 * credential layer opens sealed material; neither can happen in the V8 runtime.
 * Everything it reads and writes sits in `vtuReconcile.ts`.
 */

import { internalAction } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import { openForReconcile } from "./vtuProviderCall";
import { getAdapter } from "./vtuRegistry";
import type { ResolvedCall } from "./vtuProviderCall";
import type { ProviderPurchaseResult, VtuProviderAdapter } from "./vtuShared";
import type { SweepCandidate } from "./vtuReconcile";
import type { ReconcilePolicySource } from "./vtuReconcileConfig";
import {
  DEFAULT_SWEEP_INTERVAL_MS,
  maxReconcileAttempts,
  reconcileAfterMs,
} from "./vtuReconcileConfig";

export type ProviderSweepReport = {
  provider: string;
  /** Rows moved to `unresolved` this sweep. Never counted as settled. */
  escalated: number;
  /** Polls actually dispatched — what consumes the budget. */
  attempted: number;
  /** Rows that reached `confirmed` or `reversed`: money settled. */
  resolved: number;
  /** Rows still awaiting a verdict when the sweep finished. */
  stillPending: number;
  /**
   * Why this provider did less than it could have. `null` means the sweep ran
   * as far as its candidates allowed.
   */
  skipped:
    | null
    | "no_adapter"
    | "provider_missing"
    | "budget_exhausted"
    | "credential_unavailable";
};

export type SweepReport = {
  sweptAt: number;
  windowMs: number;
  providers: ProviderSweepReport[];
};

/** Escalate one transaction to a human. Never refunds, by construction. */
async function escalate(
  ctx: any,
  transactionId: any,
  unresolvedReason: "max_attempts_exceeded" | "provider_unreachable" | "never_dispatched",
  message: string,
  raw?: unknown,
): Promise<boolean> {
  const settled = await ctx.runMutation(internal.vtuInternal.settleTransaction, {
    transactionId,
    source: "reconciliation",
    verdict: { status: "unresolved", unresolvedReason, message, raw },
  });
  return settled.settled === true;
}

/**
 * Turn one provider's candidate rows into polls, escalations, and silence.
 *
 * Ordered deliberately: everything that does NOT spend budget runs first
 * (staleness, attempt limits, missing references), then the adapter check,
 * then the reservation, and only then any HTTP.
 */
async function sweepProvider(
  ctx: any,
  providerName: string,
  rows: SweepCandidate[],
  policy: ReconcilePolicySource | null,
  windowMs: number,
  now: number,
): Promise<ProviderSweepReport> {
  const report: ProviderSweepReport = {
    provider: providerName,
    escalated: 0,
    attempted: 0,
    resolved: 0,
    stillPending: 0,
    skipped: null,
  };

  // ── 1. Never-dispatched rows ──────────────────────────────────────
  // Nothing was sent, so there is nothing to poll: the query only hands these
  // over once they are past the dispatch window. Escalated rather than
  // refunded, because a `pending` row that aged out is a defect in OUR dispatch
  // path — cleaning it up silently would hide the pattern.
  const pollable: SweepCandidate[] = [];
  for (const row of rows) {
    if (row.status !== "pending") {
      pollable.push(row);
      continue;
    }
    const escalatedOk = await escalate(
      ctx,
      row.transactionId,
      "never_dispatched",
      "This purchase never reached a provider: it sat in `pending` past the dispatch window, so no HTTP call was made. Points remain debited until an operator confirms delivery or refunds.",
      { status: row.status, updatedAt: row.updatedAt },
    );
    if (escalatedOk) report.escalated++;
  }

  // ── 2. Staleness, by the provider's own policy ────────────────────
  // The index cannot see provider rows, so the row's `reconcileAfterMs` is
  // applied here — after selection, before anything is spent. A row that is
  // simply young is not part of this sweep at all: it is neither polled nor
  // escalated nor counted.
  const isStale = (row: SweepCandidate) =>
    now - row.updatedAt >= reconcileAfterMs(policy, row.status as "processing" | "unknown");
  const stale = pollable.filter(isStale);
  const fresh = pollable.length - stale.length;

  // ── 3. Everything that can be decided without a network call ──────
  const attemptLimit = maxReconcileAttempts(policy);
  const toPoll: SweepCandidate[] = [];
  for (const row of stale) {
    if (row.reconcileAttempts >= attemptLimit) {
      // Polled the maximum number of times with no terminal verdict. NOT
      // reversed: the provider never confirmed failure, so refunding would
      // hand the customer both the top-up and their points back.
      const escalatedOk = await escalate(
        ctx,
        row.transactionId,
        "max_attempts_exceeded",
        `Reconciliation polled this transaction ${row.reconcileAttempts} times without a terminal verdict. Awaiting an operator decision.`,
        { attempts: row.reconcileAttempts, provider: providerName },
      );
      if (escalatedOk) report.escalated++;
    } else if (!row.providerReference) {
      // We have nothing to ask about. `verify` takes the provider's own
      // reference, and a row that never received one cannot be joined to the
      // provider's records — guessing with our internal id would spend a
      // rate-limited call on a lookup that cannot succeed.
      const escalatedOk = await escalate(
        ctx,
        row.transactionId,
        "provider_unreachable",
        "The provider returned no reference for this transaction, so it cannot be asked what happened to it. Awaiting an operator decision.",
        { provider: providerName, attempts: row.reconcileAttempts },
      );
      if (escalatedOk) report.escalated++;
    } else {
      toPoll.push(row);
    }
  }

  if (toPoll.length === 0) {
    await ctx.runMutation(internal.vtuReconcile.recordSweepOutcome, {
      providerName,
      attempted: 0,
      resolved: 0,
      stillPending: fresh,
    });
    report.stillPending = fresh;
    return report;
  }

  // ── 4. Adapter availability, BEFORE the reservation ───────────────
  // Spending budget and then discovering we have no way to spend it would
  // under-use a scarce allowance. Also the fail-closed rule: an unknown
  // provider name escalates its rows instead of throwing, so a provider row
  // deleted mid-flight cannot crash the sweep or leave rows stuck.
  if (!getAdapter(providerName)) {
    for (const row of toPoll) {
      const escalatedOk = await escalate(
        ctx,
        row.transactionId,
        "provider_unreachable",
        `No adapter is registered for provider "${providerName}", so its transactions cannot be verified. Awaiting an operator decision.`,
        { provider: providerName, attempts: row.reconcileAttempts },
      );
      if (escalatedOk) report.escalated++;
    }
    await ctx.runMutation(internal.vtuReconcile.recordSweepOutcome, {
      providerName,
      attempted: 0,
      resolved: 0,
      stillPending: fresh,
    });
    report.skipped = "no_adapter";
    report.stillPending = fresh;
    return report;
  }

  // ── 5. The reservation ────────────────────────────────────────────
  const reserved = await ctx.runMutation(internal.vtuReconcile.reserveReconcileBudget, {
    providerName,
    requested: toPoll.length,
    sweepIntervalMs: windowMs,
  });

  if (!reserved.ok) {
    for (const row of toPoll) {
      const escalatedOk = await escalate(
        ctx,
        row.transactionId,
        "provider_unreachable",
        `The provider row for "${providerName}" no longer exists, so its transactions cannot be verified. Awaiting an operator decision.`,
        { attempts: row.reconcileAttempts },
      );
      if (escalatedOk) report.escalated++;
    }
    report.skipped = "provider_missing";
    report.stillPending = fresh;
    return report;
  }

  if (reserved.granted === 0) {
    // The normal outcome at 0.6/min with a backlog. Nothing is polled, nothing
    // is escalated, and the rows wait for the next window — which is exactly
    // what "honour the budget" means when the budget is already spent.
    await ctx.runMutation(internal.vtuReconcile.recordSweepOutcome, {
      providerName,
      attempted: 0,
      resolved: 0,
      stillPending: fresh + toPoll.length,
    });
    report.skipped = "budget_exhausted";
    report.stillPending = fresh + toPoll.length;
    return report;
  }

  // ── 6. Credentials ────────────────────────────────────────────────
  const call: ResolvedCall = await openForReconcile(ctx, providerName);
  if (!call.ok) {
    for (const row of toPoll) {
      const escalatedOk = await escalate(
        ctx,
        row.transactionId,
        "provider_unreachable",
        `Provider "${providerName}" cannot be reached for reconciliation (${call.code}). Awaiting an operator decision.`,
        { provider: providerName, code: call.code },
      );
      if (escalatedOk) report.escalated++;
    }
    await ctx.runMutation(internal.vtuReconcile.recordSweepOutcome, {
      providerName,
      attempted: 0,
      resolved: 0,
      stillPending: fresh,
    });
    report.skipped = "credential_unavailable";
    report.stillPending = fresh;
    return report;
  }

  // ── 7. Dispatch, oldest first ─────────────────────────────────────
  const selected = [...toPoll]
    .sort((a, b) => a.updatedAt - b.updatedAt)
    .slice(0, reserved.granted);
  const unselected = toPoll.length - selected.length;
  let polledUnknown = 0;

  for (const row of selected) {
    // Counted BEFORE the call: an action that dies mid-poll leaves a row that
    // looks unpolled, and the next sweep would spend a second call on it.
    const counted = await ctx.runMutation(internal.vtuReconcile.recordReconcileAttempt, {
      transactionId: row.transactionId,
    });
    if (!counted.ok) continue; // settled by a webhook since selection

    report.attempted++;

    let outcome: ProviderPurchaseResult;
    try {
      outcome = await (call.adapter as VtuProviderAdapter).verify(
        row.providerReference as string,
        call.opts,
      );
    } catch (error) {
      // A thrown transport error is not a verdict. Same three-state rule as a
      // timeout: we do not know, so the row keeps waiting and the attempt is
      // already counted.
      const message = error instanceof Error ? error.message : "Reconciliation poll failed";
      outcome = { status: "unknown", message, raw: { thrown: message } };
    }

    if (outcome.status === "unknown") {
      polledUnknown++;
      continue;
    }

    const settled = await ctx.runMutation(internal.vtuInternal.settleTransaction, {
      transactionId: row.transactionId,
      source: "reconciliation",
      verdict:
        outcome.status === "success"
          ? {
              status: "confirmed",
              providerReference: outcome.providerReference,
              costNgn: outcome.costNgn,
              raw: outcome.raw,
            }
          : {
              // The provider explicitly said no, so this reversal is confirmed
              // rather than assumed — the one case the sweep may refund for.
              // `reconciliation` records that WE found out by polling rather
              // than by webhook; the customer-visible outcome is identical.
              status: "failed",
              reversalReason: "reconciliation",
              code: outcome.code,
              message: outcome.message,
              providerReference: outcome.providerReference,
              raw: outcome.raw,
            },
    });

    // `settled: false` here almost always means the webhook won the race and
    // settled the row first — the outcome we want, and not ours to count.
    if (settled.settled) report.resolved++;
  }

  report.stillPending = fresh + unselected + polledUnknown;

  await ctx.runMutation(internal.vtuReconcile.recordSweepOutcome, {
    providerName,
    attempted: report.attempted,
    resolved: report.resolved,
    stillPending: report.stillPending,
  });

  return report;
}

/**
 * One sweep.
 *
 * `sweepIntervalMs` is an argument rather than a constant so the budget window
 * can be narrowed in tests; the shipped cron passes the default (5 minutes),
 * which is both Convex's minimum interval and the window in which AidaPay's
 * published rate spends exactly its published allowance.
 *
 * Idempotent by construction: a second sweep inside the same window reserves
 * zero calls, and a transaction already settled by the first one is either not
 * a candidate any more or is refused by `recordReconcileAttempt` /
 * `settleTransaction`.
 */
export const runReconcileSweep = internalAction({
  args: { sweepIntervalMs: v.optional(v.number()) },
  handler: async (ctx, args): Promise<SweepReport> => {
    const windowMs = args.sweepIntervalMs ?? DEFAULT_SWEEP_INTERVAL_MS;
    const now = Date.now();

    const { candidates, providers } = await ctx.runQuery(
      internal.vtuReconcile.listSweepCandidates,
      { now },
    );

    // Group once, by the snapshot-derived provider. Order is preserved so the
    // oldest candidate of each provider stays at the front of its own list.
    const grouped = new Map<string, SweepCandidate[]>();
    for (const row of candidates as SweepCandidate[]) {
      const existing = grouped.get(row.provider);
      if (existing) existing.push(row);
      else grouped.set(row.provider, [row]);
    }

    const reports: ProviderSweepReport[] = [];
    for (const [providerName, rows] of grouped) {
      reports.push(
        await sweepProvider(
          ctx,
          providerName,
          rows,
          providers[providerName] ?? null,
          windowMs,
          now,
        ),
      );
    }

    return { sweptAt: now, windowMs, providers: reports };
  },
});
