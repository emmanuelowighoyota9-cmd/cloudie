/**
 * VTU money path and transitions — internal only.
 *
 * Nothing here is public. The client cannot begin a purchase, advance a
 * status, refund itself, or set a price; it can only ask the action in
 * `vtuHttp.ts` to run a purchase, and that action resolves the caller and
 * passes `userId` explicitly.
 *
 * (A public mutation reads the caller from the auth context. An ACTION calling
 * a public mutation does NOT carry that context, so a purchase mutation
 * reachable from an action must be internal and take `userId` itself.)
 *
 * These live apart from `vtu.ts` for a second, concrete reason: a Convex
 * module that reaches for its OWN exports through the generated `internal`
 * API creates a self-referential type-inference cycle that collapses the
 * module — and everything importing it — to `any`.
 */

import { internalMutation, internalQuery } from "./_generated/server";
import { internal } from "./_generated/api";
import { query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { getAuthUserId } from "@convex-dev/auth/server";
import { sanitizeForLog } from "./vtuShared";
import type { VtuTransactionStatus } from "./vtuShared";
import {
  isValidRequestId,
  maskIdentifier,
  parseServiceCode,
  resolveVtuPointsCost,
  validatePhone,
  vtuLedgerPurchaseKey,
  vtuPurchaseKey,
  vtuRefundKey,
} from "../lib/vtu";
import { readPointRate } from "./pricing";

/** Purchases allowed per minute, per user. Fixed window in Convex, no Redis. */
export const PURCHASE_RATE_LIMIT = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

/** Shared with the public price queries in `vtu.ts`. */
export async function consumeRateLimit(
  ctx: { db: any },
  key: string,
  limit: number,
  windowMs: number,
): Promise<boolean> {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs) * windowMs;
  const row = await ctx.db
    .query("rateLimitBuckets")
    .withIndex("by_key_and_window", (q: any) =>
      q.eq("key", key).eq("windowStart", windowStart),
    )
    .first();
  if (!row) {
    await ctx.db.insert("rateLimitBuckets", { key, windowStart, count: 1 });
    return true;
  }
  if (row.count >= limit) return false;
  await ctx.db.patch(row._id, { count: row.count + 1 });
  return true;
}

export type ResolvedCost = {
  points: number;
  ngnPerPoint: number;
  override: boolean;
};

/**
 * Resolve the points cost for a service code: override first, conversion
 * second — the same precedence as `resolveRenderCost`.
 *
 * `pointPricing` ships with no VTU rows, so this exercises the conversion
 * branch until an admin sets one.
 */
export async function resolveCost(
  ctx: any,
  serviceCode: string,
  nairaPrice: number,
): Promise<ResolvedCost> {
  const overrideRow = await ctx.db
    .query("pointPricing")
    .withIndex("by_serviceCode", (q: any) => q.eq("serviceCode", serviceCode))
    .first();
  const rate = await readPointRate(ctx);
  const override = overrideRow?.active === true;
  return {
    points: resolveVtuPointsCost(
      nairaPrice,
      rate.ngnPerPoint,
      override ? overrideRow.pointsCost : undefined,
    ),
    ngnPerPoint: rate.ngnPerPoint,
    override,
  };
}

export type BeginPurchaseResult =
  | {
      reused: true;
      transactionId: Id<"vtuTransactions">;
      status: VtuTransactionStatus;
      pointsDebited: number;
    }
  | {
      reused: false;
      transactionId: Id<"vtuTransactions">;
      status: "pending";
      pointsDebited: number;
      ngnPerPoint: number;
    };

/**
 * Begin a purchase: claim the key, debit the ledger, record the transaction.
 *
 * The ordering is the design:
 *
 *   1. Rate limit.
 *   2. Idempotency — an existing claim means a retry, so return the recorded
 *      transaction WITHOUT debiting again. Checked before the limiter so a
 *      genuine retry of a request that timed out is served rather than being
 *      rate-limited into a failure the customer pays for.
 *   3. Claim the key FIRST. If a later step throws, this insert rolls back
 *      with it, so a failed attempt never burns the customer's request id.
 *   4. Insert the transaction, so the debit can be keyed on its own id.
 *   5. Debit, keyed per ATTEMPT. Throws on insufficient balance, unwinding
 *      the claim and the row above.
 *
 * Steps 3–5 are one Convex transaction, so there is no window in which the key
 * exists without a debit, or a debit without a row to reconcile against.
 *
 * `points.debit` returns the EXISTING ledger id on a replay rather than
 * failing, so its return value alone is not proof of a new debit — the
 * uniqueness of `vtuIdempotency` is what actually prevents a double charge.
 */
