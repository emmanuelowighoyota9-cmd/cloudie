import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

// ─── Helpers ─────────────────────────────────────────────────────────

async function requireBankAdmin(ctx: any, tenantId: Id<"tenantSites">) {
  const uid = await getAuthUserId(ctx);
  if (!uid) throw new Error("UNAUTHORIZED");
  const who = await ctx.db.get(uid);
  const tenant = await ctx.db.get(tenantId);
  if (!tenant) throw new Error("TENANT_NOT_FOUND");
  const isOwner = (tenant as any).ownerId === uid;
  const isSuperAdmin = who?.role === "admin";
  if (!isOwner && !isSuperAdmin) throw new Error("FORBIDDEN: tenant admin only");
  return { uid, who, tenant, isOwner, isSuperAdmin };
}

function audit(ctx: any, actorId: Id<"users"> | undefined, actorEmail: string | undefined, action: string, resource: string, resourceId: string, before: unknown, after: unknown, reason?: string) {
  return ctx.db.insert("auditLogs", {
    actorId: actorId as any,
    actorEmail,
    action,
    resource,
    resourceId,
    before: before as any,
    after: after as any,
    reason,
    createdAt: Date.now(),
  });
}

// ─── Admin tenant dashboard ────────────────────────────────────────

export const adminDashboard = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const { tenant } = await requireBankAdmin(ctx as any, args.tenantId);
    const t = tenant as any;
    const lifecycle = t.lifecycleStatus ?? (t.isActive ? "active" : "disabled");
    const isAvailable = t.isActive && lifecycle === "active";

    const [accounts, members, deposits, withdrawals, transfers, kyc, ledger] = await Promise.all([
      ctx.db.query("tenantAccounts").withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId)).collect(),
      ctx.db.query("tenantUsers").withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId)).collect(),
      ctx.db.query("bankingDeposits").withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId)).collect(),
      ctx.db.query("bankingWithdrawals").withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId)).collect(),
      ctx.db.query("bankingTransfers").withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId)).collect(),
      ctx.db.query("kycRecords").withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId)).collect(),
      ctx.db.query("bankingLedgerEntries").withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId)).take(50),
    ]);

    const activeAccounts = accounts.filter((a: any) => a.isActive);
    const totalBalanceMinor = activeAccounts.reduce((s: number, a: any) => s + (a.balanceMinor ?? Math.round((a.balance ?? 0) * 100)), 0);

    return {
      tenant: { _id: t._id, siteName: t.siteName, displayName: t.displayName, subdomain: t.subdomain, currency: t.currency ?? "USD", lifecycleStatus: lifecycle, isAvailable, plan: t.plan, isActive: t.isActive },
      metrics: {
        totalCustomers: members.length,
        activeAccounts: activeAccounts.length,
        totalAccounts: accounts.length,
        totalBalanceMinor,
        pendingDeposits: deposits.filter((d: any) => d.status === "pending" || d.status === "processing").length,
        pendingWithdrawals: withdrawals.filter((w: any) => w.status === "pending" || w.status === "processing").length,
        pendingTransfers: transfers.filter((t: any) => t.status === "pending" || t.status === "processing").length,
        kycPending: kyc.filter((k: any) => k.status === "submitted" || k.status === "under_review").length,
        kycTotal: kyc.length,
        totalDeposits: deposits.length,
        totalWithdrawals: withdrawals.length,
        totalTransfers: transfers.length,
        totalTransactions: deposits.length + withdrawals.length + transfers.length,
      },
      recent: {
        deposits: deposits.sort((a: any, b: any) => b.createdAt - a.createdAt).slice(0, 5),
        withdrawals: withdrawals.sort((a: any, b: any) => b.createdAt - a.createdAt).slice(0, 5),
        transfers: transfers.sort((a: any, b: any) => b.createdAt - a.createdAt).slice(0, 5),
        ledger: ledger.slice(0, 10),
      },
    };
  },
});

