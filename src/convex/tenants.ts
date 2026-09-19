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
      status: "submitted",
      fullName: args.fullName,
      dateOfBirth: args.dateOfBirth,
      documentUrl: args.documentUrl,
      resubmissionCount: 0,
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
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("resubmission_required"),
      v.literal("under_review"),
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

    // Enforce the review state machine: submitted/under_review → outcome
    const allowed: Record<string, string[]> = {
      submitted: ["under_review", "approved", "rejected", "resubmission_required"],
      under_review: ["approved", "rejected", "resubmission_required"],
      resubmission_required: [], // applicant must resubmit first
    };
    if (!allowed[kyc.status]?.includes(args.status)) {
      throw new Error(`Invalid KYC transition: ${kyc.status} → ${args.status}`);
    }

    // Rejection requires a reason
    if (args.status === "rejected" && (!args.notes || args.notes.trim().length < 5)) {
      throw new Error("A rejection reason of at least 5 characters is required");
    }

    await ctx.db.patch(args.kycId, {
      status: args.status,
      notes: args.notes,
      reviewedBy: userId,
      reviewedAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("kycEvents", {
      kycId: args.kycId,
      actorId: userId,
      action: `kyc_${args.status}`,
      fromStatus: kyc.status,
      toStatus: args.status,
      reason: args.notes,
      createdAt: Date.now(),
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

    await ctx.db.insert("notifications", {
      userId: kyc.userId,
      title: `KYC ${args.status.replace(/_/g, " ")}`,
      message:
        args.status === "approved"
          ? "Your identity verification was approved."
          : args.status === "rejected"
            ? `Your verification was rejected: ${args.notes}`
            : "Additional information is required for your verification.",
      type: "kyc_update",
      isRead: false,
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

/** Applicant resubmits KYC after a resubmission_required decision. Audited. */
export const resubmitKyc = mutation({
  args: {
    kycId: v.id("kycRecords"),
    fullName: v.string(),
    dateOfBirth: v.optional(v.string()),
    documentUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const kyc = await ctx.db.get(args.kycId);
    if (!kyc) throw new Error("KYC record not found");
    if (kyc.userId !== userId) throw new Error("Forbidden");
    if (kyc.status !== "resubmission_required") {
      throw new Error("Resubmission is not available for this case");
    }

    const now = Date.now();
    await ctx.db.patch(args.kycId, {
      status: "submitted",
      fullName: args.fullName,
      dateOfBirth: args.dateOfBirth,
      documentUrl: args.documentUrl ?? kyc.documentUrl,
      resubmissionCount: (kyc.resubmissionCount ?? 0) + 1,
      reviewedBy: undefined,
      reviewedAt: undefined,
      updatedAt: now,
    });

    await ctx.db.insert("kycEvents", {
      kycId: args.kycId,
      actorId: userId,
      action: "kyc_resubmitted",
      fromStatus: "resubmission_required",
      toStatus: "submitted",
      createdAt: now,
    });

    return { success: true };
  },
});

// ─── Tenant Users ──────────────────────────────────────────────────────────

export const listTenantUsers = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== userId) return [];
    const rows = await ctx.db
      .query("tenantUsers")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();
    const users = await Promise.all(rows.map((r) => ctx.db.get(r.userId)));
    return rows.map((r, i) => ({
      _id: r._id,
      userId: r.userId,
      role: r.role,
      createdAt: r.createdAt,
      email: users[i]?.email ?? null,
      name: users[i]?.name ?? null,
    }));
  },
});

export const addTenantUser = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    email: v.string(),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Unauthorized");
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== ownerId) throw new Error("Not found");
    if (!tenant.isActive) throw new Error("Site is locked");

    // Find user by email (index not available, scan users).
    const target = await ctx.db
      .query("users")
      .filter((q) => q.eq("email", args.email))
      .first();
    if (!target) throw new Error(`No user found with email ${args.email}`);

    const existing = await ctx.db
      .query("tenantUsers")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();
    if (existing.some((r) => r.userId === target._id)) {
      throw new Error("User is already a member of this site");
    }

    const now = Date.now();
    return await ctx.db.insert("tenantUsers", {
      tenantId: args.tenantId,
      userId: target._id,
      role: args.role || "member",
      createdAt: now,
    });
  },
});

export const removeTenantUser = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    membershipId: v.id("tenantUsers"),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Unauthorized");
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== ownerId) throw new Error("Not found");
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.tenantId !== args.tenantId) throw new Error("Membership not found");
    await ctx.db.delete(args.membershipId);
    return { success: true };
  },
});

// ─── Tenant Ledger ──────────────────────────────────────────────────────────

export const addLedgerEntry = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    userId: v.id("users"),
    amount: v.number(),
    description: v.string(),
    type: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Unauthorized");
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== ownerId) throw new Error("Not found");
    const now = Date.now();
    return await ctx.db.insert("tenantLedger", {
      tenantId: args.tenantId,
      userId: args.userId,
      amount: args.amount,
      description: args.description,
      type: args.type,
      createdAt: now,
    });
  },
});

export const creditDemoAccount = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    userId: v.id("users"),
    amount: v.number(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Unauthorized");
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== ownerId) throw new Error("Not found");
    const now = Date.now();
    await ctx.db.insert("tenantLedger", {
      tenantId: args.tenantId,
      userId: args.userId,
      amount: Math.abs(args.amount),
      description: args.description || "Account credit",
      type: "credit",
      createdAt: now,
    });
    // Notify the target user.
    await ctx.db.insert("notifications", {
      userId: args.userId,
      title: "Account credited",
      message: `Your ${tenant.siteType} account at ${tenant.siteName} was credited with ${Math.abs(args.amount)}.`,
      type: "wallet",
      isRead: false,
      link: "/business",
      createdAt: now,
    });
    return { success: true };
  },
});

export const debitDemoAccount = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    userId: v.id("users"),
    amount: v.number(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Unauthorized");
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== ownerId) throw new Error("Not found");
    const now = Date.now();
    await ctx.db.insert("tenantLedger", {
      tenantId: args.tenantId,
      userId: args.userId,
      amount: -Math.abs(args.amount),
      description: args.description || "Account debit",
      type: "debit",
      createdAt: now,
    });
    await ctx.db.insert("notifications", {
      userId: args.userId,
      title: "Account debited",
      message: `Your ${tenant.siteType} account at ${tenant.siteName} was debited with ${Math.abs(args.amount)}.`,
      type: "wallet",
      isRead: false,
      link: "/business",
      createdAt: now,
    });
    return { success: true };
  },
});

/** KYC audit history — owner or admin. */
export const kycHistory = query({
  args: { kycId: v.id("kycRecords") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    const kyc = await ctx.db.get(args.kycId);
    if (!kyc) return [];
    if (kyc.userId !== userId && user?.role !== "admin") return [];
    return await ctx.db
      .query("kycEvents")
      .withIndex("by_kyc", (q) => q.eq("kycId", args.kycId))
      .order("asc")
      .collect();
  },
});
