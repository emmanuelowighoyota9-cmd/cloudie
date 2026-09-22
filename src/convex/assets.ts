import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
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

    const status = args.scheduledAt ? "scheduled" : "sent";

    const campaignId = await ctx.db.insert("emailCampaigns", {
      userId,
      subject: args.subject,
      senderName: args.senderName,
      content: args.content,
      recipients: args.recipients,
      status: status as "scheduled" | "sent",
      scheduledAt: args.scheduledAt,
      sentAt: status === "sent" ? Date.now() : undefined,
      totalRecipients: args.recipients.length,
      pointsCost,
      createdAt: Date.now(),
    });

    for (const email of args.recipients) {
      await ctx.db.insert("emailDeliveries", {
        campaignId,
        recipientEmail: email,
        status: status === "sent" ? "sent" : "pending",
        sentAt: status === "sent" ? Date.now() : undefined,
      });
    }

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