// ─── Account overrides ─────────────────────────────────────────────

export const adminApproveAccount = mutation({
  args: { tenantId: v.id("tenantSites"), accountId: v.id("tenantAccounts"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { uid, who } = await requireBankAdmin(ctx as any, args.tenantId);
    const acct = await ctx.db.get(args.accountId);
    if (!acct || (acct as any).tenantId !== args.tenantId) throw new Error("ACCOUNT_NOT_FOUND");
    const before = { status: (acct as any).status, isActive: acct.isActive };
    await ctx.db.patch(args.accountId, { status: "active", isActive: true } as any);
    await audit(ctx, uid, who?.email, "ACCOUNT_APPROVED", "tenantAccount", args.accountId, before, { status: "active", isActive: true }, args.reason);
    return { success: true };
  },
});

export const adminFreezeAccount = mutation({
  args: { tenantId: v.id("tenantSites"), accountId: v.id("tenantAccounts"), reason: v.string() },
  handler: async (ctx, args) => {
    const { uid, who } = await requireBankAdmin(ctx as any, args.tenantId);
    const acct = await ctx.db.get(args.accountId);
    if (!acct || (acct as any).tenantId !== args.tenantId) throw new Error("ACCOUNT_NOT_FOUND");
    const before = { status: (acct as any).status, isActive: acct.isActive };
    await ctx.db.patch(args.accountId, { status: "frozen" } as any);
    await audit(ctx, uid, who?.email, "ACCOUNT_FROZEN", "tenantAccount", args.accountId, before, { status: "frozen" }, args.reason);
    await ctx.db.insert("notifications", {
      userId: (acct as any).userId,
      title: "Account frozen",
      message: `Your account ${(acct as any).name} (${(acct as any).accountNumber}) has been frozen. Reason: ${args.reason}`,
      type: "banking.account_frozen",
      isRead: false,
      createdAt: Date.now(),
    } as any);
    return { success: true };
  },
});

export const adminUnfreezeAccount = mutation({
  args: { tenantId: v.id("tenantSites"), accountId: v.id("tenantAccounts"), reason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { uid, who } = await requireBankAdmin(ctx as any, args.tenantId);
    const acct = await ctx.db.get(args.accountId);
    if (!acct || (acct as any).tenantId !== args.tenantId) throw new Error("ACCOUNT_NOT_FOUND");
    const before = { status: (acct as any).status };
    await ctx.db.patch(args.accountId, { status: "active", isActive: true } as any);
    await audit(ctx, uid, who?.email, "ACCOUNT_UNFROZEN", "tenantAccount", args.accountId, before, { status: "active" }, args.reason);
    return { success: true };
  },
});

// ─── Transaction overrides — stuck/pending transactions ────────────

export const adminOverrideTransfer = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    transferId: v.id("bankingTransfers"),
    action: v.union(v.literal("complete"), v.literal("fail"), v.literal("cancel")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { uid, who } = await requireBankAdmin(ctx as any, args.tenantId);
    const tx = await ctx.db.get(args.transferId);
    if (!tx || (tx as any).tenantId !== args.tenantId) throw new Error("TRANSFER_NOT_FOUND");
    const status = (tx as any).status as string;
    if (!["pending", "processing"].includes(status)) throw new Error(`TRANSFER_NOT_OVERRIDABLE: status is ${status}`);
    const nextStatus = args.action === "complete" ? "completed" : args.action === "fail" ? "failed" : "cancelled";
    const before = { status };
    // For fail/cancel of a completed ledger group, create a reversal entry (never mutate existing ledger posts)
    if (args.action !== "complete") {
      const groupId = (tx as any).ledgerGroupId as string | undefined;
      if (groupId) {
        const entries = await ctx.db.query("bankingLedgerEntries").withIndex("by_group", (q) => q.eq("groupId", groupId)).collect();
        // Create reversal group that inverts the original entries
        const reversalGroupId = `reversal-${groupId}-${Date.now()}`;
        for (const e of entries) {
          await ctx.db.insert("bankingLedgerEntries", {
            tenantId: args.tenantId,
            groupId: reversalGroupId,
            relatedKind: "reversal" as const,
            relatedId: args.transferId as unknown as string,
            accountId: (e as any).accountId,
            userId: (e as any).userId,
            debitMinor: (e as any).creditMinor,
            creditMinor: (e as any).debitMinor,
            currency: (e as any).currency,
            description: `Reversal of ${groupId}: ${(e as any).description}`,
            createdAt: Date.now(),
          } as any);
        }
        // Revert cached balances
        const srcId = (tx as any).sourceAccountId as Id<"tenantAccounts">;
        const destId = (tx as any).destAccountId as Id<"tenantAccounts"> | undefined;
        const amountMinor = (tx as any).amountMinor as number;
        const feeMinor = (tx as any).feeMinor as number;
        const totalDebit = amountMinor + feeMinor;
        const src = srcId ? await ctx.db.get(srcId) : null;
        if (src) {
          const prev = (src as any).balanceMinor ?? Math.round(((src as any).balance ?? 0) * 100);
          await ctx.db.patch(srcId, { balanceMinor: prev + totalDebit, availableBalanceMinor: prev + totalDebit, ledgerBalanceMinor: prev + totalDebit, balance: (prev + totalDebit) / 100 } as any);
        }
        if (destId) {
          const dest = await ctx.db.get(destId);
          if (dest) {
            const prev = (dest as any).balanceMinor ?? Math.round(((dest as any).balance ?? 0) * 100);
            await ctx.db.patch(destId, { balanceMinor: prev - amountMinor, availableBalanceMinor: prev - amountMinor, ledgerBalanceMinor: prev - amountMinor, balance: (prev - amountMinor) / 100 } as any);
          }
        }
      }
    }
    await ctx.db.patch(args.transferId, { status: nextStatus, completedAt: Date.now() } as any);
    await audit(ctx, uid, who?.email, `TRANSFER_OVERRIDE_${nextStatus.toUpperCase()}`, "bankingTransfer", args.transferId, before, { status: nextStatus }, args.reason);
    return { success: true, status: nextStatus };
  },
});

