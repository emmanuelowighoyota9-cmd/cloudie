import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, internalMutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

export const VALID_PLANS = ["free", "starter", "pro", "enterprise"] as const;
export const VALID_LIFECYCLE = ["draft", "active", "suspended", "disabled", "archived"] as const;

async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const uid = await getAuthUserId(ctx);
  if (!uid) throw new Error("UNAUTHORIZED");
  const who = await ctx.db.get(uid);
  if (!who || who.role !== "admin") throw new Error("FORBIDDEN: admin only");
  if (who.isSuspended) throw new Error("FORBIDDEN: admin account suspended");
  return { adminId: uid, admin: who };
}

function toAudit(ctx: MutationCtx, adminId: Id<"users">, adminEmail: string | undefined, action: string, resource: string, resourceId: string, before: unknown, after: unknown, reason?: string) {
  return ctx.db.insert("auditLogs", { actorId: adminId, actorEmail: adminEmail, action, resource, resourceId, before: before as any, after: after as any, reason, createdAt: Date.now() });
}

export const listTemplates = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("bankingTemplates").withIndex("by_name").collect();
  },
});

export const upsertTemplate = mutation({
  args: {
    name: v.string(),
    bankName: v.string(),
    displayName: v.string(),
    slug: v.optional(v.string()),
    currency: v.string(),
    country: v.optional(v.string()),
    timezone: v.optional(v.string()),
    supportEmail: v.optional(v.string()),
    supportPhone: v.optional(v.string()),
    plan: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    accentColor: v.optional(v.string()),
    features: v.object({
      customerPortal: v.boolean(),
      accounts: v.boolean(),
      transfers: v.boolean(),
      deposits: v.boolean(),
      withdrawals: v.boolean(),
      kyc: v.boolean(),
      statements: v.boolean(),
      notifications: v.boolean(),
      auditLogging: v.boolean(),
      realtime: v.boolean(),
    }),
  },
  handler: async (ctx, args) => {
    const { adminId, admin } = await requireAdmin(ctx);
    const existing = await ctx.db.query("bankingTemplates").withIndex("by_name", q => q.eq("name", args.name)).first();
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, { bankName: args.bankName, displayName: args.displayName, slug: args.slug, currency: args.currency, country: args.country, timezone: args.timezone, supportEmail: args.supportEmail, supportPhone: args.supportPhone, plan: args.plan, primaryColor: args.primaryColor, accentColor: args.accentColor, features: args.features, updatedAt: now });
      await toAudit(ctx as MutationCtx, adminId, admin.email, "BANKING_TEMPLATE_UPDATED", "bankingTemplate", existing._id, null, args);
      return { id: existing._id, created: false };
    }
    const id = await ctx.db.insert("bankingTemplates", { name: args.name, bankName: args.bankName, displayName: args.displayName, slug: args.slug, currency: args.currency, country: args.country, timezone: args.timezone, supportEmail: args.supportEmail, supportPhone: args.supportPhone, plan: args.plan, primaryColor: args.primaryColor, accentColor: args.accentColor, features: args.features, createdBy: adminId, createdAt: now, updatedAt: now });
    await toAudit(ctx as MutationCtx, adminId, admin.email, "BANKING_TEMPLATE_CREATED", "bankingTemplate", id, null, args);
    return { id, created: true };
  },
});

export const ensureCrestlineTemplate = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const targetName = "Crestline Capital Banking Template";
    const existing = await ctx.db.query("bankingTemplates").withIndex("by_name", q => q.eq("name", targetName)).first();
    const data = {
      name: targetName,
      bankName: "Crestline Capital",
      displayName: "Crestline Capital",
      slug: "crestline-capital",
      currency: "USD",
      country: "United States",
      timezone: "America/New_York",
      supportEmail: "support@crestline-capital.g0ki.com",
      supportPhone: "+1 (800) 000-0000",
      plan: "enterprise" as const,
      primaryColor: "#0f172a",
      accentColor: "#0ea5e9",
      features: { customerPortal: true, accounts: true, transfers: true, deposits: true, withdrawals: true, kyc: true, statements: true, notifications: true, auditLogging: true, realtime: true },
    };
    if (existing) await ctx.db.patch(existing._id, { ...data, updatedAt: now });
    else await ctx.db.insert("bankingTemplates", { ...data, createdAt: now, updatedAt: now });
    return { ok: true };
  },
});

