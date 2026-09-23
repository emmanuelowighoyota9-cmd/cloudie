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

/**
 * ─── Modern banking templates ───────────────────────────────────────────────
 *
 * Each template is a complete modern banking kit: it shapes BOTH surfaces a
 * tenant gets — the customer banking app (theming, copy, surfaces) and the
 * tenant admin console (density/label language) — plus the operating defaults
 * (currency, plan, region, support, feature set). Provisioning a tenant applies
 * the whole kit in one step instead of hand-painting colours afterwards.
 */
export type BankingTemplateFeatures = {
  customerPortal: boolean;
  accounts: boolean;
  transfers: boolean;
  deposits: boolean;
  withdrawals: boolean;
  kyc: boolean;
  statements: boolean;
  notifications: boolean;
  auditLogging: boolean;
  realtime: boolean;
};

export type BankingTemplateKit = {
  name: string;
  slug: string;
  bankName: string;
  displayName: string;
  currency: string;
  country: string;
  timezone: string;
  supportEmail: string;
  supportPhone: string;
  plan: string;
  primaryColor: string;
  accentColor: string;
  themeMode: "light" | "dark";
  surfaceColor: string;
  radius: string;
  tagline: string;
  heroHeadline: string;
  customerAppStyle: string;
  adminConsoleStyle: string;
  description: string;
  features: BankingTemplateFeatures;
};

const ALL_FEATURES_ON: BankingTemplateFeatures = {
  customerPortal: true,
  accounts: true,
  transfers: true,
  deposits: true,
  withdrawals: true,
  kyc: true,
  statements: true,
  notifications: true,
  auditLogging: true,
  realtime: true,
};

export const MODERN_BANKING_TEMPLATES: BankingTemplateKit[] = [
  {
    name: "Aurora Digital Bank",
    slug: "aurora-digital",
    bankName: "Aurora Digital Bank",
    displayName: "Aurora Digital Bank",
    currency: "USD",
    country: "United States",
    timezone: "America/New_York",
    supportEmail: "support@aurora-digital.g0ki.com",
    supportPhone: "+1 (800) 220-7788",
    plan: "pro",
    primaryColor: "#0B4F6C",
    accentColor: "#0FA3A3",
    themeMode: "light",
    surfaceColor: "#F5F9FB",
    radius: "1rem",
    tagline: "Everyday banking that moves at the speed of you.",
    heroHeadline: "Banking, reimagined for the everyday",
    customerAppStyle: "Neo-fintech: soft surfaces, mint accents, card-first dashboard",
    adminConsoleStyle: "Airy analytics console: wide cards, live activity rail",
    description:
      "Modern consumer fintech look. Bright surfaces, high-contrast cards and a mobile-first account experience for mass-market digital banking.",
    features: { ...ALL_FEATURES_ON },
  },
  {
    name: "Meridian Private Bank",
    slug: "meridian-private",
    bankName: "Meridian Private Bank",
    displayName: "Meridian Private Bank",
    currency: "GBP",
    country: "United Kingdom",
    timezone: "Europe/London",
    supportEmail: "concierge@meridian-private.g0ki.com",
    supportPhone: "+44 20 7946 0812",
    plan: "enterprise",
    primaryColor: "#0B1220",
    accentColor: "#C8A24A",
    themeMode: "dark",
    surfaceColor: "#0F172A",
    radius: "0.5rem",
    tagline: "Discretion, precision and wealth intelligence — in one private desk.",
    heroHeadline: "Private banking, engineered for scale",
    customerAppStyle: "Dark luxury: champagne accents, dense statements, concierge entry",
    adminConsoleStyle: "Operator console: high-density tables, risk-first layout",
    description:
      "Dark, premium wealth-management theme suited to private banking, family-office and concierge-service tenants.",
    features: { ...ALL_FEATURES_ON },
  },
  {
    name: "Northwind Credit Union",
    slug: "northwind-union",
    bankName: "Northwind Credit Union",
    displayName: "Northwind Credit Union",
    currency: "USD",
    country: "United States",
    timezone: "America/Chicago",
    supportEmail: "members@northwind-union.g0ki.com",
    supportPhone: "+1 (877) 445-2210",
    plan: "starter",
    primaryColor: "#14532D",
    accentColor: "#D97706",
    themeMode: "light",
    surfaceColor: "#F3F8F4",
    radius: "1.25rem",
    tagline: "Member-owned banking with a human voice.",
    heroHeadline: "Banking owned by its members",
    customerAppStyle: "Friendly member portal: rounded cards, plain-language guidance",
    adminConsoleStyle: "Guided service desk: queue-first inbox, member timeline",
    description:
      "Approachable community/credit-union theme with generous rounding, warm accents and member-support oriented admin tooling.",
    features: { ...ALL_FEATURES_ON, realtime: false },
  },
  {
    name: "Crestline Capital",
    slug: "crestline-capital",
    bankName: "Crestline Capital",
    displayName: "Crestline Capital",
    currency: "USD",
    country: "United States",
    timezone: "America/New_York",
    supportEmail: "support@crestline-capital.g0ki.com",
    supportPhone: "+1 (800) 000-0000",
    plan: "enterprise",
    primaryColor: "#0F172A",
    accentColor: "#0EA5E9",
    themeMode: "light",
    surfaceColor: "#F8FAFC",
    radius: "0.75rem",
    tagline: "Institutional-grade banking infrastructure.",
    heroHeadline: "Banking infrastructure for modern institutions",
    customerAppStyle: "Institutional: restrained navy/sky palette, ledger-first statements",
    adminConsoleStyle: "Supervisory console: compliance and ledger controls front and centre",
    description:
      "The reference enterprise look: navy and sky, restrained type, compliance-first console. Default template for institutional tenants.",
    features: { ...ALL_FEATURES_ON },
  },
];

