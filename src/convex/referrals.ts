import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

function generateReferralCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "CLOUD-";
  for (let i = 0; i < 6; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

export const getMyCode = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return null;

    if (!user.referralCode) return null;

    const refs = await ctx.db
      .query("referrals")
      .withIndex("by_referrer", (q) => q.eq("referrerId", userId))
      .collect();
    return {
      code: user.referralCode,
      referralCount: refs.length,
    };
  },
});

export const ensureCode = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    if (user.referralCode) return user.referralCode;

    const code = generateReferralCode();
    await ctx.db.patch(userId, { referralCode: code });
    return code;
  },
});

export const applyReferral = mutation({
  args: { code: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");
    if (user.referredBy) throw new Error("Already referred by someone");

    if (user.referralCode === args.code) {
      throw new Error("Cannot refer yourself");
    }

    const referrer = await ctx.db
      .query("users")
      .withIndex("referralCode", (q) => q.eq("referralCode", args.code))
      .first();
    if (!referrer) throw new Error("Invalid referral code");

    const existing = await ctx.db
      .query("referrals")
      .withIndex("by_referred", (q) => q.eq("referredUserId", userId))
      .first();
    if (existing) throw new Error("Referral already applied");

    const now = Date.now();
    await ctx.db.patch(userId, { referredBy: referrer._id });

    const referralId = await ctx.db.insert("referrals", {
      referrerId: referrer._id,
      referredUserId: userId,
      status: "completed",
      rewardPoints: 50,
      createdAt: now,
    });

    const referrerBalance = referrer.pointsBalance ?? 0;
    await ctx.db.patch(referrer._id, { pointsBalance: referrerBalance + 50 });
    await ctx.db.insert("pointLedger", {
      userId: referrer._id,
      amount: 50,
      balanceAfter: referrerBalance + 50,
      description: "Referral reward",
      type: "referral_reward",
      referenceId: referralId,
      createdAt: now,
    });

    const userBalance = user.pointsBalance ?? 0;
    await ctx.db.patch(userId, { pointsBalance: userBalance + 25 });
    await ctx.db.insert("pointLedger", {
      userId,
      amount: 25,
      balanceAfter: userBalance + 25,
      description: "Welcome referral bonus",
      type: "referral_reward",
      referenceId: referralId,
      createdAt: now,
    });

    await ctx.db.insert("notifications", {
      userId: referrer._id,
      title: "Referral reward!",
      message: "+50 points for referring a friend",
      type: "referral_reward",
      isRead: false,
      createdAt: now,
    });
    await ctx.db.insert("notifications", {
      userId,
      title: "Welcome bonus!",
      message: "+25 points referral welcome bonus",
      type: "referral_reward",
      isRead: false,
      createdAt: now,
    });

    return { success: true };
  },
});

export const getMyReferrals = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    return await ctx.db
      .query("referrals")
      .withIndex("by_referrer", (q) => q.eq("referrerId", userId))
      .order("desc")
      .collect();
  },
});

export const getMyRewards = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];

    const all = await ctx.db
      .query("pointLedger")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    return all.filter((l) => l.type === "referral_reward").slice(0, 50);
  },
});
