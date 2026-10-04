import { getAuthUserId } from "@convex-dev/auth/server";
import { internalMutation, query, mutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, auditLog } from "./adminApi";
import { readPointRate } from "./pricing";

const walletTxType = v.string();

/**
 * NGN wallet — the authoritative monetary balance for Cloudie.
 *
 * Amounts are NGN major units (e.g. 1500 = ₦1,500). The legacy points fields
 * remain only as a migration bridge for existing records.
 */
async function legacyConvertedBalance(ctx: any, user: any): Promise<number> {
  if (typeof user?.walletBalanceNgn === "number" && Number.isFinite(user.walletBalanceNgn)) {
    return user.walletBalanceNgn;
  }
  const rate = await readPointRate(ctx);
  return Math.max(0, (user?.pointsBalance ?? 0) * rate.ngnPerPoint);
}

async function ensureWallet(ctx: any, userId: any): Promise<number> {
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("User not found");
  if (typeof user.walletBalanceNgn === "number" && Number.isFinite(user.walletBalanceNgn)) {
    return user.walletBalanceNgn;
  }

  const balance = await legacyConvertedBalance(ctx, user);
  await ctx.db.patch(userId, { walletBalanceNgn: balance });

  if (balance > 0) {
    const existing = await ctx.db
      .query("walletLedger")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .first();
    if (!existing) {
      await ctx.db.insert("walletLedger", {
        userId,
        amountNgn: balance,
        balanceAfterNgn: balance,
        description: "Opening balance migrated from legacy points wallet",
        type: "migration",
        reference: "legacy_points_migration",
        metadata: { legacyPointsBalance: user.pointsBalance ?? 0 },
        createdAt: Date.now(),
      });
    }
  }
  return balance;
}

export type WalletMutationArgs = {
  userId: any;
  amountNgn: number;
  description: string;
  type: string;
  reference?: string;
  referenceId?: string;
  idempotencyKey?: string;
  metadata?: unknown;
};

/** Use these helpers when another mutation needs wallet movement in the SAME transaction. */
export async function creditWallet(ctx: any, args: WalletMutationArgs) {
  if (!Number.isFinite(args.amountNgn) || args.amountNgn <= 0) throw new Error("Credit amount must be positive");
  if (args.idempotencyKey) {
    const existing = await ctx.db.query("walletLedger")
      .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", args.idempotencyKey!))
      .first();
    if (existing) return existing._id;
  }
  const balance = await ensureWallet(ctx, args.userId);
  const newBalance = Math.round((balance + args.amountNgn) * 100) / 100;
  await ctx.db.patch(args.userId, { walletBalanceNgn: newBalance });
  return await ctx.db.insert("walletLedger", {
    userId: args.userId,
    amountNgn: args.amountNgn,
    balanceAfterNgn: newBalance,
    description: args.description,
    type: args.type,
    reference: args.reference,
    referenceId: args.referenceId,
    idempotencyKey: args.idempotencyKey,
    metadata: args.metadata,
    createdAt: Date.now(),
  });
}

export async function debitWallet(ctx: any, args: WalletMutationArgs) {
  if (!Number.isFinite(args.amountNgn) || args.amountNgn <= 0) throw new Error("Debit amount must be positive");
  if (args.idempotencyKey) {
    const existing = await ctx.db.query("walletLedger")
      .withIndex("by_idempotency", (q: any) => q.eq("idempotencyKey", args.idempotencyKey!))
      .first();
    if (existing) return existing._id;
  }
  const balance = await ensureWallet(ctx, args.userId);
  if (balance + 1e-9 < args.amountNgn) throw new Error("Insufficient NGN wallet balance");
  const newBalance = Math.round((balance - args.amountNgn) * 100) / 100;
  await ctx.db.patch(args.userId, { walletBalanceNgn: newBalance });
  return await ctx.db.insert("walletLedger", {
    userId: args.userId,
    amountNgn: -args.amountNgn,
    balanceAfterNgn: newBalance,
    description: args.description,
    type: args.type,
    reference: args.reference,
    referenceId: args.referenceId,
    idempotencyKey: args.idempotencyKey,
    metadata: args.metadata,
    createdAt: Date.now(),
  });
}

export const getBalance = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (!user) return 0;
    if (typeof user.walletBalanceNgn === "number") return user.walletBalanceNgn;
    const rate = await readPointRate(ctx);
    return Math.max(0, (user.pointsBalance ?? 0) * rate.ngnPerPoint);
  },
});

export const getLedger = query({
  args: { limit: v.optional(v.number()), type: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const q = ctx.db
      .query("walletLedger")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc");
    const rows = await q.take(Math.min(args.limit ?? 100, 200));
    return args.type ? rows.filter((row) => row.type === args.type) : rows;
  },
});

