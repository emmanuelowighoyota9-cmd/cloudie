import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Find an existing payment order by Paystack reference (idempotency check).
 */
export const findPaymentByRef = internalQuery({
  args: { reference: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("paymentOrders")
      .withIndex("by_reference", (q) => q.eq("paystackReference", args.reference))
      .first();
  },
});

/**
 * Record a successful Paystack payment and credit the user's points.
 * Runs as an internal mutation so it can be called from an action.
 */
export const recordPaymentAndCredit = internalMutation({
  args: {
    reference: v.string(),
    packageId: v.string(),
    points: v.number(),
    amountUsd: v.number(),
    amountNgn: v.optional(v.number()),
    currency: v.optional(v.string()),
    amountKobo: v.number(),
    paystackStatus: v.string(),
    metadata: v.any(),
  },
  handler: async (ctx, args) => {
    // Get the authenticated user
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHORIZED");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    // Idempotency: check if already recorded
    const existing = await ctx.db
      .query("paymentOrders")
      .withIndex("by_reference", (q) => q.eq("paystackReference", args.reference))
      .first();
    if (existing) return existing._id;

    const now = Date.now();
    const orderNumber = `ORD-${now}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    const currency = (args.currency ?? "USD").toUpperCase();
    const chargeLabel =
      currency === "NGN"
        ? `₦${(args.amountNgn ?? args.amountKobo / 100).toLocaleString()}`
        : `$${args.amountUsd.toLocaleString()}`;

    // Create payment order record
    const orderId = await ctx.db.insert("paymentOrders", {
      orderNumber,
      buyerId: userId,
      kind: "points_package",
      packageId: args.packageId,
      points: args.points,
      amountSubunit: args.amountKobo,
      currency,
      status: "paid",
      paystackReference: args.reference,
      paidAt: now,
      verifiedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    // Credit points to user
    const currentBalance = user.pointsBalance ?? 0;
    const newBalance = currentBalance + args.points;

    await ctx.db.patch(userId, { pointsBalance: newBalance });

    // Create ledger entry
    const ledgerId = await ctx.db.insert("pointLedger", {
      userId,
      amount: args.points,
      balanceAfter: newBalance,
      description: `Points purchase: ${args.points.toLocaleString()} pts (${chargeLabel}) via Paystack`,
      type: "purchase",
      reference: "paystack",
      referenceId: args.reference,
      idempotencyKey: `paystack-${args.reference}`,
      metadata: {
        packageId: args.packageId,
        amountUsd: args.amountUsd,
        amountNgn: args.amountNgn,
        currency,
        paystackReference: args.reference,
      },
      createdAt: now,
    });

    // Update payment order with ledger reference
    await ctx.db.patch(orderId, { creditedLedgerId: ledgerId });

    // Notify user
    await ctx.db.insert("notifications", {
      userId,
      title: "Points purchased",
      message: `+${args.points.toLocaleString()} pts — ${chargeLabel} via Paystack`,
      type: "points_credited",
      isRead: false,
      createdAt: now,
    });

    return orderId;
  },
});
