import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { effectivePointsCost } from "./pricing";

export const upload = mutation({
  args: {
    name: v.string(),
    url: v.string(),
    type: v.string(),
    size: v.number(),
    folder: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    return await ctx.db.insert("assets", {
      userId,
      name: args.name,
      url: args.url,
      type: args.type,
      size: args.size,
      folder: args.folder,
      createdAt: Date.now(),
    });
  },
});

export const listAssets = query({
  args: { folder: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const all = await ctx.db
      .query("assets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    if (args.folder) {
      return all.filter((a) => a.folder === args.folder).slice(0, args.limit ?? 50);
    }
    return all.slice(0, args.limit ?? 50);
  },
});

export const deleteAsset = mutation({
  args: { id: v.id("assets") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const asset = await ctx.db.get(args.id);
    if (!asset || asset.userId !== userId) throw new Error("Not found");
    await ctx.db.delete(args.id);
    return { success: true };
  },
});

export const getStorageUsage = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return 0;
    const assets = await ctx.db
      .query("assets")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect();
    return assets.reduce((sum, a) => sum + a.size, 0);
  },
});

export const createCampaign = mutation({
  args: {
    subject: v.string(),
    senderName: v.string(),
    content: v.string(),
    recipients: v.array(v.string()),
    scheduledAt: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if (args.recipients.length === 0) throw new Error("Add at least one recipient");
    if (args.recipients.length > 200) {
      throw new Error("MAX_RECIPIENTS: up to 200 recipients per campaign batch");
    }

    // Centralized email service gate: never charge for mail that cannot be
    // delivered, and never silently drop it either.
    const readiness: { ready: boolean; enabled: boolean; apiKeyConfigured: boolean; senderConfigured: boolean; statusMessage: string | null } =
      await ctx.runQuery(internal.emailAdmin.getDispatchReadiness, {});
    if (!readiness.ready) {
      const reason = !readiness.apiKeyConfigured
        ? "Elastic Email is not configured yet."
        : !readiness.senderConfigured
          ? "The sender email and name are not configured yet."
          : !readiness.enabled
            ? "Transactional email is currently disabled by the platform administrator."
            : "Transactional email is currently unavailable.";
      throw new Error(`EMAIL_UNAVAILABLE: ${reason} No points were charged.`);
    }

    // Per-recipient price is admin-configurable (service: email_per_recipient)
    const perRecipient = await effectivePointsCost(ctx, "email_per_recipient", 10);
    const pointsCost = args.recipients.length * perRecipient;
    const balance = user.pointsBalance ?? 0;
    if (balance < pointsCost) {
      throw new Error(`Insufficient points. Need ${pointsCost} points.`);
    }

    const newBalance = balance - pointsCost;
    await ctx.db.patch(userId, { pointsBalance: newBalance });
    await ctx.db.insert("pointLedger", {
      userId,
      amount: -pointsCost,
      balanceAfter: newBalance,
      description: `Email campaign: ${args.subject}`,
      type: "email_dispatch",
      createdAt: Date.now(),
    });

    const now = Date.now();
    const campaignId = await ctx.db.insert("emailCampaigns", {
      userId,
      subject: args.subject,
      senderName: args.senderName,
      content: args.content,
      recipients: args.recipients,
      status: "scheduled",
      scheduledAt: args.scheduledAt,
      totalRecipients: args.recipients.length,
      pointsCost,
      createdAt: now,
    });

    for (const email of args.recipients) {
      await ctx.db.insert("emailDeliveries", {
        campaignId,
        recipientEmail: email,
        status: "pending",
      });
    }

    // Hand the batch to the centralized email service, which renders, sanitizes,
    // delivers through Elastic Email, and flips each delivery row to its real
    // outcome. Future-dated campaigns are queued at their scheduled time.
    const delay = args.scheduledAt && args.scheduledAt > now ? args.scheduledAt - now : 0;
    await ctx.scheduler.runAfter(delay, internal.email.enqueueCampaign, {
      campaignId,
      subject: args.subject,
      userId,
      contentHtml: args.content,
      recipients: args.recipients.slice(0, 200),
    });

    return campaignId;
  },
});

export const listCampaigns = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("emailCampaigns")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const getCampaignDeliveries = query({
  args: { campaignId: v.id("emailCampaigns") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const campaign = await ctx.db.get(args.campaignId);
    if (!campaign || campaign.userId !== userId) return [];
    return await ctx.db
      .query("emailDeliveries")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .collect();
  },
});