export const beginPurchase = internalMutation({
  args: {
    userId: v.id("users"),
    clientRequestId: v.string(),
    serviceCode: v.string(),
    customerIdentifier: v.string(),
    provider: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<BeginPurchaseResult> => {
    if (!isValidRequestId(args.clientRequestId)) {
      throw new Error("A valid clientRequestId is required");
    }

    const parsed = parseServiceCode(args.serviceCode);
    if (!parsed) throw new Error("Unsupported product");

    const phone = validatePhone(args.customerIdentifier);
    if (!phone.ok) throw new Error(phone.error);

    if (
      !(await consumeRateLimit(
        ctx,
        `vtu:purchase:${args.userId}`,
        PURCHASE_RATE_LIMIT,
        RATE_LIMIT_WINDOW_MS,
      ))
    ) {
      throw new Error("Too many purchase attempts. Try again in a minute.");
    }

    const key = vtuPurchaseKey(args.clientRequestId);

    // 2. Idempotency.
    const existingClaim = await ctx.db
      .query("vtuIdempotency")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existingClaim?.transactionId) {
      const tx = await ctx.db.get(existingClaim.transactionId);
      if (tx) {
        return {
          reused: true,
          transactionId: tx._id,
          status: tx.status,
          pointsDebited: tx.pointsDebited,
        };
      }
    }

    // 3. Claim the key FIRST. Rolls back with everything below on throw.
    const now = Date.now();
    const claimId = await ctx.db.insert("vtuIdempotency", {
      key,
      scope: "purchase",
      userId: args.userId,
      createdAt: now,
    });

    const { points, ngnPerPoint } = await resolveCost(
      ctx,
      args.serviceCode,
      parsed.amountNgn,
    );

    // 4. Insert the transaction FIRST, so the debit can be keyed on its id.
    //
    // The ledger key is per ATTEMPT (see `vtuLedgerPurchaseKey`). If it were
    // the client request id, the immutable ledger row from a FAILED attempt
    // would block this debit forever and the customer's retry would be free.
    // All of steps 3–5 are one transaction, so this row cannot survive a
    // failed debit.
    const transactionId = await ctx.db.insert("vtuTransactions", {
      userId: args.userId,
      clientRequestId: args.clientRequestId,
      serviceCode: args.serviceCode,
      provider: args.provider ?? "pairgate",
      status: "pending",
      customerIdentifier: maskIdentifier(phone.value),
      network: parsed.network,
      amountNgn: parsed.amountNgn,
      nairaPrice: parsed.amountNgn,
      ngnPerPoint,
      pointsDebited: points,
      idempotencyKey: key,
      createdAt: now,
      updatedAt: now,
    });

    // 5. Debit, keyed on this attempt.
    const debitId = await ctx.runMutation(internal.points.debit, {
      userId: args.userId,
      amount: points,
      type: "vtu_purchase",
      description: `${args.serviceCode} for ${maskIdentifier(phone.value)}`,
      reference: args.provider ?? "pairgate",
      idempotencyKey: vtuLedgerPurchaseKey(transactionId),
      metadata: {
        clientRequestId: args.clientRequestId,
        serviceCode: args.serviceCode,
        customerIdentifier: maskIdentifier(phone.value),
        nairaPrice: parsed.amountNgn,
        ngnPerPoint,
        transactionId,
      },
    });

    await ctx.db.patch(transactionId, { debitLedgerId: debitId });
    await ctx.db.patch(claimId, { transactionId });

    return {
      reused: false,
      transactionId,
      status: "pending",
      pointsDebited: points,
      ngnPerPoint,
    };
  },
});

/**
 * States a transaction may be written OUT of.
 *
 * `recordOutcome` is the single owner of every terminal transition. Both input
 * paths — the provider's synchronous response and its webhook — write through
 * it, which makes "no status with two owners" true by construction rather than
 * by convention: a second writer cannot be added without landing outside this
 * set.
 */
const OUTCOME_ALLOWED_FROM: readonly VtuTransactionStatus[] = ["processing", "unknown"];

export type RecordOutcomeResult =
  | { applied: true; status: VtuTransactionStatus }
  | { applied: false; reason: "not_found" | "illegal_transition" | "already_resolved" };