/**
 * Idempotently create/refresh the modern template catalog. Safe to call any
 * number of times; never touches custom templates an operator created.
 */
export const ensureModernBankingTemplates = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let created = 0;
    let updated = 0;
    for (const kit of MODERN_BANKING_TEMPLATES) {
      const existing = await ctx.db
        .query("bankingTemplates")
        .withIndex("by_slug", (q) => q.eq("slug", kit.slug))
        .first();
      const row = {
        name: kit.name,
        bankName: kit.bankName,
        displayName: kit.displayName,
        slug: kit.slug,
        currency: kit.currency,
        country: kit.country,
        timezone: kit.timezone,
        supportEmail: kit.supportEmail,
        supportPhone: kit.supportPhone,
        plan: kit.plan,
        primaryColor: kit.primaryColor,
        accentColor: kit.accentColor,
        themeMode: kit.themeMode,
        surfaceColor: kit.surfaceColor,
        radius: kit.radius,
        tagline: kit.tagline,
        heroHeadline: kit.heroHeadline,
        customerAppStyle: kit.customerAppStyle,
        adminConsoleStyle: kit.adminConsoleStyle,
        description: kit.description,
        features: kit.features,
      };
      if (existing) {
        await ctx.db.patch(existing._id, { ...row, updatedAt: now });
        updated++;
      } else {
        await ctx.db.insert("bankingTemplates", { ...row, createdAt: now, updatedAt: now });
        created++;
      }
    }
    return { created, updated, total: MODERN_BANKING_TEMPLATES.length };
  },
});

/** Admin-triggered catalog refresh (button on the tenancy creation screen). */
export const seedModernBankingTemplates = mutation({
  args: {},
  handler: async (ctx) => {
    const { adminId, admin } = await requireAdmin(ctx);
    const now = Date.now();
    let created = 0;
    for (const kit of MODERN_BANKING_TEMPLATES) {
      const existing = await ctx.db
        .query("bankingTemplates")
        .withIndex("by_slug", (q) => q.eq("slug", kit.slug))
        .first();
      if (existing) continue;
      await ctx.db.insert("bankingTemplates", {
        name: kit.name,
        bankName: kit.bankName,
        displayName: kit.displayName,
        slug: kit.slug,
        currency: kit.currency,
        country: kit.country,
        timezone: kit.timezone,
        supportEmail: kit.supportEmail,
        supportPhone: kit.supportPhone,
        plan: kit.plan,
        primaryColor: kit.primaryColor,
        accentColor: kit.accentColor,
        themeMode: kit.themeMode,
        surfaceColor: kit.surfaceColor,
        radius: kit.radius,
        tagline: kit.tagline,
        heroHeadline: kit.heroHeadline,
        customerAppStyle: kit.customerAppStyle,
        adminConsoleStyle: kit.adminConsoleStyle,
        description: kit.description,
        features: kit.features,
        createdBy: adminId,
        createdAt: now,
        updatedAt: now,
      });
      created++;
    }
    await toAudit(ctx as MutationCtx, adminId, admin.email, "BANKING_TEMPLATES_SEEDED", "bankingTemplate", "modern-catalog", null, { created });
    return { created };
  },
});

