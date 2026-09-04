import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    siteName: v.string(),
    subdomain: v.string(),
    siteType: v.union(v.literal("bank"), v.literal("investment")),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const existing = await ctx.db
      .query("tenantSites")
      .withIndex("by_subdomain", (q) => q.eq("subdomain", args.subdomain))
      .first();
    if (existing) throw new Error("Subdomain already taken");

    return await ctx.db.insert("tenantSites", {
      ownerId: userId,
      siteName: args.siteName,
      subdomain: args.subdomain,
      siteType: args.siteType,
      isActive: true,
      renewalDate: Date.now() + 365 * 24 * 60 * 60 * 1000,
      contactEmail: args.contactEmail,
      contactPhone: args.contactPhone,
      createdAt: Date.now(),
    });
  },
});

export const listMy = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("tenantSites")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const tenant = await ctx.db.get(args.id);
    if (!tenant) return null;
    if (tenant.ownerId !== userId) return null;
    return tenant;
  },
});

export const update = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    siteName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    branding: v.optional(
      v.object({
        logo: v.optional(v.string()),
        primaryColor: v.optional(v.string()),
        accentColor: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== userId) throw new Error("Not found");

    const updates: Record<string, unknown> = {};
    if (args.siteName) updates.siteName = args.siteName;
    if (args.contactEmail) updates.contactEmail = args.contactEmail;
    if (args.contactPhone) updates.contactPhone = args.contactPhone;
    if (args.branding) updates.branding = args.branding;

    await ctx.db.patch(args.tenantId, updates);
    return { success: true };
  },
});

export const toggleActive = mutation({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== userId) throw new Error("Not found");
    await ctx.db.patch(args.tenantId, { isActive: !tenant.isActive });
    return { success: true };
  },
});

export const submitKyc = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    fullName: v.string(),
    dateOfBirth: v.optional(v.string()),
    documentUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== userId) throw new Error("Not found");

    const now = Date.now();
    return await ctx.db.insert("kycRecords", {
      tenantId: args.tenantId,
      userId,
      status: "pending",
      fullName: args.fullName,
      dateOfBirth: args.dateOfBirth,
      documentUrl: args.documentUrl,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listKyc = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== userId) return [];
    return await ctx.db
      .query("kycRecords")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .order("desc")
      .collect();
  },
});

export const getTenantLedger = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== userId) return [];
    return await ctx.db
      .query("tenantLedger")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .order("desc")
      .collect();
  },
});

export const adminList = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return [];
    return await ctx.db
      .query("tenantSites")
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const adminLockdown = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") throw new Error("Admin only");

    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant) throw new Error("Tenant not found");

    await ctx.db.patch(args.tenantId, { isActive: false });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actorEmail: user.email,
      action: "tenant_lockdown",
      resource: "tenantSite",
      resourceId: args.tenantId,
      before: { isActive: tenant.isActive },
      after: { isActive: false },
      reason: args.reason,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const adminKycReview = mutation({
  args: {
    kycId: v.id("kycRecords"),
    status: v.union(
      v.literal("verified"),
      v.literal("rejected"),
      v.literal("more_information_required"),
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") throw new Error("Admin only");

    const kyc = await ctx.db.get(args.kycId);
    if (!kyc) throw new Error("KYC record not found");

    await ctx.db.patch(args.kycId, {
      status: args.status,
      notes: args.notes,
      reviewedBy: userId,
      reviewedAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actorEmail: user.email,
      action: `kyc_${args.status}`,
      resource: "kycRecord",
      resourceId: args.kycId,
      before: { status: kyc.status },
      after: { status: args.status },
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const adminListKyc = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return [];
    return await ctx.db.query("kycRecords").order("desc").take(args.limit ?? 50);
  },
});