/** Super Admin: generic tenant creation for all 5 tenant types from /admin/tenants/new. */
export const createAdminTenant = mutation({
  args: {
    siteType: v.union(v.literal("bank"), v.literal("logistics"), v.literal("ticketing"), v.literal("business"), v.literal("services"), v.literal("investment")),
    tenantName: v.string(),
    displayName: v.optional(v.string()),
    slug: v.optional(v.string()),
    subdomain: v.string(),
    currency: v.optional(v.string()),
    country: v.optional(v.string()),
    timezone: v.optional(v.string()),
    contactEmail: v.string(),
    contactPhone: v.optional(v.string()),
    supportEmail: v.optional(v.string()),
    supportPhone: v.optional(v.string()),
    plan: v.optional(v.string()),
    lifecycleStatus: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    accentColor: v.optional(v.string()),
    templateSlug: v.optional(v.string()),
    bankingFeatures: v.optional(v.object({
      customerPortal: v.boolean(),
      accounts: v.boolean(),
      transfers: v.boolean(),
      deposits: v.boolean(),
      withdrawals: v.boolean(),
      kyc: v.boolean(),
      statements: v.boolean(),
      notifications: v.boolean(),
      auditLogging: v.boolean(),
      realtime: v.boolean(),
    })),
  },
  handler: async (ctx, args) => {
    const { adminId, admin } = await requireAdmin(ctx);
    const now = Date.now();
    const siteType = (args.siteType ?? "bank") as string;
    const isBanking = siteType === "bank";
    const currency = (args.currency ?? (isBanking ? "USD" : "USD")).toString().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("INVALID_CURRENCY: 3-letter ISO code");
    const sub = args.subdomain.trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]{2,60}$/.test(sub)) throw new Error("INVALID_SUBDOMAIN: 3-60 chars, lowercase, hyphens only");
    if (args.plan && !VALID_PLANS.includes(args.plan as any)) throw new Error(`INVALID_PLAN: ${VALID_PLANS.join("|")}`);
    const status = args.lifecycleStatus ?? "active";
    if (!VALID_LIFECYCLE.includes(status as any)) throw new Error(`INVALID_LIFECYCLE: ${VALID_LIFECYCLE.join("|")}`);
    const existingSub = await ctx.db.query("tenantSites").withIndex("by_subdomain", q => q.eq("subdomain", sub)).first();
    if (existingSub) throw new Error("DUPLICATE_DOMAIN_SUBDOMAIN");
    if (args.slug) {
      const slug = args.slug.trim().toLowerCase();
      const existingSlug = await ctx.db.query("tenantSites").withIndex("by_slug", q => q.eq("slug", slug).eq("siteType", siteType as any)).first();
      if (existingSlug) throw new Error("DUPLICATE_SLUG");
    }
    const isActive = !["disabled", "suspended", "archived", "draft"].includes(status);
    const row: Record<string, unknown> = {
      ownerId: adminId,
      siteName: args.tenantName.trim(),
      displayName: (args.displayName ?? args.tenantName).trim(),
      slug: args.slug?.trim().toLowerCase() || sub,
      subdomain: sub,
      siteType: siteType as any,
      currency,
      country: args.country?.trim(),
      timezone: args.timezone?.trim(),
      supportEmail: (args.supportEmail ?? args.contactEmail).trim(),
      supportPhone: (args.supportPhone ?? args.contactPhone ?? "").trim(),
      plan: (args.plan ?? (isBanking ? "enterprise" : "starter")).toString(),
      lifecycleStatus: status,
      bankingEnabled: isBanking ? true : false,
      isActive,
      renewalDate: now + 365 * 24 * 3600 * 1000,
      branding: { primaryColor: args.primaryColor, accentColor: args.accentColor },
      contactEmail: args.contactEmail.trim(),
      contactPhone: args.contactPhone?.trim(),
      createdAt: now,
    };
    const tenantId = await ctx.db.insert("tenantSites", row as any);
    await toAudit(ctx as MutationCtx, adminId, admin.email, isBanking ? "BANKING_TENANT_CREATED" : "TENANT_CREATED", "tenantSite", tenantId, null, row);
    if (isBanking) {
      await ctx.db.insert("bankingFeeConfig", { tenantId, transferFeeMinor: 0, withdrawalFeeMinor: 0, currency, updatedBy: adminId, updatedAt: now });
      if (args.bankingFeatures) {
        // store feature flags as template-like record linked to tenant for explainability
        await ctx.db.insert("auditLogs", { actorId: adminId, actorEmail: admin.email, action: "BANKING_FEATURES_CONFIGURED", resource: "tenantSite", resourceId: tenantId, after: args.bankingFeatures, createdAt: now });
      }
      if (args.templateSlug) {
        const tpl = await ctx.db.query("bankingTemplates").withIndex("by_slug", q => q.eq("slug", args.templateSlug!)).first();
        if (tpl) await ctx.db.patch(tenantId, { branding: { primaryColor: tpl.primaryColor, accentColor: tpl.accentColor } } as any);
      }
    }
    const suffix = isBanking ? "/banking" : "";
    return { id: tenantId, subdomain: sub, siteType, suffix };
  },
});

