import { query, mutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, auditLog } from "./adminApi";

/**
 * Platform money configuration.
 *
 * Points are the internal unit of account; NGN is the customer-facing
 * currency (Paystack settlement) with USD kept as the secondary price.
 * Admins own the conversion rate and the point packages sold to customers.
 */

export const DEFAULT_POINT_RATE = {
  ngnPerPoint: 15,
  usdPerPoint: 0.01,
};

export type PointPackage = {
  id: string;
  name: string;
  points: number;
  priceNgn: number;
  priceUsd: number;
  popular: boolean;
};

export const DEFAULT_PACKAGES: PointPackage[] = [
  { id: "starter", name: "Starter", points: 1000, priceNgn: 15000, priceUsd: 10, popular: false },
  { id: "growth", name: "Growth", points: 2800, priceNgn: 37500, priceUsd: 25, popular: true },
  { id: "scale", name: "Scale", points: 6000, priceNgn: 75000, priceUsd: 50, popular: false },
];

const RATE_KEY = "point_rate";
const PACKAGES_KEY = "point_packages";
/** Optional VTU margin, in basis points. Absent or 0 means sell at cost. */
const VTU_MARKUP_KEY = "vtu_markup_bp";

/**
 * The admin-configured naira/USD → points rate.
 *
 * Exported so the VTU purchase path prices against the SAME table every other
 * surface displays, rather than a second, drifting copy of the rate.
 */
export async function readPointRate(
  ctx: QueryCtx | MutationCtx,
): Promise<{ ngnPerPoint: number; usdPerPoint: number }> {
  return readRate(ctx as QueryCtx);
}

/** VTU margin in basis points. Defaults to 0 — no margin is invented. */
export async function readVtuMarkupBp(
  ctx: QueryCtx | MutationCtx,
): Promise<number> {
  const row = await (ctx as QueryCtx).db
    .query("adminSettings")
    .withIndex("by_key", (q) => q.eq("key", VTU_MARKUP_KEY))
    .first();
  const value = (row?.value ?? {}) as { bp?: unknown };
  return typeof value.bp === "number" && Number.isFinite(value.bp) && value.bp >= 0
    ? value.bp
    : 0;
}

const packageValidator = v.object({
  id: v.string(),
  name: v.string(),
  points: v.number(),
  priceNgn: v.number(),
  priceUsd: v.number(),
  popular: v.boolean(),
});

async function readRate(ctx: QueryCtx) {
  const row = await ctx.db
    .query("adminSettings")
    .withIndex("by_key", (q) => q.eq("key", RATE_KEY))
    .first();
  const value = (row?.value ?? {}) as Partial<typeof DEFAULT_POINT_RATE>;
  return {
    ngnPerPoint:
      typeof value.ngnPerPoint === "number" && value.ngnPerPoint > 0
        ? value.ngnPerPoint
        : DEFAULT_POINT_RATE.ngnPerPoint,
    usdPerPoint:
      typeof value.usdPerPoint === "number" && value.usdPerPoint > 0
        ? value.usdPerPoint
        : DEFAULT_POINT_RATE.usdPerPoint,
  };
}

async function readPackages(ctx: QueryCtx): Promise<PointPackage[]> {
  const row = await ctx.db
    .query("adminSettings")
    .withIndex("by_key", (q) => q.eq("key", PACKAGES_KEY))
    .first();
  const value = row?.value;
  if (!Array.isArray(value) || value.length === 0) return DEFAULT_PACKAGES;
  return value as PointPackage[];
}

/**
 * Published billing configuration. Safe for unauthenticated reads: this is
 * the same price list every customer sees on the Buy Points page.
 */
export const getBillingConfig = query({
  args: {},
  handler: async (ctx) => {
    const rate = await readRate(ctx);
    const packages = await readPackages(ctx);
    return {
      ngnPerPoint: rate.ngnPerPoint,
      usdPerPoint: rate.usdPerPoint,
      /** Implied USD → NGN rate, shown to admins for sanity checking. */
      usdNgnRate: rate.usdPerPoint > 0 ? rate.ngnPerPoint / rate.usdPerPoint : 0,
      currency: "NGN",
      packages,
    };
  },
});

/**
 * Effective point cost charged for a service.
 *
 * An active row in `pointPricing` is authoritative; when no active price has
 * been configured the caller's platform default is used. This is the single
 * source of truth for both charging and display.
 */
