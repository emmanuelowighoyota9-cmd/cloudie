import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

// ─── User Management ───
export const listUsers = query({
  args: { limit: v.optional(v.number()), search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return [];

    let users = await ctx.db.query("users").order("desc").take(args.limit ?? 100);
    if (args.search) {
      const search = args.search.toLowerCase();
      users = users.filter(
        (u) =>
          u.name?.toLowerCase().includes(search) ||
          u.email?.toLowerCase().includes(search),
      );
    }
    return users;
  },
});

export const getUser = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return null;
    return await ctx.db.get(args.id);
  },
});

export const suspendUser = mutation({
  args: {
    userId: v.id("users"),
    suspend: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthorized");
    const admin = await ctx.db.get(adminId);
    if (!admin || admin.role !== "admin") throw new Error("Admin only");

    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");

    const oldState = { isSuspended: target.isSuspended, role: target.role };
    await ctx.db.patch(args.userId, { isSuspended: args.suspend });

    await ctx.db.insert("auditLogs", {
      actorId: adminId,
      action: args.suspend ? "user_suspension" : "user_unsuspension",
      resource: "user",
      resourceId: args.userId,
      before: oldState,
      after: { isSuspended: args.suspend },
      reason: args.reason,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const terminateUser = mutation({
  args: {
    userId: v.id("users"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthorized");
    const admin = await ctx.db.get(adminId);
    if (!admin || admin.role !== "admin") throw new Error("Admin only");

    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");

    await ctx.db.patch(args.userId, { isSuspended: true });

    await ctx.db.insert("auditLogs", {
      actorId: adminId,
      action: "account_termination",
      resource: "user",
      resourceId: args.userId,
      before: { role: target.role },
      after: { isSuspended: true },
      reason: args.reason,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const getUserTransactions = query({
  args: { userId: v.id("users"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) return [];
    const admin = await ctx.db.get(adminId);
    if (admin?.role !== "admin") return [];
    return await ctx.db
      .query("pointLedger")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

// ─── Audit Logs ───
export const getAuditLogs = query({
  args: { limit: v.optional(v.number()), action: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return [];
    if (args.action) {
      return await ctx.db
        .query("auditLogs")
        .withIndex("by_action", (q) => q.eq("action", args.action!))
        .order("desc")
        .take(args.limit ?? 100);
    }
    return await ctx.db.query("auditLogs").order("desc").take(args.limit ?? 100);
  },
});

// ─── Analytics ───
export const getAnalytics = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return null;

    const allUsers = await ctx.db.query("users").collect();
    const allShipments = await ctx.db.query("shipments").collect();
    const allDocuments = await ctx.db.query("documents").collect();
    const allVendors = await ctx.db.query("vendors").collect();
    const allTenants = await ctx.db.query("tenantSites").collect();
    const allOrders = await ctx.db.query("marketplaceOrders").collect();
    const allProducts = await ctx.db.query("marketplaceProducts").collect();
    const allLedger = await ctx.db.query("pointLedger").collect();
    const allCampaigns = await ctx.db.query("emailCampaigns").collect();

    const totalMinted = allLedger
      .filter((l) => l.amount > 0)
      .reduce((s, l) => s + l.amount, 0);
    const totalBurned = allLedger
      .filter((l) => l.amount < 0)
      .reduce((s, l) => s + Math.abs(l.amount), 0);

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    return {
      totalUsers: allUsers.length,
      activeUsers: allUsers.filter((u) => !u.isSuspended).length,
      totalVendors: allVendors.length,
      approvedVendors: allVendors.filter((v) => v.status === "approved").length,
      totalTenants: allTenants.length,
      activeTenants: allTenants.filter((t) => t.isActive).length,
      totalShipments: allShipments.length,
      totalDocuments: allDocuments.length,
      totalOrders: allOrders.length,
      totalProducts: allProducts.length,
      totalCampaigns: allCampaigns.length,
      pointsMinted: totalMinted,
      pointsBurned: totalBurned,
      pointsInCirculation: totalMinted - totalBurned,
      last7Days: {
        newUsers: allUsers.filter((u) => (u.createdAt ?? 0) > sevenDaysAgo).length,
        shipments: allShipments.filter((s) => s.createdAt > sevenDaysAgo).length,
        documents: allDocuments.filter((d) => d.createdAt > sevenDaysAgo).length,
      },
    };
  },
});

export const getInfrastructure = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return null;

    const allLedger = await ctx.db.query("pointLedger").collect();
    const allNotifications = await ctx.db.query("notifications").collect();
    const allAssets = await ctx.db.query("assets").collect();

    return {
      totalTransactions: allLedger.length,
      pendingNotifications: allNotifications.filter((n) => !n.isRead).length,
      totalAssets: allAssets.length,
      health: {
        database: "healthy",
        storage: "healthy",
        auth: "healthy",
      },
    };
  },
});
