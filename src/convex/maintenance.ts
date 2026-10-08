import { query } from "./_generated/server";
import { v } from "convex/values";

export const get = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("platformSettings").withIndex("by_key", q => q.eq("key", "maintenance_mode")).unique();
    const value = row?.value as any;
    if (!value) return { enabled: false, title: "", message: "", scheduledStartAt: null, scheduledEndAt: null, readOnly: false };
    const now = Date.now();
    const scheduledActive =
      value.enabled &&
      (!value.scheduledStartAt || now >= value.scheduledStartAt) &&
      (!value.scheduledEndAt || now < value.scheduledEndAt);
    return { ...value, enabled: Boolean(scheduledActive) };
  },
});