export async function effectivePointsCost(
  ctx: QueryCtx | MutationCtx,
  service: string,
  fallbackPoints: number,
): Promise<number> {
  const row = await ctx.db
    .query("pointPricing")
    .withIndex("by_service", (q) => q.eq("service", service))
    .first();
  if (row && row.isActive && row.pointsCost > 0) return row.pointsCost;
  return fallbackPoints;
}

/**
 * Active per-service price list. Drives costing on every customer surface so
 * an admin-set price is what customers actually see.
 */
export const getServicePrices = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("pointPricing").withIndex("by_service").collect();
    const rate = await readRate(ctx);
    return rows
      .filter((r) => r.isActive)
      .map((r) => ({
        service: r.service,
        pointsCost: r.pointsCost,
        priceNgn: r.priceNgn ?? r.pointsCost * rate.ngnPerPoint,
        priceUsd: r.priceUsd ?? r.pointsCost * rate.usdPerPoint,
      }));
  },
});

/** Admin: set how many naira (and dollars) one point is worth. */
export const updatePointRate = mutation({
  args: {
    ngnPerPoint: v.number(),
    usdPerPoint: v.number(),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    if (!Number.isFinite(args.ngnPerPoint) || args.ngnPerPoint <= 0) {
      throw new Error("INVALID_NGN_RATE");
    }
    if (!Number.isFinite(args.usdPerPoint) || args.usdPerPoint <= 0) {
      throw new Error("INVALID_USD_RATE");
    }

    const now = Date.now();
    const before = await readRate(ctx);
    const existing = await ctx.db
      .query("adminSettings")
      .withIndex("by_key", (q) => q.eq("key", RATE_KEY))
      .first();

    const value = { ngnPerPoint: args.ngnPerPoint, usdPerPoint: args.usdPerPoint };
    if (existing) {
      await ctx.db.patch(existing._id, { value, updatedBy: adminId, updatedAt: now });
    } else {
      await ctx.db.insert("adminSettings", {
        key: RATE_KEY,
        value,
        category: "pricing",
        updatedBy: adminId,
        updatedAt: now,
      });
    }

    await auditLog(ctx, adminId, {
      action: "POINT_RATE_CHANGED",
      resource: "adminSettings",
      resourceId: RATE_KEY,
      before,
      after: value,
      reason: "Updated point conversion rate",
    });

    return value;
  },
});

/** Admin: replace the point packages customers can buy. */
export const savePointPackages = mutation({
  args: { packages: v.array(packageValidator) },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    if (args.packages.length === 0) throw new Error("PACKAGES_REQUIRED");
    if (args.packages.length > 12) throw new Error("TOO_MANY_PACKAGES");

    const seen = new Set<string>();
    for (const pkg of args.packages) {
      const id = pkg.id.trim().toLowerCase();
      if (!id) throw new Error("INVALID_PACKAGE_ID");
      if (seen.has(id)) throw new Error(`DUPLICATE_PACKAGE:${id}`);
      seen.add(id);
      if (!pkg.name.trim()) throw new Error(`INVALID_PACKAGE_NAME:${id}`);
      if (!Number.isFinite(pkg.points) || pkg.points <= 0) throw new Error(`INVALID_POINTS:${id}`);
      if (!Number.isFinite(pkg.priceNgn) || pkg.priceNgn < 0) throw new Error(`INVALID_NGN_PRICE:${id}`);
      if (!Number.isFinite(pkg.priceUsd) || pkg.priceUsd < 0) throw new Error(`INVALID_USD_PRICE:${id}`);
    }

    const before = await readPackages(ctx);
    const packages: PointPackage[] = args.packages.map((pkg) => ({
      id: pkg.id.trim().toLowerCase(),
      name: pkg.name.trim(),
      points: pkg.points,
      priceNgn: pkg.priceNgn,
      priceUsd: pkg.priceUsd,
      popular: pkg.popular,
    }));

    const now = Date.now();
    const existing = await ctx.db
      .query("adminSettings")
      .withIndex("by_key", (q) => q.eq("key", PACKAGES_KEY))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, { value: packages, updatedBy: adminId, updatedAt: now });
    } else {
      await ctx.db.insert("adminSettings", {
        key: PACKAGES_KEY,
        value: packages,
        category: "pricing",
        updatedBy: adminId,
        updatedAt: now,
      });
    }

    await auditLog(ctx, adminId, {
      action: "POINT_PACKAGES_CHANGED",
      resource: "adminSettings",
      resourceId: PACKAGES_KEY,
      before,
      after: packages,
      reason: "Updated point packages",
    });

    return { count: packages.length };
  },
});