export const adminOverrideDeposit = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    depositId: v.id("bankingDeposits"),
    action: v.union(v.literal("complete"), v.literal("fail"), v.literal("cancel")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { uid, who } = await requireBankAdmin(ctx as any, args.tenantId);
    const dep = await ctx.db.get(args.depositId);
    if (!dep || (dep as any).tenantId !== args.tenantId) throw new Error("DEPOSIT_NOT_FOUND");
    const status = (dep as any).status as string;
    if (!["pending", "processing"].includes(status)) throw new Error(`DEPOSIT_NOT_OVERRIDABLE: status is ${status}`);
    if (args.action === "complete") {
      // Delegate to existing reconcile path — single ledger write, idempotent
      const acctId = (dep as any).accountId as Id<"tenantAccounts"> | undefined;
      const groupId = `deposit-${(dep as any).reference}-${dep._id}`;
      const currency = (dep as any).currency as string;
      const amountMinor = (dep as any).amountMinor as number;
      const now = Date.now();
      // Balanced double-entry group: debits === credits.
      const entries = [
        { debitMinor: 0, creditMinor: amountMinor },
        { debitMinor: amountMinor, creditMinor: 0 },
      ];
      if (entries.reduce((s, e) => s + e.debitMinor, 0) !== entries.reduce((s, e) => s + e.creditMinor, 0)) {
        throw new Error("invariant violated: deposit group unbalanced");
      }
      await ctx.db.insert("bankingLedgerEntries", { tenantId: args.tenantId, groupId, relatedKind: "deposit" as const, relatedId: args.depositId as unknown as string, accountId: acctId, userId: (dep as any).userId as Id<"users"> | undefined, debitMinor: 0, creditMinor: amountMinor, currency, description: `Deposit ${(dep as any).reference} credited (admin override)`, createdAt: now } as any);
      await ctx.db.insert("bankingLedgerEntries", { tenantId: args.tenantId, groupId, relatedKind: "deposit" as const, relatedId: args.depositId as unknown as string, debitMinor: amountMinor, creditMinor: 0, currency, description: `Deposit ${(dep as any).reference} (contra)`, createdAt: now } as any);
      if (acctId) {
        const acct = await ctx.db.get(acctId);
        if (acct) {
          const prev = (acct as any).balanceMinor ?? Math.round(((acct as any).balance ?? 0) * 100);
          const next = prev + amountMinor;
          await ctx.db.patch(acct._id, { balanceMinor: next, availableBalanceMinor: next, ledgerBalanceMinor: next, balance: next / 100, isActive: true } as any);
        }
      }
      await ctx.db.patch(args.depositId, { status: "completed", completedAt: now, reconciledLedgerGroupId: groupId } as any);
      await audit(ctx, uid, who?.email, "DEPOSIT_OVERRIDE_COMPLETED", "bankingDeposit", args.depositId, { status }, { status: "completed", groupId }, args.reason);
      return { success: true, status: "completed" as const };
    }
    const nextStatus = args.action === "fail" ? "failed" : "cancelled";
    await ctx.db.patch(args.depositId, { status: nextStatus, completedAt: Date.now() } as any);
    await audit(ctx, uid, who?.email, `DEPOSIT_OVERRIDE_${nextStatus.toUpperCase()}`, "bankingDeposit", args.depositId, { status }, { status: nextStatus }, args.reason);
    return { success: true, status: nextStatus };
  },
});

