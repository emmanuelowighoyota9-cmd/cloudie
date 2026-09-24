import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Custom organization name.
 *
 * Every user can issue their own clean documents under their own
 * organization — no platform branding required. The value is stored on the
 * user row so it is available to any render surface that needs a letterhead.
 */

const MAX_ORG_NAME = 80;

function sanitizeOrganizationName(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, MAX_ORG_NAME);
}

export const getMyOrganization = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { organizationName: "" };
    const user = await ctx.db.get(userId);
    return { organizationName: user?.organizationName ?? "" };
  },
});

export const setMyOrganization = mutation({
  args: { organizationName: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const organizationName = sanitizeOrganizationName(args.organizationName);
    await ctx.db.patch(userId, { organizationName });
    return { organizationName };
  },
});
