import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const getBalance = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    return user?.pointsBalance ?? 0;
  },
});

export const getLedger = query({
  args: {
    limit: v.optional(v.number()),
    type: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    if (args.type) {
      const results = await ctx.db
        .query("pointLedger")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .order("desc")
        .collect();
      return results.filter((r) => r.type === args.type).slice(0, args.limit ?? 50);
    }
    return await ctx.db
      .query("pointLedger")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const getAdminLedger = query({
  args: {
    userId: v.optional(v.id("users")),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) return [];
    const admin = await ctx.db.get(adminId);
    if (admin?.role !== "admin") return [];
    if (args.userId) {
      return await ctx.db
        .query("pointLedger")
        .withIndex("by_user", (q) => q.eq("userId", args.userId!))
        .order("desc")
        .take(args.limit ?? 50);
    }
    return await ctx.db
      .query("pointLedger")
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const credit = mutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    description: v.string(),
    type: v.string(),
    reference: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    if (args.amount <= 0) throw new Error("Credit amount must be positive");

    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("pointLedger")
        .withIndex("by_idempotency", (q) =>
          q.eq("idempotencyKey", args.idempotencyKey!),
        )
        .first();
      if (existing) return existing._id;
    }

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const currentBalance = user.pointsBalance ?? 0;
    const newBalance = currentBalance + args.amount;

    await ctx.db.patch(args.userId, { pointsBalance: newBalance });

    const ledgerId = await ctx.db.insert("pointLedger", {
      userId: args.userId,
      amount: args.amount,
      balanceAfter: newBalance,
      description: args.description,
      type: args.type as any,
      reference: args.reference,
      referenceId: args.referenceId,
      idempotencyKey: args.idempotencyKey,
      metadata: args.metadata,
      createdAt: Date.now(),
    });

    await ctx.db.insert("notifications", {
      userId: args.userId,
      title: "Points credited",
      message: `+${args.amount} pts — ${args.description}`,
      type: "points_credited",
      isRead: false,
      createdAt: Date.now(),
    });

    return ledgerId;
  },
});

export const debit = mutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    description: v.string(),
    type: v.string(),
    reference: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    if (args.amount <= 0) throw new Error("Debit amount must be positive");

    if (args.idempotencyKey) {
      const existing = await ctx.db
        .query("pointLedger")
        .withIndex("by_idempotency", (q) =>
          q.eq("idempotencyKey", args.idempotencyKey!),
        )
        .first();
      if (existing) return existing._id;
    }

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const currentBalance = user.pointsBalance ?? 0;
    if (currentBalance < args.amount) {
      throw new Error("Insufficient points balance");
    }

    const newBalance = currentBalance - args.amount;

    await ctx.db.patch(args.userId, { pointsBalance: newBalance });

    const ledgerId = await ctx.db.insert("pointLedger", {
      userId: args.userId,
      amount: -args.amount,
      balanceAfter: newBalance,
      description: args.description,
      type: args.type as any,
      reference: args.reference,
      referenceId: args.referenceId,
      idempotencyKey: args.idempotencyKey,
      metadata: args.metadata,
      createdAt: Date.now(),
    });

    await ctx.db.insert("notifications", {
      userId: args.userId,
      title: "Points deducted",
      message: `-${args.amount} pts — ${args.description}`,
      type: "points_deducted",
      isRead: false,
      createdAt: Date.now(),
    });

    return ledgerId;
  },
});

export const adminAdjust = mutation({
  args: {
    userId: v.id("users"),
    amount: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthorized");
    const admin = await ctx.db.get(adminId);
    if (admin?.role !== "admin") throw new Error("Admin only");

    if (!args.reason || args.reason.length < 3) {
      throw new Error("A reason is required for admin adjustments");
    }

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");

    const currentBalance = user.pointsBalance ?? 0;
    const newBalance = currentBalance + args.amount;

    if (newBalance < 0) {
      throw new Error("Adjustment would result in negative balance");
    }

    await ctx.db.patch(args.userId, { pointsBalance: newBalance });

    const ledgerId = await ctx.db.insert("pointLedger", {
      userId: args.userId,
      amount: args.amount,
      balanceAfter: newBalance,
      description: `Admin adjustment: ${args.reason}`,
      type: "admin_adjustment",
      reference: "admin",
      referenceId: adminId,
      metadata: { reason: args.reason, adminId },
      createdAt: Date.now(),
    });

    await ctx.db.insert("auditLogs", {
      actorId: adminId,
      actorEmail: admin.email,
      action: "point_adjustment",
      resource: "user",
      resourceId: args.userId,
      before: { balance: currentBalance },
      after: { balance: newBalance, adjustment: args.amount },
      reason: args.reason,
      createdAt: Date.now(),
    });

    return ledgerId;
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

    const totalPointsMinted = allUsers.reduce(
      (sum, u) => sum + (u.pointsBalance ?? 0),
      0,
    );

    return {
      totalUsers: allUsers.length,
      activeUsers: allUsers.filter((u) => !u.isSuspended).length,
      vendors: allVendors.length,
      approvedVendors: allVendors.filter((v) => v.status === "approved").length,
      tenants: allTenants.length,
      activeTenants: allTenants.filter((t) => t.isActive).length,
      totalPointsMinted,
      shipments: allShipments.length,
      documents: allDocuments.length,
      products: allProducts.length,
    };
  },
});