/** Super Admin: create banking tenant (full form from /admin/tenants/new). */
export const createBankingTenant = mutation({
  args: {
    // Banking tenant type is always "bank"; siteType is stored as "bank".
    bankName: v.string(),
    displayName: v.optional(v.string()),
    slug: v.optional(v.string()),
    subdomain: v.string(),
    currency: v.string(),
    country: v.optional(v.string()),
    timezone: v.optional(v.string()),
    contactEmail: v.string(),
    contactPhone: v.optional(v.string()),
    supportEmail: v.optional(v.string()),
    supportPhone: v.optional(v.string()),
    plan: v.optional(v.string()),
    lifecycleStatus: v.optional(v.string()),
    primaryColor: v.optional(v.string()),
    accentColor: v.optional(v.string()),
    // Optional template to copy defaults from
    templateSlug: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { adminId, admin } = await requireAdmin(ctx);
    const now = Date.now();

    // Validations
    const sub = args.subdomain.trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]{2,60}$/.test(sub)) throw new Error("INVALID_SUBDOMAIN: 3-60 chars, lowercase, hyphens only");
    if (!/^[A-Z]{3}$/.test(args.currency)) throw new Error("INVALID_CURRENCY: 3-letter ISO code");
    if (args.plan && !VALID_PLANS.includes(args.plan as any)) throw new Error(`INVALID_PLAN: ${VALID_PLANS.join("|")}`);
    const status = args.lifecycleStatus ?? "active";
    if (!VALID_LIFECYCLE.includes(status as any)) throw new Error(`INVALID_LIFECYCLE: ${VALID_LIFECYCLE.join("|")}`);

    const existingSub = await ctx.db.query("tenantSites").withIndex("by_subdomain", q => q.eq("subdomain", sub)).first();
    if (existingSub) throw new Error("DUPLICATE_DOMAIN_SUBDOMAIN");
    if (args.slug) {
      const slug = args.slug.trim().toLowerCase();
      const existingSlug = await ctx.db.query("tenantSites").withIndex("by_slug", q => q.eq("slug", slug).eq("siteType", "bank")).first();
      if (existingSlug) throw new Error("DUPLICATE_SLUG");
    }

    const isActive = status !== "disabled" && status !== "archived" && status !== "draft" && status !== "suspended";
    const row = {
      ownerId: adminId,
      siteName: args.bankName.trim(),
      displayName: (args.displayName ?? args.bankName).trim(),
      slug: args.slug?.trim().toLowerCase() || sub,
      subdomain: sub,
      siteType: "bank" as const,
      currency: args.currency,
      country: args.country?.trim(),
      timezone: args.timezone?.trim(),
      supportEmail: (args.supportEmail ?? args.contactEmail).trim(),
      supportPhone: (args.supportPhone ?? args.contactPhone ?? "").trim(),
      plan: (args.plan ?? "enterprise").toString(),
      lifecycleStatus: status,
      bankingEnabled: true,
      isActive,
      renewalDate: now + 365 * 24 * 3600 * 1000,
      branding: { primaryColor: args.primaryColor, accentColor: args.accentColor },
      contactEmail: args.contactEmail.trim(),
      contactPhone: args.contactPhone?.trim(),
      createdAt: now,
    } as any;

    const tenantId = await ctx.db.insert("tenantSites", row);
    await toAudit(ctx as MutationCtx, adminId, admin.email, "BANKING_TENANT_CREATED", "tenantSite", tenantId, null, row);

    // Seed default fee/limits row (auditable)
    await ctx.db.insert("bankingFeeConfig", { tenantId, transferFeeMinor: 0, withdrawalFeeMinor: 0, currency: args.currency, updatedBy: adminId, updatedAt: now });

    // Optional: copy template branding if templateSlug
    if (args.templateSlug) {
      const tpl = await ctx.db.query("bankingTemplates").withIndex("by_slug", q => q.eq("slug", args.templateSlug!)).first();
      if (tpl) {
        await ctx.db.patch(tenantId, { branding: { primaryColor: tpl.primaryColor, accentColor: tpl.accentColor } } as any);
      }
    }

    return { id: tenantId, subdomain: sub };
  },
});