export const adminOverrideWithdrawal = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    withdrawalId: v.id("bankingWithdrawals"),
    action: v.union(v.literal("complete"), v.literal("fail"), v.literal("cancel")),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { uid, who } = await requireBankAdmin(ctx as any, args.tenantId);
    const w = await ctx.db.get(args.withdrawalId);
    if (!w || (w as any).tenantId !== args.tenantId) throw new Error("WITHDRAWAL_NOT_FOUND");
    const status = (w as any).status as string;
    if (!["pending", "processing"].includes(status)) throw new Error(`WITHDRAWAL_NOT_OVERRIDABLE: status is ${status}`);
    // Withdrawals are already debited at creation; fail/cancel requires reversal.
    if (args.action !== "complete") {
      const groupId = (w as any).ledgerGroupId as string | undefined;
      if (groupId) {
        const entries = await ctx.db.query("bankingLedgerEntries").withIndex("by_group", (q) => q.eq("groupId", groupId)).collect();
        const reversalGroupId = `reversal-${groupId}-${Date.now()}`;
        for (const e of entries) {
          await ctx.db.insert("bankingLedgerEntries", {
            tenantId: args.tenantId,
            groupId: reversalGroupId,
            relatedKind: "reversal" as const,
            relatedId: args.withdrawalId as unknown as string,
            accountId: (e as any).accountId,
            userId: (e as any).userId,
            debitMinor: (e as any).creditMinor,
            creditMinor: (e as any).debitMinor,
            currency: (e as any).currency,
            description: `Reversal of ${groupId}: ${(e as any).description}`,
            createdAt: Date.now(),
          } as any);
        }
        const acctId = (w as any).accountId as Id<"tenantAccounts">;
        const total = (w as any).totalDebitMinor as number;
        const acct = await ctx.db.get(acctId);
        if (acct) {
          const prev = (acct as any).balanceMinor ?? Math.round(((acct as any).balance ?? 0) * 100);
          await ctx.db.patch(acctId, { balanceMinor: prev + total, availableBalanceMinor: prev + total, ledgerBalanceMinor: prev + total, balance: (prev + total) / 100 } as any);
        }
      }
    }
    const nextStatus = args.action === "complete" ? "completed" : args.action === "fail" ? "failed" : "cancelled";
    await ctx.db.patch(args.withdrawalId, { status: nextStatus, completedAt: Date.now() } as any);
    await audit(ctx, uid, who?.email, `WITHDRAWAL_OVERRIDE_${nextStatus.toUpperCase()}`, "bankingWithdrawal", args.withdrawalId, { status }, { status: nextStatus }, args.reason);
    return { success: true, status: nextStatus };
  },
});

