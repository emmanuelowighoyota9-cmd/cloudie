import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";

// Apex hosts that serve the app itself, never a tenant. `cloudieexpress.duckdns.org`
// is the app's custom production domain. Without this guard the generic branch at
// the end returns "cloudieexpress" as a subdomain for that host.
const APP_APEX_HOSTS = [
  "cloudieexpress.duckdns.org",
  "g0ki.com",
  "vly.sh",
  "vercel.app",
  "convex.site",
  "convex.cloud",
];

// Extract subdomain from a host string. Handles *.g0ki.com wildcard, preview hosts, localhost.
function extractSubdomain(host: string): string | null {
  const h = host.trim().toLowerCase();
  // strip port
  const withoutPort = h.split(":")[0] ?? h;
  if (APP_APEX_HOSTS.includes(withoutPort)) return null;
  // known suffixes in order of specificity
  const suffixes = [".g0ki.com", ".vercel.app", ".convex.site", ".convex.cloud", ".vly.sh"];
  for (const sfx of suffixes) {
    if (withoutPort.endsWith(sfx)) {
      const prefix = withoutPort.slice(0, -sfx.length);
      // take first label only (wildcard prefix)
      const label = prefix.split(".")[0]?.trim();
      if (label && label !== "www" && label.length >= 2) return label;
      return null;
    }
  }
  // localhost / IP — treat single label before dot as subdomain if multi-label
  const parts = withoutPort.split(".");
  if (parts.length >= 2 && withoutPort !== "localhost") {
    const first = parts[0]?.trim();
    if (first && first !== "www" && first.length >= 2) return first;
  }
  return null;
}

/**
 * Public: resolve a tenant by subdomain.
 * Returns only the public fields required to render the tenant shell.
 * Never leaks internal IDs beyond tenant _id, never leaks auth/user data.
 */
export const resolveBySubdomain = query({
  args: { subdomain: v.string() },
  handler: async (ctx, args) => {
    const sub = args.subdomain.trim().toLowerCase();
    if (!sub || sub.length < 2) return null;
    const tenant = await ctx.db
      .query("tenantSites")
      .withIndex("by_subdomain", (q) => q.eq("subdomain", sub))
      .first();
    if (!tenant) return null;
    const lifecycle = (tenant as any).lifecycleStatus ?? (tenant.isActive ? "active" : "disabled");
    const isAvailable = tenant.isActive && lifecycle === "active";
    return {
      tenantId: tenant._id,
      siteName: tenant.siteName,
      displayName: (tenant as any).displayName ?? tenant.siteName,
      siteType: tenant.siteType,
      subdomain: tenant.subdomain,
      currency: (tenant as any).currency ?? "USD",
      country: (tenant as any).country ?? null,
      lifecycleStatus: lifecycle,
      isActive: tenant.isActive,
      isAvailable,
      plan: (tenant as any).plan ?? null,
      branding: (tenant as any).branding ?? null,
      supportEmail: (tenant as any).supportEmail ?? null,
    };
  },
});

/**
 * Public: resolve the current request host to a tenant.
 * Useful for wildcard routing: frontend passes window.location.host.
 */
export const resolveByHost = query({
  args: { host: v.string() },
  handler: async (ctx, args) => {
    const sub = extractSubdomain(args.host);
    if (!sub) return { subdomain: null as string | null, tenant: null };
    const tenant = await ctx.db
      .query("tenantSites")
      .withIndex("by_subdomain", (q) => q.eq("subdomain", sub))
      .first();
    if (!tenant) return { subdomain: sub, tenant: null };
    const lifecycle = (tenant as any).lifecycleStatus ?? (tenant.isActive ? "active" : "disabled");
    const isAvailable = tenant.isActive && lifecycle === "active";
    return {
      subdomain: sub,
      tenant: {
        tenantId: tenant._id,
        siteName: tenant.siteName,
        displayName: (tenant as any).displayName ?? tenant.siteName,
        siteType: tenant.siteType,
        subdomain: tenant.subdomain,
        currency: (tenant as any).currency ?? "USD",
        lifecycleStatus: lifecycle,
        isActive: tenant.isActive,
        isAvailable,
        plan: (tenant as any).plan ?? null,
        branding: (tenant as any).branding ?? null,
      },
    };
  },
});