export const updateBankingTenant = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    siteName: v.optional(v.string()),
    displayName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    supportEmail: v.optional(v.string()),
    supportPhone: v.optional(v.string()),
    plan: v.optional(v.string()),
    currency: v.optional(v.string()),
    country: v.optional(v.string()),
    timezone: v.optional(v.string()),
    branding: v.optional(v.object({ logo: v.optional(v.string()), primaryColor: v.optional(v.string()), accentColor: v.optional(v.string()) })),
    // Financial config (audited)
    feeConfig: v.optional(v.object({
      transferFeeMinor: v.optional(v.number()),
      withdrawalFeeMinor: v.optional(v.number()),
      depositFeeMinor: v.optional(v.number()),
      dailyTransferLimitMinor: v.optional(v.number()),
      dailyWithdrawalLimitMinor: v.optional(v.number()),
      perTransactionLimitMinor: v.optional(v.number()),
      minTransactionMinor: v.optional(v.number()),
    })),
  },
  handler: async (ctx, args) => {
    const { adminId, admin } = await requireAdmin(ctx);
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.siteType !== "bank") throw new Error("TENANT_NOT_FOUND");
    const now = Date.now();
    const before = { ...tenant };
    const patch: Record<string, any> = {};
    const access = ((k: string) => (args as any)[k]) as (k: string) => any;
    for (const key of ["siteName", "displayName", "contactEmail", "contactPhone", "supportEmail", "supportPhone", "plan", "currency", "country", "timezone"]) {
      const val = access(key);
      if (val !== undefined) patch[key] = typeof val === "string" ? val.trim() : val;
    }
    if (args.branding) patch.branding = args.branding;
    if (Object.keys(patch).length) await ctx.db.patch(args.tenantId, patch);
    await toAudit(ctx as MutationCtx, adminId, admin.email, "BANKING_TENANT_UPDATED", "tenantSite", args.tenantId, before, patch);

    if (args.feeConfig) {
      let record = await ctx.db.query("bankingFeeConfig").withIndex("by_tenant", q => q.eq("tenantId", args.tenantId)).first();
      const beforeFee = record ? { ...record } : null;
      const currencyForRow = (patch.currency ?? (tenant as any).currency ?? "USD").toString();
      if (!record) {
        const id = await ctx.db.insert("bankingFeeConfig", { tenantId: args.tenantId, transferFeeMinor: 0, withdrawalFeeMinor: 0, currency: currencyForRow, ...args.feeConfig, updatedBy: adminId, updatedAt: now });
        await toAudit(ctx as MutationCtx, adminId, admin.email, "BANKING_FEES_CREATED", "bankingFeeConfig", id, null, { tenantId: args.tenantId, ...args.feeConfig });
      } else {
        const next: Record<string, any> = { updatedBy: adminId, updatedAt: now };
        for (const [k, val] of Object.entries(args.feeConfig)) if (val !== undefined) next[k] = val;
        await ctx.db.patch(record._id, next);
        await toAudit(ctx as MutationCtx, adminId, admin.email, "BANKING_FEES_UPDATED", "bankingFeeConfig", record._id, beforeFee, next);
      }
    }
    return { success: true };
  },
});

