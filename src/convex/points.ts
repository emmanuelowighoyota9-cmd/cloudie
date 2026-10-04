import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { pointTxTypeValidator } from "./schema";
import { v } from "convex/values";

/**
 * Legacy compatibility surface.
 *
 * Cloudie is now NGN-wallet based. These exports remain temporarily so older
 * callers can migrate without breaking the deployment, but every balance and
 * money mutation is delegated to the authoritative wallet service.
 */
export const getBalance = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return 0;
    if (typeof user.walletBalanceNgn === "number") return user.walletBalanceNgn;
    return (user.pointsBalance ?? 0) * 15;
  },
});

export const getLedger = query({
  args: { limit: v.optional(v.number()), type: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db.query("walletLedger")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(Math.min(args.limit ?? 100, 200));
    return args.type ? rows.filter((r) => r.type === args.type) : rows;
  },
});

export const getAdminLedger = query({
  args: { userId: v.optional(v.id("users")), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) return [];
    const admin = await ctx.db.get(adminId);
    if (admin?.role !== "admin") return [];
    if (args.userId) {
      return await ctx.db.query("walletLedger")
        .withIndex("by_user", (q) => q.eq("userId", args.userId!))
        .order("desc")
        .take(Math.min(args.limit ?? 100, 500));
    }
    return await ctx.db.query("walletLedger").order("desc").take(Math.min(args.limit ?? 100, 500));
  },
});

export const credit = mutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    description: v.string(),
    type: pointTxTypeValidator,
    reference: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.runMutation(internal.wallet.credit, {
      userId: args.userId,
      amountNgn: args.amount,
      description: args.description,
      type: args.type,
      reference: args.reference,
      referenceId: args.referenceId,
      idempotencyKey: args.idempotencyKey,
      metadata: args.metadata,
    });
  },
});

export const debit = mutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    description: v.string(),
    type: pointTxTypeValidator,
    reference: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    return await ctx.runMutation(internal.wallet.debit, {
      userId: args.userId,
      amountNgn: args.amount,
      description: args.description,
      type: args.type,
      reference: args.reference,
      referenceId: args.referenceId,
      idempotencyKey: args.idempotencyKey,
      metadata: args.metadata,
    });
  },
});

export const adminAdjust = mutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.runMutation(internal.wallet.adminAdjust, {
      userId: args.userId,
      amountNgn: args.amount,
      reason: args.reason,
    });
  },
});

export const getAllUsers = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return [];
    return await ctx.db.query("users").order("desc").take(args.limit ?? 50);
  },
});

/** Intentionally disabled: balance credit must come from a verified payment. */
export const buyPoints = mutation({
  args: {
    packageId: v.string(),
    points: v.number(),
    amountUsd: v.number(),
    paymentMethod: v.string(),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async () => {
    throw new Error("POINTS_DEPRECATED: use verified NGN wallet funding");
  },
});

export const getStats = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return null;

    const allUsers = await ctx.db.query("users").collect();
    const allShipments = await ctx.db.query("shipments").collect();
    const allDocuments = await ctx.db.query("documents").collect();
    const allProducts = await ctx.db.query("marketplaceProducts").collect();
    const allTenants = await ctx.db.query("tenantSites").collect();
    const allVendors = await ctx.db.query("vendors").collect();

    const totalWalletNgn = allUsers.reduce(
      (sum, u) => sum + (u.walletBalanceNgn ?? (u.pointsBalance ?? 0) * 15),
      0,
    );

    return {
      totalUsers: allUsers.length,
      activeUsers: allUsers.filter((u) => !u.isSuspended).length,
      vendors: allVendors.length,
      approvedVendors: allVendors.filter((v) => v.status === "approved").length,
      tenants: allTenants.length,
      activeTenants: allTenants.filter((t) => t.isActive).length,
      totalWalletNgn,
      shipments: allShipments.length,
      documents: allDocuments.length,
      products: allProducts.length,
    };
  },
});
