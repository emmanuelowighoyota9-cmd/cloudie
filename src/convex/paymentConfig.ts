import { internalQuery } from "./_generated/server";
import { v } from "convex/values";

/**
 * Get a stored payment provider key by name from adminSettings.
 * Returns the raw value or null if not set.
 */
export const getStoredKey = internalQuery({
  args: { key: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("adminSettings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    return row ? String(row.value) : null;
  },
});
