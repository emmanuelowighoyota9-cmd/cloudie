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
 * Recent unpaid orders for a buyer — used by the recovery pass to re-verify
 * payments the user may have abandoned mid-redirect (closed tab, etc.).
 */
export const listRecentUnpaidOrders = internalQuery({
  args: { userId: v.id("users"), since: v.number() },
  handler: async (ctx, args) => {
    const rows = await ctx.db
      .query("paymentOrders")
      .withIndex("by_buyer", (q) =>
        q.eq("buyerId", args.userId).gte("createdAt", args.since),
      )
      .order("desc")
      .take(20);
    return rows.filter(
      (r) =>
        (r.status === "initialized" || r.status === "pending") &&
        !!r.paystackReference,
    );
  },
});

/**
 * Close out an order Paystack reports as failed/abandoned so it stops being
 * re-verified on every visit.
 */
export const markOrderSettled = internalMutation({
  args: {
    reference: v.string(),
    status: v.union(v.literal("failed"), v.literal("abandoned")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db
      .query("paymentOrders")
      .withIndex("by_reference", (q) => q.eq("paystackReference", args.reference))
      .first();
    if (!order) return null;
    if (order.status === "paid" || order.status === "failed" || order.status === "abandoned") {
      return order._id;
    }
    await ctx.db.patch(order._id, {
      status: args.status,
      failureReason: args.reason,
      updatedAt: Date.now(),
    });
    return order._id;
  },
});

/**
 * Record the pending order created at checkout init, BEFORE redirecting to
 * Paystack. This is the server-side source of truth linking a reference to the
 * buyer — webhooks arrive unauthenticated and must resolve the buyer from here.
 */
export const recordPendingOrder = internalMutation({
  args: {
    reference: v.string(),
    userId: v.id("users"),
    packageId: v.string(),
    points: v.number(),
    amountSubunit: v.number(),
    currency: v.string(),
    accessCode: v.optional(v.string()),
    authorizationUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("paymentOrders")
      .withIndex("by_reference", (q) => q.eq("paystackReference", args.reference))
      .first();
    if (existing) return existing._id;

    const now = Date.now();
    const orderNumber = `ORD-${now}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
    return await ctx.db.insert("paymentOrders", {
      orderNumber,
      buyerId: args.userId,
      kind: "points_package",
      packageId: args.packageId,
      points: args.points,
      amountSubunit: args.amountSubunit,
      currency: args.currency,
      status: "initialized",
      paystackReference: args.reference,
      accessCode: args.accessCode,
      authorizationUrl: args.authorizationUrl,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Record a successful Paystack payment and credit the user's points.
 * Runs as an internal mutation so it can be called from an action OR the
 * unauthenticated webhook — the buyer is resolved from the pending order first,
 * falling back to the caller's session only when no order exists yet.
 *
 * Idempotent: if the order is already paid (or the ledger entry exists), it
 * returns early without crediting twice.
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
    // Idempotency + buyer resolution via the pending order (session-free path).
    const existing = await ctx.db
      .query("paymentOrders")
      .withIndex("by_reference", (q) => q.eq("paystackReference", args.reference))
      .first();
    if (existing?.status === "paid") return `already:${existing._id}`;

    // Double-credit guard on the ledger itself (covers racing webhook + callback).
    const idempotencyKey = `paystack-${args.reference}`;
    const priorLedger = await ctx.db
      .query("pointLedger")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idempotencyKey))
      .first();
    if (priorLedger) {
      if (existing) {
        await ctx.db.patch(existing._id, {
          status: "paid",
          creditedLedgerId: priorLedger._id,
          updatedAt: Date.now(),
        });
        return `already:${existing._id}`;
      }
      return `already:${priorLedger.referenceId ?? "ledger"}`;
    }

    // Prefer the order's authoritative amounts; metadata is only a fallback.
    const points = existing?.points ?? args.points;
    const packageId = existing?.packageId ?? args.packageId;
    const amountSubunit = existing?.amountSubunit ?? args.amountKobo;

    // Resolve the buyer: pending order first (webhook path), session second.
    let userId = existing?.buyerId;
    if (!userId) {
      const sessionUserId = await getAuthUserId(ctx);
      if (!sessionUserId) {
        throw new Error("UNAUTHORIZED: cannot resolve buyer for this payment");
      }
      userId = sessionUserId;
    }

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if (points <= 0) throw new Error("Invalid points for this payment");

    const now = Date.now();
    const currency = (args.currency ?? "USD").toUpperCase();
    const chargeLabel =
      currency === "NGN"
        ? `₦${(args.amountNgn ?? amountSubunit / 100).toLocaleString()}`
        : `$${(args.amountUsd || amountSubunit / 100).toLocaleString()}`;

    // Mark the order paid (or create it if the webhook beat checkout recording).
    let orderId = existing?._id;
    if (orderId) {
      await ctx.db.patch(orderId, {
        status: "paid",
        paidAt: now,
        verifiedAt: now,
        updatedAt: now,
      });
    } else {
      orderId = await ctx.db.insert("paymentOrders", {
        orderNumber: `ORD-${now}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`,
        buyerId: userId,
        kind: "points_package",
        packageId,
        points,
        amountSubunit,
        currency,
        status: "paid",
        paystackReference: args.reference,
        paidAt: now,
        verifiedAt: now,
        createdAt: now,
        updatedAt: now,
      });
    }

    // Credit points to user
    const currentBalance = user.pointsBalance ?? 0;
    const newBalance = currentBalance + points;

    await ctx.db.patch(userId, { pointsBalance: newBalance });

    // Create ledger entry
    const ledgerId = await ctx.db.insert("pointLedger", {
      userId,
      amount: points,
      balanceAfter: newBalance,
      description: `Points purchase: ${points.toLocaleString()} pts (${chargeLabel}) via Paystack`,
      type: "purchase",
      reference: "paystack",
      referenceId: args.reference,
      idempotencyKey,
      metadata: {
        packageId,
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
      message: `+${points.toLocaleString()} pts — ${chargeLabel} via Paystack`,
      type: "points_credited",
      isRead: false,
      createdAt: now,
    });

    return orderId;
  },
});