/** Super Admin: set banking tenant lifecycle (active/suspended/disabled/archived/restore). */
export const setTenantLifecycle = mutation({
  args: { tenantId: v.id("tenantSites"), status: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    const { adminId, admin } = await requireAdmin(ctx);
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.siteType !== "bank") throw new Error("TENANT_NOT_FOUND");
    if (!VALID_LIFECYCLE.includes(args.status as any)) throw new Error(`INVALID_LIFECYCLE: ${VALID_LIFECYCLE.join("|")}`);
    const before = { lifecycleStatus: (tenant as any).lifecycleStatus ?? "active", isActive: tenant.isActive };
    const isActive = !["disabled", "suspended", "archived", "draft"].includes(args.status);
    // Preserve all historical data per spec: status flip only, no deletion.
    await ctx.db.patch(args.tenantId, { lifecycleStatus: args.status, isActive } as any);
    await toAudit(ctx as MutationCtx, adminId, admin.email, `TENANT_LIFECYCLE_${args.status.toUpperCase()}`, "tenantSite", args.tenantId, before, { lifecycleStatus: args.status, isActive }, args.reason);
    // Notify tenant owner
    await ctx.db.insert("notifications", { userId: (tenant as any).ownerId, title: `Tenant ${args.status}`, message: `${tenant.siteName} is now ${args.status}. Reason: ${args.reason}`, type: "system", isRead: false, createdAt: Date.now() });
    return { success: true, isActive };
  },
});

export const getTenantForAdmin = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await ctx.db.get(args.tenantId);
  },
});

export const listBankingTenants = query({
  args: { limit: v.optional(v.number()), lifecycle: v.optional(v.string()), search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    let rows = await ctx.db.query("tenantSites").order("desc").take(Math.min(args.limit ?? 100, 500));
    rows = rows.filter(r => r.siteType === "bank");
    if (args.lifecycle) rows = rows.filter(r => ((r as any).lifecycleStatus ?? (r.isActive ? "active" : "disabled")) === args.lifecycle);
    if (args.search?.trim()) {
      const t = args.search.toLowerCase();
      rows = rows.filter(r => r.siteName.toLowerCase().includes(t) || (r.subdomain ?? "").toLowerCase().includes(t) || ((r as any).displayName ?? "").toLowerCase().includes(t));
    }
    return rows;
  },
});

export const getBankingFeeConfig = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await ctx.db.query("bankingFeeConfig").withIndex("by_tenant", q => q.eq("tenantId", args.tenantId)).first();
  },
});

export const health = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.siteType !== "bank") throw new Error("TENANT_NOT_FOUND");
    const rows = await ctx.db.query("tenantSites").order("desc").take(1); // smoke — DB reachable
    return {
      tenantId: args.tenantId,
      isActive: (tenant as any).isActive,
      lifecycleStatus: (tenant as any).lifecycleStatus ?? (tenant.isActive ? "active" : "disabled"),
      reachable: !!rows,
      updatedAt: Date.now(),
    };
  },
});
