/**
 * VTU money path — internal mutations only.
 *
 * Nothing here is a public function. The client cannot debit, reverse, or set a
 * price; it can only ask the action in `vtuHttp.ts` to run a purchase, and
 * that action calls into this module. Every path that moves points goes
 * through `internal.points.debit` / `internal.points.credit`, so the existing
 * immutable ledger stays the single source of truth.
 *
 * Deliberately does NOT import `vtuPairgate.ts`: this module must stay free of
 * `node:crypto` so the test harness can run these mutations without a Node
 * runtime.
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { VtuTransactionStatus } from "./vtuShared";
import type { VtuReversalResult } from "./vtuReversal";
import { sanitizeForLog } from "./vtuShared";
import { readPointRate, readVtuMarkupBp } from "./pricing";
import {
  isValidRequestId,
  maskIdentifier,
  pointsForNaira,
  validateCustomerIdentifier,
  vtuPurchaseKey,
} from "../lib/vtu";
import type { MutationCtx } from "./_generated/server";

/** Fixed-window limiter, mirroring the one in `docTemplates.ts`. */
async function consumeRateLimit(
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

export const VTU_PURCHASE_SERVICE = "vtu_purchase";

/**
 * Explicit result shapes.
 *
 * These annotations are load-bearing, not decoration. Without them TypeScript
 * must infer each handler's return type THROUGH the generated `internal`
 * object, which itself contains these functions — a circular inference that
 * collapses the module to `any` and produces TS7022/TS7023.
 */
export type ReserveResult =
  | {
      already: true;
      transactionId: Id<"vtuTransactions">;
      status: VtuTransactionStatus;
    }
  | {
      already: false;
      transactionId: Id<"vtuTransactions">;
      points: number;
      costNgn: number;
    };

export type FinalizeResult =
  | { status: "success" }
  | { status: "reversed"; reversal: VtuReversalResult }
  | { status: "pending" };

export type CallbackResult =
  | { outcome: "unmatched" }
  | { outcome: "ignored"; status: VtuTransactionStatus }
  | { outcome: "success" }
  | { outcome: "failed"; reversal: VtuReversalResult };

/**
 * Reserve a purchase: validate, price, debit, and record the transaction.
 *
 * Returns `{ already: true }` when this `requestId` has been seen before, so a
 * client retry is served from the existing row rather than charged twice. That
 * check runs FIRST and before the rate limiter — a genuine retry of a request
 * that timed out must not be rate-limited into a failure the customer pays
 * for.
 *
 * The debit and the row insert are in ONE transaction, so a rollback can
 * never leave points taken with no transaction record to reconcile against.
 */
export const reserveTransaction = internalMutation({
  args: {
    userId: v.id("users"),
    requestId: v.string(),
    provider: v.string(),
    serviceType: v.union(
      v.literal("airtime"),
      v.literal("data"),
      v.literal("cable"),
      v.literal("electricity"),
      v.literal("exam"),
      v.literal("betting"),
    ),
    productCode: v.string(),
    customerIdentifier: v.string(),
    quantity: v.optional(v.number()),
    pinCount: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<ReserveResult> => {
    if (!isValidRequestId(args.requestId)) {
      throw new Error("A valid requestId is required");
    }

    // 1. Idempotency — before anything else.
    const existing = await ctx.db
      .query("vtuTransactions")
      .withIndex("by_requestId", (q) => q.eq("requestId", args.requestId))
      .unique();
    if (existing) {
      return { already: true, transactionId: existing._id, status: existing.status };
    }

    if (!(await consumeRateLimit(ctx, `vtu:purchase:${args.userId}`, 10, 60_000))) {
      throw new Error("Too many purchase attempts. Try again in a minute.");
    }

    // 2. Destination number. Never persisted in full.
    const identifier = validateCustomerIdentifier(
      args.serviceType,
      args.customerIdentifier,
    );
    if (!identifier.ok) throw new Error(identifier.error);

    // 3. Price comes from the catalog, never from the client.
    const product = await ctx.db
      .query("vtuCatalog")
      .withIndex("by_provider_code", (q) =>
        q.eq("provider", args.provider).eq("productCode", args.productCode),
      )
      .first();
    if (!product || !product.isActive) {
      throw new Error("This product is not available");
    }
    if (product.serviceType !== args.serviceType) {
      throw new Error("Product does not match the selected service");
    }

    const rate = await readPointRate(ctx);
    const markupBp = await readVtuMarkupBp(ctx);
    // An explicit per-product point cost overrides naira conversion, so an
    // admin can price a loss-leading product deliberately.
    const points =
      product.pointsCost && product.pointsCost > 0
        ? product.pointsCost
        : pointsForNaira(product.priceNgn, rate.ngnPerPoint, markupBp);

    const masked = maskIdentifier(identifier.value);
    const label = product.name;

    // 4. Debit. Throws on insufficient balance, which aborts the whole
    //    mutation — no orphan row is left behind.
    const debitId: Id<"pointLedger"> = await ctx.runMutation(internal.points.debit, {
      userId: args.userId,
      amount: points,
      type: VTU_PURCHASE_SERVICE as any,
      description: `${label} for ${masked}`,
      reference: args.provider,
      idempotencyKey: vtuPurchaseKey(args.requestId),
      metadata: {
        requestId: args.requestId,
        serviceType: args.serviceType,
        productCode: args.productCode,
        productName: label,
        customerIdentifier: masked,
        costNgn: product.priceNgn,
      },
    });

    const now = Date.now();
    const transactionId = await ctx.db.insert("vtuTransactions", {
      userId: args.userId,
      requestId: args.requestId,
      serviceType: args.serviceType,
      provider: args.provider,
      productCode: args.productCode,
      productName: label,
      customerIdentifier: masked,
      quantity: args.quantity,
      status: "pending",
      costNgn: product.priceNgn,
      pointsCharged: points,
      debitLedgerId: debitId,
      createdAt: now,
      updatedAt: now,
    });

    return { already: false, transactionId, points, costNgn: product.priceNgn };
  },
});

/**
 * NOTE: the reversal mutation itself lives in `vtuReversal.ts`.
 *
 * It cannot be a function in this module: a Convex module that calls its own
 * exports through the generated `internal` API produces a circular inferred
 * type, which collapses this whole module — and every module importing it —
 * to `any`.
 */

/**
 * Record the outcome of the outbound provider call.
 *
 * `unknown` deliberately leaves the row `pending` with a `failureReason`. The
 * points stay debited, because reversing a timeout would refund airtime that
 * may genuinely have been delivered at the carrier. There is no poller in this
 * slice: these rows are counted and reported, which is the failure rate that
 * decides whether one is needed.
 */
export const finalizeTransaction = internalMutation({
  args: {
    transactionId: v.id("vtuTransactions"),
    result: v.union(
      v.object({
        status: v.literal("success"),
        providerReference: v.string(),
        costNgn: v.optional(v.number()),
        serial: v.optional(v.string()),
        pin: v.optional(v.string()),
        raw: v.optional(v.any()),
      }),
      v.object({
        status: v.literal("failed"),
        code: v.string(),
        message: v.string(),
        providerReference: v.optional(v.string()),
        raw: v.optional(v.any()),
      }),
      v.object({
        status: v.literal("unknown"),
        message: v.string(),
        providerReference: v.optional(v.string()),
        raw: v.optional(v.any()),
      }),
    ),
  },
  handler: async (ctx, args): Promise<FinalizeResult> => {
    const tx = await ctx.db.get(args.transactionId);
    if (!tx) throw new Error("Transaction not found");
    const now = Date.now();

    if (args.result.status === "success") {
      await ctx.db.patch(args.transactionId, {
        status: "success",
        providerReference: args.result.providerReference,
        costNgn: args.result.costNgn ?? tx.costNgn,
        serial: args.result.serial,
        pin: args.result.pin,
        rawResponse: sanitizeForLog(args.result.raw ?? null),
        resolvedAt: now,
        updatedAt: now,
      });
      return { status: "success" };
    }

    if (args.result.status === "failed") {
      await ctx.db.patch(args.transactionId, {
        status: "failed",
        providerReference: args.result.providerReference,
        failureCode: args.result.code,
        failureReason: args.result.message,
        rawResponse: sanitizeForLog(args.result.raw ?? null),
        updatedAt: now,
      });
      const reversal = await ctx.runMutation(internal.vtuReversal.reverse, {
        transactionId: args.transactionId,
        reason: args.result.message,
      });
      return { status: "reversed", reversal };
    }

    // unknown → stays pending
    await ctx.db.patch(args.transactionId, {
      status: "pending",
      failureReason: args.result.message,
      rawResponse: sanitizeForLog(args.result.raw ?? null),
      updatedAt: now,
    });
    return { status: "pending" };
  },
});

/**
 * Apply a verified provider callback to its transaction.
 *
 * Terminal states are no-ops, which is what makes a duplicate webhook harmless.
 * An unrecognised reference is reported rather than thrown so the HTTP layer
 * can acknowledge it with 200 — an aggregator that gets a 4xx retries forever
 * against something that will never resolve.
 */
export const applyCallback = internalMutation({
  args: {
    provider: v.string(),
    event: v.object({
      providerReference: v.string(),
      outcome: v.union(v.literal("success"), v.literal("failed")),
      costNgn: v.optional(v.number()),
      code: v.optional(v.string()),
      message: v.optional(v.string()),
      serial: v.optional(v.string()),
      pin: v.optional(v.string()),
      eventId: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args): Promise<CallbackResult> => {
    const matches = await ctx.db
      .query("vtuTransactions")
      .withIndex("by_provider_reference", (q) =>
        q.eq("providerReference", args.event.providerReference),
      )
      .take(5);
    const tx = matches.find((t) => t.provider === args.provider);

    if (!tx) {
      await ctx.db.insert("auditLogs", {
        action: "vtu_callback_unmatched",
        resource: "vtuTransaction",
        resourceId: args.event.providerReference,
        after: sanitizeForLog(args.event),
        reason: "No transaction matched this provider reference",
        createdAt: Date.now(),
      });
      return { outcome: "unmatched" };
    }

    if (tx.status === "reversed" || tx.status === "success") {
      return { outcome: "ignored", status: tx.status };
    }

    const now = Date.now();

    if (args.event.outcome === "success") {
      await ctx.db.patch(tx._id, {
        status: "success",
        costNgn: args.event.costNgn ?? tx.costNgn,
        serial: args.event.serial,
        pin: args.event.pin,
        failureReason: undefined,
        resolvedAt: now,
        updatedAt: now,
      });
      return { outcome: "success" };
    }

    await ctx.db.patch(tx._id, {
      status: "failed",
      failureCode: args.event.code,
      failureReason: args.event.message ?? "Provider reported failure",
      updatedAt: now,
    });
    const reversal = await ctx.runMutation(internal.vtuReversal.reverse, {
      transactionId: tx._id,
      reason: args.event.message ?? "Provider reported failure",
    });
    return { outcome: "failed", reversal };
  },
});

/**
 * Provider connection config for the action layer.
 *
 * Internal, so only server code can read it. It returns the SEALED secrets
 * and never the encryption key: the action reads that from its own
 * environment, so the master key never transits through a query result.
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

/** A customer's own VTU history. */
export const listMyTransactions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("vtuTransactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(args.limit ?? 25);

    return rows.map((t) => ({
      _id: t._id,
      requestId: t.requestId,
      serviceType: t.serviceType,
      productName: t.productName ?? t.productCode,
      customerIdentifier: t.customerIdentifier,
      status: t.status,
      pointsCharged: t.pointsCharged,
      costNgn: t.costNgn,
      providerReference: t.providerReference,
      failureReason: t.failureReason,
      createdAt: t.createdAt,
    }));
  },
});

/** Active catalog for one service type. */
export const listCatalog = query({
  args: { serviceType: v.string() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("vtuCatalog")
      .withIndex("by_service", (q) =>
        q
          .eq("serviceType", args.serviceType as any)
          .eq("isActive", true),
      )
      .take(200);

    const rate = await readPointRate(ctx);
    const markupBp = await readVtuMarkupBp(ctx);

    return rows.map((p) => ({
      productCode: p.productCode,
      name: p.name,
      network: p.network,
      priceNgn: p.priceNgn,
      description: p.description,
      points:
        p.pointsCost && p.pointsCost > 0
          ? p.pointsCost
          : pointsForNaira(p.priceNgn, rate.ngnPerPoint, markupBp),
    }));
  },
});

/**
 * Count of transactions stuck past the unresolved window.
 *
 * This is the measurement that decides whether a reconciler is worth building,
 * so it is cheap and bounded rather than a sweeping job.
 */
export const stuckTransactionCount = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return 0;

    const cutoff = Date.now() - 10 * 60_000;
    const rows = await ctx.db
      .query("vtuTransactions")
      .withIndex("by_status", (q) => q.eq("status", "pending"))
      .take(200);
    return rows.filter((r) => r.createdAt < cutoff).length;
  },
});

export type { MutationCtx as VtuMutationCtx };