/**
 * The ONLY writer permitted to move a transaction out of `processing` or
 * `unknown`.
 *
 * Refused, loudly:
 *   - anything from `failed` (its only exit is `reversed`) — this is what
 *     blocks `failed -> confirmed`
 *   - anything from `confirmed` (terminal) — blocks `confirmed -> failed`
 *   - anything from `reversed` (terminal)
 *   - anything from `pending` (must pass through `markProcessing` first)
 */
export const recordOutcome = internalMutation({
  args: {
    transactionId: v.id("vtuTransactions"),
    outcome: v.union(
      v.object({
        status: v.union(v.literal("success"), v.literal("failed"), v.literal("unknown")),
        providerReference: v.optional(v.string()),
        costNgn: v.optional(v.number()),
        code: v.optional(v.string()),
        message: v.optional(v.string()),
        raw: v.optional(v.any()),
      }),
    ),
    source: v.union(v.literal("provider_response"), v.literal("webhook")),
  },
  handler: async (ctx, args): Promise<RecordOutcomeResult> => {
    const tx = await ctx.db.get(args.transactionId);
    if (!tx) return { applied: false, reason: "not_found" };

    if (tx.status === "confirmed" || tx.status === "reversed") {
      return { applied: false, reason: "already_resolved" };
    }
    if (tx.status === "failed") return { applied: false, reason: "illegal_transition" };
    if (!OUTCOME_ALLOWED_FROM.includes(tx.status)) {
      return { applied: false, reason: "illegal_transition" };
    }

    const now = Date.now();
    const o = args.outcome;

    if (o.status === "success") {
      await ctx.db.patch(args.transactionId, {
        status: "confirmed",
        providerReference: o.providerReference ?? tx.providerReference,
        ...(o.costNgn !== undefined ? { nairaPrice: o.costNgn } : {}),
        source: args.source,
        failureReason: undefined,
        failureCode: undefined,
        rawResponse: sanitizeForLog(o.raw ?? null),
        resolvedAt: now,
        updatedAt: now,
      });
      return { applied: true, status: "confirmed" };
    }

    if (o.status === "failed") {
      await ctx.db.patch(args.transactionId, {
        status: "failed",
        providerReference: o.providerReference ?? tx.providerReference,
        failureCode: o.code,
        failureReason: o.message,
        source: args.source,
        rawResponse: sanitizeForLog(o.raw ?? null),
        updatedAt: now,
      });
      return { applied: true, status: "failed" };
    }

    // unknown — a REAL status, never coerced to pending or failed.
    await ctx.db.patch(args.transactionId, {
      status: "unknown",
      providerReference: o.providerReference ?? tx.providerReference,
      failureReason: o.message,
      source: args.source,
      rawResponse: sanitizeForLog(o.raw ?? null),
      updatedAt: now,
    });
    return { applied: true, status: "unknown" };
  },
});

/**
 * `pending -> processing`. Written immediately before the provider call, so a
 * row that ages in `pending` means "never dispatched" while a row that ages in
 * `processing` means "dispatched, never answered".
 */
export const markProcessing = internalMutation({
  args: { transactionId: v.id("vtuTransactions") },
  handler: async (
    ctx,
    args,
  ): Promise<{ marked: boolean; reason?: string }> => {
    const tx = await ctx.db.get(args.transactionId);
    if (!tx) return { marked: false, reason: "not_found" };
    if (tx.status !== "pending") return { marked: false, reason: "not_pending" };

    await ctx.db.patch(args.transactionId, { status: "processing", updatedAt: Date.now() });
    return { marked: true };
  },
});

export type RefundResult =
  | { reversed: true; creditId: Id<"pointLedger">; releasedKey: string }
  | { reversed: false; reason: "not_found" | "illegal_transition" | "already_reversed" };

/**
 * The ONLY exit from `failed`: credit the points back and release the
 * idempotency key so the customer can retry the same request id.
 *
 * Two properties make the release safe to rely on:
 *   1. The credit amount is `pointsDebited` — the FROZEN snapshot. Re-reading
 *      the live rate would refund a different number of points than were
 *      taken and the balance would not return to where it started.
 *   2. The credit key derives from the transaction id, so a duplicate call
 *      cannot pay twice; the status guard also short-circuits first.
 */