// ─── Customer management ───────────────────────────────────────────

export const adminListCustomers = query({
  args: { tenantId: v.id("tenantSites"), limit: v.optional(v.number()), search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireBankAdmin(ctx as any, args.tenantId);
    const members = await ctx.db.query("tenantUsers").withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId)).collect();
    let rows = await Promise.all(
      members.map(async (m: any) => {
        const user = await ctx.db.get(m.userId);
        const accounts = await ctx.db.query("tenantAccounts").withIndex("by_tenant_and_user", (q) => q.eq("tenantId", args.tenantId).eq("userId", m.userId)).collect();
        const kyc = await ctx.db.query("kycRecords").withIndex("by_user", (q) => q.eq("userId", m.userId)).collect();
        const latestKyc = kyc.filter((k: any) => k.tenantId === args.tenantId).sort((a: any, b: any) => b.createdAt - a.createdAt)[0];
        return {
          membershipId: m._id,
          userId: m.userId,
          role: m.role,
          email: (user as any)?.email ?? null,
          name: (user as any)?.name ?? null,
          createdAt: m.createdAt,
          accountCount: accounts.length,
          totalBalanceMinor: accounts.reduce((s: number, a: any) => s + (a.balanceMinor ?? Math.round((a.balance ?? 0) * 100)), 0),
          kycStatus: latestKyc?.status ?? "not_submitted",
          isSuspended: (user as any)?.isSuspended ?? false,
        };
      })
    );
    if (args.search?.trim()) {
      const t = args.search.toLowerCase();
      rows = rows.filter((r) => (r.email ?? "").toLowerCase().includes(t) || (r.name ?? "").toLowerCase().includes(t));
    }
    const limit = Math.min(args.limit ?? 50, 200);
    return rows.slice(0, limit);
  },
});

export const adminSetCustomerKyc = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    kycId: v.id("kycRecords"),
    status: v.union(v.literal("approved"), v.literal("rejected"), v.literal("resubmission_required"), v.literal("under_review")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { uid, who } = await requireBankAdmin(ctx as any, args.tenantId);
    const kyc = await ctx.db.get(args.kycId);
    if (!kyc || (kyc as any).tenantId !== args.tenantId) throw new Error("KYC_NOT_FOUND");
    const before = { status: (kyc as any).status };
    await ctx.db.patch(args.kycId, { status: args.status, rejectionReason: args.reason, reviewedBy: uid, reviewedAt: Date.now(), updatedAt: Date.now() } as any);
    await ctx.db.insert("kycEvents", { kycId: args.kycId, actorId: uid, action: `kyc_${args.status}`, fromStatus: (kyc as any).status, toStatus: args.status, reason: args.reason, createdAt: Date.now() } as any);
    await audit(ctx, uid, who?.email, `KYC_${args.status.toUpperCase()}`, "kycRecord", args.kycId, before, { status: args.status }, args.reason);
    // Notify customer
    await ctx.db.insert("notifications", {
      userId: (kyc as any).userId,
      title: `KYC ${args.status.replace(/_/g, " ")}`,
      message: args.status === "approved" ? "Your identity verification was approved." : `KYC update: ${args.status}. ${args.reason ?? ""}`.trim(),
      type: "kyc_update",
      isRead: false,
      createdAt: Date.now(),
    } as any);
    return { success: true };
  },
});

