import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const serviceStatus = v.union(
  v.literal("active"),
  v.literal("paused"),
  v.literal("cancelled"),
  v.literal("provisioning"),
);

export const listMyServices = query({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      _id: v.id("serviceSubscriptions"),
      name: v.string(),
      category: v.string(),
      serviceKey: v.string(),
      status: v.string(),
      resourceId: v.optional(v.string()),
      resourceLabel: v.optional(v.string()),
      planLabel: v.optional(v.string()),
      usageLabel: v.optional(v.string()),
      renewalAt: v.optional(v.number()),
      updatedAt: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("serviceSubscriptions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(Math.min(args.limit ?? 50, 100));

    return rows.map((row) => ({
      _id: row._id,
      name: row.name,
      category: row.category,
      serviceKey: row.serviceKey,
      status: row.status,
      resourceId: row.resourceId,
      resourceLabel: row.resourceLabel,
      planLabel: row.planLabel,
      usageLabel: row.usageLabel,
      renewalAt: row.renewalAt,
      updatedAt: row.updatedAt,
    }));
  },
});

export const createService = mutation({
  args: {
    serviceKey: v.string(),
    name: v.string(),
    category: v.string(),
    status: serviceStatus,
    resourceId: v.optional(v.string()),
    resourceLabel: v.optional(v.string()),
    planLabel: v.optional(v.string()),
    usageLabel: v.optional(v.string()),
    renewalAt: v.optional(v.number()),
    metadata: v.optional(v.any()),
  },
  returns: v.id("serviceSubscriptions"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const existing = await ctx.db
      .query("serviceSubscriptions")
      .withIndex("by_user_and_service", (q) =>
        q.eq("userId", userId).eq("serviceKey", args.serviceKey),
      )
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        name: args.name,
        category: args.category,
        status: args.status,
        resourceId: args.resourceId,
        resourceLabel: args.resourceLabel,
        planLabel: args.planLabel,
        usageLabel: args.usageLabel,
        renewalAt: args.renewalAt,
        metadata: args.metadata,
        updatedAt: now,
      });
      return existing._id;
    }

    return await ctx.db.insert("serviceSubscriptions", {
      userId,
      serviceKey: args.serviceKey,
      name: args.name,
      category: args.category,
      status: args.status,
      resourceId: args.resourceId,
      resourceLabel: args.resourceLabel,
      planLabel: args.planLabel,
      usageLabel: args.usageLabel,
      renewalAt: args.renewalAt,
      metadata: args.metadata,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const syncMyServices = mutation({
  args: {},
  returns: v.number(),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const now = Date.now();
    let created = 0;

    const sites = await ctx.db
      .query("tenantSites")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .take(100);

    for (const site of sites) {
      const serviceKey = `business:${site._id}`;
      const existing = await ctx.db
        .query("serviceSubscriptions")
        .withIndex("by_user_and_service", (q) =>
          q.eq("userId", userId).eq("serviceKey", serviceKey),
        )
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          name: site.displayName ?? site.siteName,
          category: "Business",
          status: site.isActive ? "active" : "paused",
          resourceId: site._id,
          resourceLabel: site.subdomain,
          planLabel: site.plan ?? "Business site",
          renewalAt: site.renewalDate,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("serviceSubscriptions", {
          userId,
          serviceKey,
          name: site.displayName ?? site.siteName,
          category: "Business",
          status: site.isActive ? "active" : "paused",
          resourceId: site._id,
          resourceLabel: site.subdomain,
          planLabel: site.plan ?? "Business site",
          renewalAt: site.renewalDate,
          createdAt: now,
          updatedAt: now,
        });
        created += 1;
      }
    }

    const shipments = await ctx.db
      .query("shipments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(100);
    if (shipments.length > 0) {
      const serviceKey = "shipments";
      const existing = await ctx.db
        .query("serviceSubscriptions")
        .withIndex("by_user_and_service", (q) =>
          q.eq("userId", userId).eq("serviceKey", serviceKey),
        )
        .first();
      const activeShipments = shipments.filter((shipment) =>
        !["delivered", "cancelled"].includes(shipment.status),
      ).length;
      const payload = {
        name: "Shipments",
        category: "Logistics",
        status: "active" as const,
        resourceLabel: `${activeShipments} active shipment${activeShipments === 1 ? "" : "s"}`,
        usageLabel: `${shipments.length} shipment record${shipments.length === 1 ? "" : "s"}`,
        updatedAt: now,
      };
      if (existing) {
        await ctx.db.patch(existing._id, payload);
      } else {
        await ctx.db.insert("serviceSubscriptions", {
          userId,
          serviceKey,
          ...payload,
          createdAt: now,
        });
        created += 1;
      }
    }

    return created;
  },
});

export const getOverview = query({
  args: {},
  returns: v.object({
    walletBalanceNgn: v.number(),
    activeServices: v.number(),
    monthlySpentNgn: v.number(),
    monthlyFundedNgn: v.number(),
    shipments: v.number(),
    businesses: v.number(),
    recentTransactions: v.array(
      v.object({
        _id: v.id("walletLedger"),
        amountNgn: v.number(),
        description: v.string(),
        type: v.string(),
        createdAt: v.number(),
      }),
    ),
  }),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) {
      return {
        walletBalanceNgn: 0,
        activeServices: 0,
        monthlySpentNgn: 0,
        monthlyFundedNgn: 0,
        shipments: 0,
        businesses: 0,
        recentTransactions: [],
      };
    }

    const user = await ctx.db.get(userId);
    const balance = user?.walletBalanceNgn ?? 0;
    const services = await ctx.db
      .query("serviceSubscriptions")
      .withIndex("by_user_and_status", (q) =>
        q.eq("userId", userId).eq("status", "active"),
      )
      .take(100);

    const shipments = await ctx.db
      .query("shipments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .take(100);

    const businesses = await ctx.db
      .query("tenantSites")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .take(100);

    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const ledger = await ctx.db
      .query("walletLedger")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(200);

    const monthLedger = ledger.filter((entry) => entry.createdAt >= monthStart.getTime());
    const spent = monthLedger
      .filter((entry) => entry.amountNgn < 0)
      .reduce((sum, entry) => sum + Math.abs(entry.amountNgn), 0);
    const funded = monthLedger
      .filter((entry) => entry.amountNgn > 0 && entry.type === "deposit")
      .reduce((sum, entry) => sum + entry.amountNgn, 0);

    return {
      walletBalanceNgn: balance,
      activeServices: services.length,
      monthlySpentNgn: spent,
      monthlyFundedNgn: funded,
      shipments: shipments.length,
      businesses: businesses.length,
      recentTransactions: ledger.slice(0, 6).map((entry) => ({
        _id: entry._id,
        amountNgn: entry.amountNgn,
        description: entry.description,
        type: entry.type,
        createdAt: entry.createdAt,
      })),
    };
  },
});
