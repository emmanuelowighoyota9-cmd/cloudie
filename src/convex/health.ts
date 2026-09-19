import { internalQuery } from "./_generated/server";

/**
 * Lightweight connectivity probe used by the public health endpoint.
 *
 * Uses bounded reads (`.take(1)`) so a health check can never load a table.
 * Returns only non-sensitive aggregate state — never credentials, URLs, or
 * user data.
 */
export const ping = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Proves the database is readable. Throws if the deployment is unreachable.
    await ctx.db.query("users").take(1);

    const queuedJobs = await ctx.db
      .query("cloudieJobs")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .take(100);
    const failedJobs = await ctx.db
      .query("cloudieJobs")
      .withIndex("by_status", (q) => q.eq("status", "failed"))
      .take(100);

    return {
      database: "connected" as const,
      queuedJobs: queuedJobs.length,
      failedJobs: failedJobs.length,
    };
  },
});