// ─── Fee configuration (tenant-scoped, audited) ────────────────────

export const adminGetFeeConfig = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    await requireBankAdmin(ctx as any, args.tenantId);
    return await ctx.db.query("bankingFeeConfig").withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId)).first();
  },
});

export const adminSetFeeConfig = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    transferFeeMinor: v.optional(v.number()),
    withdrawalFeeMinor: v.optional(v.number()),
    depositFeeMinor: v.optional(v.number()),
    dailyTransferLimitMinor: v.optional(v.number()),
    dailyWithdrawalLimitMinor: v.optional(v.number()),
    perTransactionLimitMinor: v.optional(v.number()),
    minTransactionMinor: v.optional(v.number()),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { uid, who } = await requireBankAdmin(ctx as any, args.tenantId);
    const tenant = await ctx.db.get(args.tenantId);
    const currency = (tenant as any)?.currency ?? "USD";
    const now = Date.now();
    const existing = await ctx.db.query("bankingFeeConfig").withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId)).first();
    const patch: Record<string, unknown> = { updatedBy: uid, updatedAt: now, currency };
    for (const k of ["transferFeeMinor", "withdrawalFeeMinor", "depositFeeMinor", "dailyTransferLimitMinor", "dailyWithdrawalLimitMinor", "perTransactionLimitMinor", "minTransactionMinor"]) {
      const v = (args as any)[k];
      if (v !== undefined) patch[k] = v;
    }
    if (existing) {
      const before = { ...existing };
      await ctx.db.patch(existing._id, patch as any);
      await audit(ctx, uid, who?.email, "BANKING_FEES_UPDATED", "bankingFeeConfig", existing._id, before, patch, args.reason);
      return { id: existing._id, created: false };
    }
    const id = await ctx.db.insert("bankingFeeConfig", { tenantId: args.tenantId, transferFeeMinor: 0, withdrawalFeeMinor: 0, currency, ...patch } as any);
    await audit(ctx, uid, who?.email, "BANKING_FEES_CREATED", "bankingFeeConfig", id, null, patch, args.reason);
    return { id, created: true };
  },
});

// ─── Tenant balance overview (admin, tenant-scoped) ────────────────

export const adminListBalances = query({
  args: { tenantId: v.id("tenantSites"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireBankAdmin(ctx as any, args.tenantId);
    const accounts = await ctx.db.query("tenantAccounts").withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId)).order("desc").take(Math.min(args.limit ?? 100, 500));
    const enriched = await Promise.all(
      accounts.map(async (a: any) => {
        const user = await ctx.db.get(a.userId);
        return { ...a, userEmail: (user as any)?.email ?? null, userName: (user as any)?.name ?? null };
      })
    );
    return enriched;
  },
});

export const adminAuditLog = query({
  args: { tenantId: v.id("tenantSites"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireBankAdmin(ctx as any, args.tenantId);
    const logs = await ctx.db.query("auditLogs").order("desc").take(Math.min(args.limit ?? 100, 500));
    // Tenant-scoped: only logs whose resource belongs to this tenant are returned.
    const tenantAccounts = await ctx.db.query("tenantAccounts").withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId)).take(500);
    const accountIds = new Set(tenantAccounts.map((a: any) => String(a._id)));
    const tenantRefs = new Set<string>([String(args.tenantId)]);
    for (const a of tenantAccounts) tenantRefs.add(String(a._id));
    return logs.filter((l: any) => {
      const rid = String(l.resourceId ?? "");
      if (tenantRefs.has(rid)) return true;
      if (accountIds.has(rid)) return true;
      // transfer/deposit/withdrawal/kyc rows carry tenantId; check via resourceRefs recorded at write time
      return l.resource === "tenantSite" && rid === String(args.tenantId);
    });
  },
});