export const getAdminLedger = query({
  args: { userId: v.optional(v.id("users")), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.userId) {
      return await ctx.db.query("walletLedger")
        .withIndex("by_user", (q) => q.eq("userId", args.userId!))
        .order("desc")
        .take(Math.min(args.limit ?? 100, 500));
    }
    return await ctx.db.query("walletLedger").order("desc").take(Math.min(args.limit ?? 100, 500));
  },
});

export const credit = internalMutation({
  args: {
    userId: v.id("users"),
    amountNgn: v.number(),
    description: v.string(),
    type: walletTxType,
    reference: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.amountNgn) || args.amountNgn <= 0) throw new Error("Credit amount must be positive");
    if (args.idempotencyKey) {
      const existing = await ctx.db.query("walletLedger")
        .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey!))
        .first();
      if (existing) return existing._id;
    }

    const balance = await ensureWallet(ctx, args.userId);
    const newBalance = Math.round((balance + args.amountNgn) * 100) / 100;
    await ctx.db.patch(args.userId, { walletBalanceNgn: newBalance });

    const ledgerId = await ctx.db.insert("walletLedger", {
      userId: args.userId,
      amountNgn: args.amountNgn,
      balanceAfterNgn: newBalance,
      description: args.description,
      type: args.type,
      reference: args.reference,
      referenceId: args.referenceId,
      idempotencyKey: args.idempotencyKey,
      metadata: args.metadata,
      createdAt: Date.now(),
    });

    await ctx.db.insert("notifications", {
      userId: args.userId,
      title: "Wallet credited",
      message: `+${args.amountNgn.toLocaleString("en-NG", { style: "currency", currency: "NGN" })} — ${args.description}`,
      type: "wallet_credited",
      isRead: false,
      createdAt: Date.now(),
    });
    return ledgerId;
  },
});

export const debit = internalMutation({
  args: {
    userId: v.id("users"),
    amountNgn: v.number(),
    description: v.string(),
    type: walletTxType,
    reference: v.optional(v.string()),
    referenceId: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
    metadata: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    if (!Number.isFinite(args.amountNgn) || args.amountNgn <= 0) throw new Error("Debit amount must be positive");
    if (args.idempotencyKey) {
      const existing = await ctx.db.query("walletLedger")
        .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey!))
        .first();
      if (existing) return existing._id;
    }

    const balance = await ensureWallet(ctx, args.userId);
    if (balance + 1e-9 < args.amountNgn) throw new Error("Insufficient NGN wallet balance");

    const newBalance = Math.round((balance - args.amountNgn) * 100) / 100;
    await ctx.db.patch(args.userId, { walletBalanceNgn: newBalance });

    const ledgerId = await ctx.db.insert("walletLedger", {
      userId: args.userId,
      amountNgn: -args.amountNgn,
      balanceAfterNgn: newBalance,
      description: args.description,
      type: args.type,
      reference: args.reference,
      referenceId: args.referenceId,
      idempotencyKey: args.idempotencyKey,
      metadata: args.metadata,
      createdAt: Date.now(),
    });

    await ctx.db.insert("notifications", {
      userId: args.userId,
      title: "Wallet debited",
      message: `-${args.amountNgn.toLocaleString("en-NG", { style: "currency", currency: "NGN" })} — ${args.description}`,
      type: "wallet_debited",
      isRead: false,
      createdAt: Date.now(),
    });
    return ledgerId;
  },
});

export const adminAdjust = mutation({
  args: { userId: v.id("users"), amountNgn: v.number(), reason: v.string() },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    if (!args.reason.trim()) throw new Error("A reason is required");
    const before = await ensureWallet(ctx, args.userId);
    const after = Math.round((before + args.amountNgn) * 100) / 100;
    if (after < 0) throw new Error("Adjustment would result in a negative balance");

    await ctx.db.patch(args.userId, { walletBalanceNgn: after });
    const ledgerId = await ctx.db.insert("walletLedger", {
      userId: args.userId,
      amountNgn: args.amountNgn,
      balanceAfterNgn: after,
      description: `Admin wallet adjustment: ${args.reason}`,
      type: "admin_adjustment",
      reference: "admin",
      referenceId: adminId,
      metadata: { reason: args.reason, adminId },
      createdAt: Date.now(),
    });
    await auditLog(ctx, adminId, {
      action: "WALLET_ADJUSTMENT",
      resource: "user",
      resourceId: args.userId,
      before: { walletBalanceNgn: before },
      after: { walletBalanceNgn: after, adjustmentNgn: args.amountNgn },
      reason: args.reason,
    });
    return ledgerId;
  },
});

export const migrateUser = mutation({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("User not found");
    const balance = await ensureWallet(ctx, args.userId);
    await auditLog(ctx, adminId, {
      action: "WALLET_LEGACY_MIGRATION",
      resource: "user",
      resourceId: args.userId,
      after: { walletBalanceNgn: balance },
      reason: "Converted legacy points balance to NGN wallet",
    });
    return { balanceNgn: balance };
  },
});