/** Resolve a template by slug, falling back to the newest template available. */
async function resolveTemplate(ctx: QueryCtx | MutationCtx, slug?: string) {
  if (slug) {
    const found = await ctx.db
      .query("bankingTemplates")
      .withIndex("by_slug", (q) => q.eq("slug", slug))
      .first();
    if (found) return found;
  }
  return await ctx.db.query("bankingTemplates").withIndex("by_name").first();
}

/** The design kit + operating defaults a template contributes to a tenant. */
function templateBranding(tpl: {
  slug?: string;
  primaryColor?: string;
  accentColor?: string;
  themeMode?: string;
  surfaceColor?: string;
  radius?: string;
  tagline?: string;
  heroHeadline?: string;
  customerAppStyle?: string;
  adminConsoleStyle?: string;
}) {
  return {
    primaryColor: tpl.primaryColor,
    accentColor: tpl.accentColor,
    themeMode: tpl.themeMode ?? "light",
    surfaceColor: tpl.surfaceColor,
    radius: tpl.radius ?? "0.75rem",
    tagline: tpl.tagline,
    heroHeadline: tpl.heroHeadline,
    customerAppStyle: tpl.customerAppStyle,
    adminConsoleStyle: tpl.adminConsoleStyle,
    templateSlug: tpl.slug,
  };
}

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
    // Modern design kit (customer app + admin console)
    themeMode: v.optional(v.string()),
    surfaceColor: v.optional(v.string()),
    radius: v.optional(v.string()),
    tagline: v.optional(v.string()),
    heroHeadline: v.optional(v.string()),
    customerAppStyle: v.optional(v.string()),
    adminConsoleStyle: v.optional(v.string()),
    description: v.optional(v.string()),
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
    const now = Date.now();
    const design = {
      themeMode: args.themeMode,
      surfaceColor: args.surfaceColor,
      radius: args.radius,
      tagline: args.tagline,
      heroHeadline: args.heroHeadline,
      customerAppStyle: args.customerAppStyle,
      adminConsoleStyle: args.adminConsoleStyle,
      description: args.description,
    };
    // Keyed by slug when supplied, so a custom kit cannot fork the catalog.
    const existing = args.slug
      ? await ctx.db.query("bankingTemplates").withIndex("by_slug", q => q.eq("slug", args.slug)).first()
      : await ctx.db.query("bankingTemplates").withIndex("by_name", q => q.eq("name", args.name)).first();
    if (existing) {
      await ctx.db.patch(existing._id, { name: args.name, bankName: args.bankName, displayName: args.displayName, slug: args.slug, currency: args.currency, country: args.country, timezone: args.timezone, supportEmail: args.supportEmail, supportPhone: args.supportPhone, plan: args.plan, primaryColor: args.primaryColor, accentColor: args.accentColor, ...design, features: args.features, updatedAt: now });
      await toAudit(ctx as MutationCtx, adminId, admin.email, "BANKING_TEMPLATE_UPDATED", "bankingTemplate", existing._id, null, args);
      return { id: existing._id, created: false };
    }
    const id = await ctx.db.insert("bankingTemplates", { name: args.name, bankName: args.bankName, displayName: args.displayName, slug: args.slug, currency: args.currency, country: args.country, timezone: args.timezone, supportEmail: args.supportEmail, supportPhone: args.supportPhone, plan: args.plan, primaryColor: args.primaryColor, accentColor: args.accentColor, ...design, features: args.features, createdBy: adminId, createdAt: now, updatedAt: now });
    await toAudit(ctx as MutationCtx, adminId, admin.email, "BANKING_TEMPLATE_CREATED", "bankingTemplate", id, null, args);
    return { id, created: true };
  },
});

