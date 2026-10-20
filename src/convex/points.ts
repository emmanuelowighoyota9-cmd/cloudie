import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, internalMutation } from "./_generated/server";
import { pointTxTypeValidator } from "./schema";
import { v } from "convex/values";
import { readPointRate } from "./pricing";
import { creditWallet, debitWallet } from "./wallet";

/** Points ledger helpers for extension work.

 * The platform already has `pointLedger` in `schema.ts`, but the customer-facing
 * wallet surfaces still render almost entirely in NGN. This module is the start
 * of a first-class points read path so Wallet, Transactions and the sidebar can
 * talk about credits without pretending the points ledger does not exist.
 *
 * Rule: these exports are read helpers and thin adapters. The authoritative
 * money path is still `wallet.ts`; this file only exposes the points side when
 * we intentionally want to show both ledgers.
 */
export const getPointsBalance = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;

    const user = await ctx.db.get(userId);
    if (!user) return 0;

    const rows = await ctx.db
      .query("pointLedger")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(1);

    if (rows.length > 0 && typeof rows[0].balanceAfter === "number") {
      return rows[0].balanceAfter;
    }

    if (typeof user.pointsBalance === "number" && Number.isFinite(user.pointsBalance)) {
      return user.pointsBalance;
    }

    return 0;
  },
});

export const getPointLedger = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("pointLedger")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(Math.min(args.limit ?? 100, 200));
  },
});

/**
 * Credit points through the existing wallet adapter.
 *
 * Kept intentionally small for now: the conversion rate between NGN and points
 * is still admin-configured in `pricing.ts`. If points become a separate spend
 * currency, this helper is where that rule should live, not in the UI.
 */
export const creditPoints = internalMutation({
  args: {
    userId: v.id("users"),
    points: v.number(),
    description: v.string(),
    type: pointTxTypeValidator,
    reference: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.points) || args.points <= 0) {
      throw new Error("Points credit must be positive");
    }

    const rate = await readPointRate(ctx);
    const ngnEquivalent = args.points * rate.ngnPerPoint;

    return await creditWallet(ctx, {
      userId: args.userId,
      amountNgn: ngnEquivalent,
      description: args.description,
      type: args.type,
      reference: args.reference,
      referenceId: args.referenceId,
      idempotencyKey: args.idempotencyKey,
      metadata: args.metadata,
    });
  },
});