export const refundAndRelease = internalMutation({
  args: {
    transactionId: v.id("vtuTransactions"),
    reason: v.string(),
  },
  handler: async (ctx, args): Promise<RefundResult> => {
    const tx = await ctx.db.get(args.transactionId);
    if (!tx) return { reversed: false, reason: "not_found" };
    if (tx.status === "reversed") return { reversed: false, reason: "already_reversed" };
    // Notably refuses `unknown`: releasing an unresolved transaction risks
    // charging a customer twice for a top-up that may have landed.
    if (tx.status !== "failed") return { reversed: false, reason: "illegal_transition" };
    if (tx.reversalLedgerId) return { reversed: false, reason: "already_reversed" };

    const creditId = await ctx.runMutation(internal.points.credit, {
      userId: tx.userId,
      amount: tx.pointsDebited,
      type: "vtu_refund",
      description: `VTU refund: ${tx.serviceCode} (${tx.customerIdentifier})`,
      reference: tx.provider,
      idempotencyKey: vtuRefundKey(tx._id),
      metadata: {
        transactionId: tx._id,
        serviceCode: tx.serviceCode,
        reason: args.reason,
        pointsDebited: tx.pointsDebited,
        ngnPerPoint: tx.ngnPerPoint,
      },
    });

    // Deleting the claim is what lets the customer retry the same
    // clientRequestId without being charged a second time for one attempt.
    const claim = await ctx.db
      .query("vtuIdempotency")
      .withIndex("by_key", (q) => q.eq("key", tx.idempotencyKey))
      .unique();
    if (claim) await ctx.db.delete(claim._id);

    const now = Date.now();
    await ctx.db.patch(args.transactionId, {
      status: "reversed",
      reversalLedgerId: creditId,
      reversedAt: now,
      resolvedAt: now,
      failureReason: args.reason,
      updatedAt: now,
    });

    return { reversed: true, creditId, releasedKey: tx.idempotencyKey };
  },
});

/** Find a transaction by the reference the aggregator assigned. */
export const findByProviderReference = internalQuery({
  args: { provider: v.string(), providerReference: v.string() },
  handler: async (ctx, args) => {
    const matches = await ctx.db
      .query("vtuTransactions")
      .withIndex("by_provider_reference", (q) =>
        q.eq("providerReference", args.providerReference),
      )
      .take(5);
    const row = matches.find((t) => t.provider === args.provider);
    return row?._id ?? null;
  },
});

/**
 * Record a callback we could not match.
 *
 * Audited rather than rejected: a 4xx makes the aggregator retry forever
 * against a reference that will never resolve on our side.
 */
export const auditUnmatchedCallback = internalMutation({
  args: { provider: v.string(), providerReference: v.string() },
  handler: async (ctx, args) => {
    await ctx.db.insert("auditLogs", {
      action: "vtu_callback_unmatched",
      resource: "vtuTransaction",
      resourceId: args.providerReference,
      after: { provider: args.provider },
      reason: "No transaction matched this provider reference",
      createdAt: Date.now(),
    });
  },
});

/**
 * Provider connection config for the action layer.
 *
 * Internal, so only server code can read it. It returns the SEALED secrets and
 * never the encryption key: the action reads that from its own environment, so
 * the master key never transits through a query result.
 */
export const getProviderConfig = internalQuery({
  args: { provider: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("vtuProviders")
      .withIndex("by_provider", (q) => q.eq("provider", args.provider))
      .first();
    if (!row || row.status === "disabled") return null;
    return {
      provider: row.provider,
      displayName: row.displayName,
      baseUrl: row.baseUrl,
      encryptedSecret: row.encryptedSecret,
      encryptedCallbackSecret: row.encryptedCallbackSecret,
      callbackSignatureHeader: row.callbackSignatureHeader,
      timeoutMs: row.timeoutMs,
    };
  },
});

/** Subscribe to one transaction. Owner-only; the page renders whatever this says. */
export const getTransaction = query({
  args: { transactionId: v.id("vtuTransactions") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const tx = await ctx.db.get(args.transactionId);
    if (!tx || tx.userId !== userId) return null;
    return {
      _id: tx._id,
      status: tx.status,
      serviceCode: tx.serviceCode,
      network: tx.network ?? null,
      customerIdentifier: tx.customerIdentifier,
      nairaPrice: tx.nairaPrice,
      ngnPerPoint: tx.ngnPerPoint,
      pointsDebited: tx.pointsDebited,
      providerReference: tx.providerReference ?? null,
      failureReason: tx.failureReason ?? null,
      createdAt: tx.createdAt,
      updatedAt: tx.updatedAt,
    };
  },
});