/**
 * Legacy entry point kept for existing callers: ensures the full modern
 * catalog exists (Crestline Capital included) without forking duplicates.
 */
export const ensureCrestlineTemplate = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let created = 0;
    let updated = 0;
    for (const kit of MODERN_BANKING_TEMPLATES) {
      const existing = await ctx.db
        .query("bankingTemplates")
        .withIndex("by_slug", (q) => q.eq("slug", kit.slug))
        .first();
      const row = {
        name: kit.name,
        bankName: kit.bankName,
        displayName: kit.displayName,
        slug: kit.slug,
        currency: kit.currency,
        country: kit.country,
        timezone: kit.timezone,
        supportEmail: kit.supportEmail,
        supportPhone: kit.supportPhone,
        plan: kit.plan,
        primaryColor: kit.primaryColor,
        accentColor: kit.accentColor,
        themeMode: kit.themeMode,
        surfaceColor: kit.surfaceColor,
        radius: kit.radius,
        tagline: kit.tagline,
        heroHeadline: kit.heroHeadline,
        customerAppStyle: kit.customerAppStyle,
        adminConsoleStyle: kit.adminConsoleStyle,
        description: kit.description,
        features: kit.features,
      };
      if (existing) {
        await ctx.db.patch(existing._id, { ...row, updatedAt: now });
        updated++;
      } else {
        await ctx.db.insert("bankingTemplates", { ...row, createdAt: now, updatedAt: now });
        created++;
      }
    }
    return { ok: true, created, updated };
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
    const tpl = isBanking ? await resolveTemplate(ctx, args.templateSlug) : null;
    const branding = tpl
      ? {
          ...templateBranding(tpl),
          primaryColor: args.primaryColor || tpl.primaryColor,
          accentColor: args.accentColor || tpl.accentColor,
        }
      : { primaryColor: args.primaryColor, accentColor: args.accentColor, themeMode: "light", radius: "0.75rem" };
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
      plan: (args.plan ?? tpl?.plan ?? (isBanking ? "enterprise" : "starter")).toString(),
      lifecycleStatus: status,
      bankingEnabled: isBanking ? true : false,
      isActive,
      renewalDate: now + 365 * 24 * 3600 * 1000,
      branding,
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
      if (tpl) {
        await ctx.db.insert("auditLogs", {
          actorId: adminId,
          actorEmail: admin.email,
          action: "BANKING_TEMPLATE_APPLIED",
          resource: "tenantSite",
          resourceId: tenantId,
          after: { slug: tpl.slug, name: tpl.name, themeMode: branding.themeMode, customerAppStyle: tpl.customerAppStyle, adminConsoleStyle: tpl.adminConsoleStyle },
          createdAt: now,
        });
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

    // Apply the modern banking kit (customer app + admin console design, plus
    // region/plan/support defaults) before anything is written, so the tenant is
    // themed correctly from its first render. Explicit form values always win.
    const tpl = await resolveTemplate(ctx, args.templateSlug);
    const branding = tpl
      ? {
          ...templateBranding(tpl),
          primaryColor: args.primaryColor || tpl.primaryColor,
          accentColor: args.accentColor || tpl.accentColor,
        }
      : { primaryColor: args.primaryColor, accentColor: args.accentColor, themeMode: "light", radius: "0.75rem" };

    const row = {
      ownerId: adminId,
      siteName: args.bankName.trim(),
      displayName: (args.displayName ?? tpl?.displayName ?? args.bankName).trim(),
      slug: args.slug?.trim().toLowerCase() || sub,
      subdomain: sub,
      siteType: "bank" as const,
      currency: args.currency,
      country: args.country?.trim() || tpl?.country,
      timezone: args.timezone?.trim() || tpl?.timezone,
      supportEmail: (args.supportEmail ?? tpl?.supportEmail ?? args.contactEmail).trim(),
      supportPhone: (args.supportPhone ?? tpl?.supportPhone ?? args.contactPhone ?? "").trim(),
      plan: (args.plan ?? tpl?.plan ?? "enterprise").toString(),
      lifecycleStatus: status,
      bankingEnabled: true,
      isActive,
      renewalDate: now + 365 * 24 * 3600 * 1000,
      branding,
      contactEmail: args.contactEmail.trim(),
      contactPhone: args.contactPhone?.trim(),
      createdAt: now,
    } as any;

    const tenantId = await ctx.db.insert("tenantSites", row);
    await toAudit(ctx as MutationCtx, adminId, admin.email, "BANKING_TENANT_CREATED", "tenantSite", tenantId, null, {
      ...row,
      templateApplied: tpl ? { slug: tpl.slug, name: tpl.name, customerAppStyle: tpl.customerAppStyle, adminConsoleStyle: tpl.adminConsoleStyle } : null,
    });

    // Seed default fee/limits row (auditable)
    await ctx.db.insert("bankingFeeConfig", { tenantId, transferFeeMinor: 0, withdrawalFeeMinor: 0, currency: args.currency, updatedBy: adminId, updatedAt: now });

    return { id: tenantId, subdomain: sub, templateApplied: tpl?.slug ?? null };
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
    branding: v.optional(v.object({
      logo: v.optional(v.string()),
      primaryColor: v.optional(v.string()),
      accentColor: v.optional(v.string()),
      // Design kit (customer app + admin console) — optional so partial saves
      // never wipe the kit applied from a banking template.
      themeMode: v.optional(v.string()),
      surfaceColor: v.optional(v.string()),
      radius: v.optional(v.string()),
      tagline: v.optional(v.string()),
      heroHeadline: v.optional(v.string()),
      customerAppStyle: v.optional(v.string()),
      adminConsoleStyle: v.optional(v.string()),
      templateSlug: v.optional(v.string()),
    })),
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
    // Merge so editing one field (e.g. logo) keeps the rest of the design kit.
    if (args.branding) patch.branding = { ...((tenant as any).branding ?? {}), ...args.branding };
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

/**
 * Super Admin: apply a modern banking template kit to an existing tenant.
 *
 * Creation always applies a kit, but tenants provisioned before the catalog (or
 * ones being rebranded) need a way to adopt one. The kit themes both surfaces —
 * the customer banking app and the tenant admin console — and can optionally
 * pull across the template's operating defaults (region, plan, support contacts).
 * The logo and any field the template leaves unset are preserved.
 */
export const applyBankingTemplateToTenant = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    templateSlug: v.string(),
    applyOperatingDefaults: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { adminId, admin } = await requireAdmin(ctx);
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.siteType !== "bank") throw new Error("TENANT_NOT_FOUND");
    const tpl = await resolveTemplate(ctx, args.templateSlug);
    if (!tpl) throw new Error(`TEMPLATE_NOT_FOUND: ${args.templateSlug}`);
    const now = Date.now();
    const before = { branding: (tenant as any).branding ?? {}, plan: (tenant as any).plan };

    const kit = templateBranding(tpl);
    const branding: Record<string, unknown> = { ...((tenant as any).branding ?? {}) };
    for (const [k, val] of Object.entries(kit)) if (val !== undefined) branding[k] = val;

    const patch: Record<string, unknown> = { branding };
    if (args.applyOperatingDefaults) {
      if (tpl.plan) patch.plan = tpl.plan;
      if (tpl.country) patch.country = tpl.country;
      if (tpl.timezone) patch.timezone = tpl.timezone;
      if (tpl.supportEmail) patch.supportEmail = tpl.supportEmail;
    }
    await ctx.db.patch(args.tenantId, patch as any);
    await toAudit(ctx as MutationCtx, adminId, admin.email, "BANKING_TEMPLATE_APPLIED", "tenantSite", args.tenantId, before, {
      templateSlug: tpl.slug,
      kit,
      operatingDefaultsApplied: !!args.applyOperatingDefaults,
    });

    return {
      template: { slug: tpl.slug, name: tpl.name, customerAppStyle: tpl.customerAppStyle, adminConsoleStyle: tpl.adminConsoleStyle },
      branding,
      appliedAt: now,
    };
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