/** Authenticated: resolve my membership in a tenant by subdomain. */
export const myMembershipBySubdomain = query({
  args: { subdomain: v.string() },
  handler: async (ctx, args) => {
    const uid = await getAuthUserId(ctx);
    const tenant = await ctx.db
      .query("tenantSites")
      .withIndex("by_subdomain", (q) => q.eq("subdomain", args.subdomain.trim().toLowerCase()))
      .first();
    if (!tenant) return { tenant: null, isMember: false, isOwner: false };
    if (!uid) return { tenant: { _id: tenant._id, siteName: tenant.siteName }, isMember: false, isOwner: false };
    const isOwner = (tenant as any).ownerId === uid;
    const rows = await ctx.db.query("tenantUsers").withIndex("by_tenant", (q) => q.eq("tenantId", tenant._id)).collect();
    const isMember = isOwner || rows.some((r: any) => r.userId === uid);
    return { tenant: { _id: tenant._id, siteName: tenant.siteName, subdomain: tenant.subdomain }, isMember, isOwner };
  },
});

/**
 * Super-admin: provision a tenant dynamically (thin wrapper over bankingTenant created for
 * wildcard-provisioned tenants). Kept here so the HTTP provision endpoint has a single entrypoint.
 */
export const provisionTenant = mutation({
  args: {
    tenantName: v.string(),
    subdomain: v.string(),
    siteType: v.union(v.literal("bank"), v.literal("investment"), v.literal("logistics"), v.literal("ticketing"), v.literal("business"), v.literal("services")),
    currency: v.optional(v.string()),
    status: v.optional(v.string()),
    planTier: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const uid = await getAuthUserId(ctx);
    if (!uid) throw new Error("UNAUTHORIZED");
    const who = await ctx.db.get(uid);
    if (who?.role !== "admin") throw new Error("FORBIDDEN: admin only");
    const sub = args.subdomain.trim().toLowerCase();
    if (!/^[a-z][a-z0-9-]{2,60}$/.test(sub)) throw new Error("INVALID_SUBDOMAIN");
    const existing = await ctx.db.query("tenantSites").withIndex("by_subdomain", (q) => q.eq("subdomain", sub)).first();
    if (existing) throw new Error("DUPLICATE_DOMAIN_SUBDOMAIN");
    const lifecycle = (args.status ?? "active").toString();
    const allowed = ["active", "paused", "disabled", "draft", "suspended", "archived"];
    if (!allowed.includes(lifecycle)) throw new Error(`INVALID_STATUS: ${allowed.join("|")}`);
    const isActive = lifecycle === "active";
    const currency = (args.currency ?? "USD").toString().toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("INVALID_CURRENCY");
    const now = Date.now();
    const id = await ctx.db.insert("tenantSites", {
      ownerId: uid,
      siteName: args.tenantName.trim(),
      displayName: args.tenantName.trim(),
      slug: sub,
      subdomain: sub,
      siteType: args.siteType as any,
      currency,
      plan: (args.planTier ?? "free").toString(),
      lifecycleStatus: lifecycle === "paused" ? "suspended" : lifecycle,
      isActive,
      bankingEnabled: args.siteType === "bank",
      renewalDate: now + 365 * 24 * 3600 * 1000,
      branding: {},
      createdAt: now,
    } as any);
    if (args.siteType === "bank") {
      await ctx.db.insert("bankingFeeConfig", { tenantId: id, transferFeeMinor: 0, withdrawalFeeMinor: 0, currency, updatedBy: uid, updatedAt: now });
    }
    await ctx.db.insert("auditLogs", { actorId: uid, actorEmail: who.email, action: "TENANT_PROVISIONED", resource: "tenantSite", resourceId: id, after: { subdomain: sub, siteType: args.siteType }, createdAt: now });
    return { id, subdomain: sub };
  },
});
