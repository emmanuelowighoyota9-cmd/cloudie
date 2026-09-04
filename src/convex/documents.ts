import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

const DOCUMENT_COSTS: Record<string, number> = {
  flight: 150,
  hotel: 120,
  invoice: 80,
  customs: 100,
};

export const generate = mutation({
  args: {
    type: v.union(
      v.literal("flight"),
      v.literal("hotel"),
      v.literal("invoice"),
      v.literal("customs"),
    ),
    title: v.string(),
    data: v.any(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    const cost = DOCUMENT_COSTS[args.type];
    const balance = user.pointsBalance ?? 0;
    if (balance < cost) {
      throw new Error(`Insufficient points. Document generation costs ${cost} points.`);
    }

    const newBalance = balance - cost;
    await ctx.db.patch(userId, { pointsBalance: newBalance });
    await ctx.db.insert("pointLedger", {
      userId,
      amount: -cost,
      balanceAfter: newBalance,
      description: `${args.type} document generation`,
      type: "document_generation",
      createdAt: Date.now(),
    });

    const docId = await ctx.db.insert("documents", {
      userId,
      type: args.type,
      title: args.title,
      data: args.data,
      pointsCost: cost,
      createdAt: Date.now(),
    });

    await ctx.db.insert("notifications", {
      userId,
      title: "Document generated",
      message: `${args.title} ready for download`,
      type: "document_generated",
      isRead: false,
      createdAt: Date.now(),
    });

    return docId;
  },
});

export const list = query({
  args: { type: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const results = await ctx.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    if (args.type) {
      return results.filter((d) => d.type === args.type).slice(0, args.limit ?? 50);
    }
    return results.slice(0, args.limit ?? 50);
  },
});

export const get = query({
  args: { id: v.id("documents") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const doc = await ctx.db.get(args.id);
    if (!doc || doc.userId !== userId) return null;
    return doc;
  },
});

export const adminList = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return [];
    return await ctx.db.query("documents").order("desc").take(args.limit ?? 50);
  },
});
