import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { readPointRate } from "./pricing";
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
    const rate = await readPointRate(ctx);
    const referrerRewardNgn = 50 * rate.ngnPerPoint;
    const welcomeRewardNgn = 25 * rate.ngnPerPoint;

    const referralId = await ctx.db.insert("referrals", {
      referrerId: referrer._id,
      referredUserId: userId,
      status: "completed",
      rewardPoints: 0,
      rewardNgn: referrerRewardNgn,
      createdAt: now,
    });

    await ctx.runMutation(internal.wallet.credit, {
      userId: referrer._id,
      amountNgn: referrerRewardNgn,
      description: "Referral reward",
      type: "referral_reward",
      referenceId: referralId,
      idempotencyKey: `referral-referrer-${referralId}`,
    });

    await ctx.runMutation(internal.wallet.credit, {
      userId,
      amountNgn: welcomeRewardNgn,
      description: "Welcome referral bonus",
      type: "referral_reward",
      referenceId: referralId,
      idempotencyKey: `referral-welcome-${referralId}`,
    });

    await ctx.db.insert("notifications", {
      userId: referrer._id,
      title: "Referral reward!",
      message: `+₦${referrerRewardNgn.toLocaleString("en-NG")} for referring a friend`,
      type: "referral_reward",
      isRead: false,
      createdAt: now,
    });
    await ctx.db.insert("notifications", {
      userId,
      title: "Welcome bonus!",
      message: `+₦${welcomeRewardNgn.toLocaleString("en-NG")} welcome referral bonus`,
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
      .query("walletLedger")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    return all.filter((l) => l.type === "referral_reward").slice(0, 50);
  },
});
