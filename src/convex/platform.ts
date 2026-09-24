import { query, mutation, MutationCtx, QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { requireAdmin, auditLog } from "./adminApi";
import {
  DEFAULT_BRAND,
  DEFAULT_SUPPORT,
  sanitizeBrand,
  sanitizeSupport,
} from "../lib/platformConfig";

/**
 * Platform appearance + customer-support configuration.
 *
 * Stored as two rows in `adminSettings` (category "appearance" / "support") so
 * every change flows through the existing SETTING_CHANGED audit trail.
 * `getPublicConfig` is intentionally unauthenticated: the public landing page,
 * the support widget and the white-label tenant sites all read from it. Only
 * allow-listed, sanitized fields are ever returned — never raw row values.
 */

const BRAND_KEY = "brand_config";
const SUPPORT_KEY = "support_config";

async function readRow(ctx: QueryCtx | MutationCtx, key: string) {
  return await ctx.db
    .query("adminSettings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
}

async function writeRow(
  ctx: MutationCtx,
  adminId: Id<"users">,
  key: string,
  category: string,
  value: unknown,
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("adminSettings")
    .withIndex("by_key", (q) => q.eq("key", key))
    .first();
  if (existing) {
    await ctx.db.patch(existing._id, { value, category, updatedBy: adminId, updatedAt: now });
  } else {
    await ctx.db.insert("adminSettings", { key, value, category, updatedBy: adminId, updatedAt: now });
  }
  return now;
}

/** Public: sanitized brand + support configuration with defaults applied. */
export const getPublicConfig = query({
  args: {},
  handler: async (ctx) => {
    const brandRow = await readRow(ctx, BRAND_KEY);
    const supportRow = await readRow(ctx, SUPPORT_KEY);
    return {
      brand: sanitizeBrand(brandRow?.value),
      support: sanitizeSupport(supportRow?.value),
      hasCustomBrand: brandRow !== null,
      updatedAt: Math.max(brandRow?.updatedAt ?? 0, supportRow?.updatedAt ?? 0),
    };
  },
});

/** Admin: persist brand/design tokens. Unknown or unsafe fields are dropped. */
export const saveBrand = mutation({
  args: { brand: v.any() },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const before = sanitizeBrand((await readRow(ctx, BRAND_KEY))?.value);
    const brand = sanitizeBrand(args.brand);
    await writeRow(ctx, adminId, BRAND_KEY, "appearance", brand);
    await auditLog(ctx, adminId, {
      action: "SETTING_CHANGED",
      resource: "platformBrand",
      resourceId: BRAND_KEY,
      before,
      after: brand,
      reason: "Appearance & branding updated",
    });
    return { brand };
  },
});

/** Admin: persist customer-support details and FAQ entries. */
export const saveSupport = mutation({
  args: { support: v.any() },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const before = sanitizeSupport((await readRow(ctx, SUPPORT_KEY))?.value);
    const support = sanitizeSupport(args.support);
    await writeRow(ctx, adminId, SUPPORT_KEY, "support", support);
    await auditLog(ctx, adminId, {
      action: "SETTING_CHANGED",
      resource: "platformSupport",
      resourceId: SUPPORT_KEY,
      before,
      after: support,
      reason: "Customer support configuration updated",
    });
    return { support };
  },
});

/** Admin: reset both configuration documents back to platform defaults. */
export const resetConfig = mutation({
  args: {},
  handler: async (ctx) => {
    const { adminId } = await requireAdmin(ctx);
    await writeRow(ctx, adminId, BRAND_KEY, "appearance", DEFAULT_BRAND);
    await writeRow(ctx, adminId, SUPPORT_KEY, "support", DEFAULT_SUPPORT);
    await auditLog(ctx, adminId, {
      action: "SETTING_CHANGED",
      resource: "platformConfig",
      after: { brand: DEFAULT_BRAND, support: DEFAULT_SUPPORT },
      reason: "Appearance and support configuration reset to defaults",
    });
    return { brand: DEFAULT_BRAND, support: DEFAULT_SUPPORT };
  },
});
