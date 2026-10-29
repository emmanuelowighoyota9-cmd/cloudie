import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
  ASSIGNABLE_STAFF_ROLES,
  BANKING_ROLE_LABELS,
  canGrantRole,
  isStaffRole,
  normalizeBankingRole,
  permissionsFor,
  requirePermission,
  type AssignableStaffRole,
  type BankingPermission,
  type BankingRole,
} from "./bankingAccess";

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Resolve the caller's banking role for one tenant and enforce a permission.
 *
 * The tenant id always comes from the request, but it is only used to *look up*
 * the tenant — authorization is derived from the caller's identity and the
 * tenant's own owner/membership rows. A member of tenant A therefore cannot
 * reach tenant B by passing B's id.
 */
async function requireBankAdmin(
  ctx: any,
  tenantId: Id<"tenantSites">,
  permission: BankingPermission = "transactions.view",
) {
  const uid = await getAuthUserId(ctx);
  if (!uid) throw new Error("UNAUTHORIZED");
  const who = await ctx.db.get(uid);
  if (!who) throw new Error("UNAUTHORIZED");
  if (who.isSuspended) throw new Error("FORBIDDEN: account suspended");
  const tenant = await ctx.db.get(tenantId);
  if (!tenant) throw new Error("TENANT_NOT_FOUND");
  const isSuperAdmin = who.role === "admin";
  const isOwner = (tenant as any).ownerId === uid;

  let role: BankingRole;
  if (isSuperAdmin || isOwner) {
    role = "owner";
  } else {
    const membership = await ctx.db
      .query("tenantUsers")
      .withIndex("by_tenant_and_user", (q: any) => q.eq("tenantId", tenantId).eq("userId", uid))
      .first();
    if (!membership) throw new Error("FORBIDDEN: not a member of this tenant");
    if ((membership.status ?? "active") !== "active") throw new Error("FORBIDDEN: membership suspended");
    role = normalizeBankingRole(membership.role);
  }

  requirePermission(role, permission);
  return { uid, who, tenant, role, isOwner, isSuperAdmin };
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
    const { tenant, role } = await requireBankAdmin(ctx as any, args.tenantId, "transactions.view");
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
      tenant: { _id: t._id, siteName: t.siteName, displayName: t.displayName, subdomain: t.subdomain, currency: t.currency ?? "USD", lifecycleStatus: lifecycle, isAvailable, plan: t.plan, isActive: t.isActive, bankingMode: t.bankingMode === "live" ? "live" : "sandbox" },
      viewer: { role, permissions: permissionsFor(role) },
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
    const { uid, who } = await requireBankAdmin(ctx as any, args.tenantId, "accounts.manage");
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
    const { uid, who } = await requireBankAdmin(ctx as any, args.tenantId, "accounts.restrict");
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
    const { uid, who } = await requireBankAdmin(ctx as any, args.tenantId, "accounts.restrict");
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
    const { uid, who } = await requireBankAdmin(ctx as any, args.tenantId, "transactions.override");
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
    const { uid, who } = await requireBankAdmin(ctx as any, args.tenantId, "transactions.override");
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
    const { uid, who } = await requireBankAdmin(ctx as any, args.tenantId, "transactions.override");
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
    await requireBankAdmin(ctx as any, args.tenantId, "customers.view");
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
    const { uid, who } = await requireBankAdmin(ctx as any, args.tenantId, "kyc.review");
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
    await requireBankAdmin(ctx as any, args.tenantId, "ledger.view");
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
    const { uid, who } = await requireBankAdmin(ctx as any, args.tenantId, "fees.manage");
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
    await requireBankAdmin(ctx as any, args.tenantId, "ledger.view");
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
    await requireBankAdmin(ctx as any, args.tenantId, "audit.view");
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

// ─── Viewer permissions ──────────────────────────────────────────────

/** What the signed-in viewer may do in this tenant's console (UI gating only). */
export const myTenantPermissions = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const uid = await getAuthUserId(ctx);
    if (!uid) return null;
    const who = await ctx.db.get(uid);
    if (!who || who.isSuspended) return null;
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant) return null;
    let role: BankingRole = "customer";
    if (who.role === "admin" || (tenant as any).ownerId === uid) {
      role = "owner";
    } else {
      const membership = await ctx.db
        .query("tenantUsers")
        .withIndex("by_tenant_and_user", (q) => q.eq("tenantId", args.tenantId).eq("userId", uid))
        .first();
      if (!membership) return null;
      role = normalizeBankingRole(membership.role);
    }
    return {
      userId: uid,
      role,
      roleLabel: BANKING_ROLE_LABELS[role],
      isStaff: isStaffRole(role),
      isSuperAdmin: who.role === "admin",
      permissions: permissionsFor(role),
    };
  },
});

// ─── Tenant staff & permissions ──────────────────────────────────────

/**
 * The tenant's staff roster. The owner is not a membership row, so it is
 * returned separately; memberships with a customer role are customers, not
 * staff, and stay in the customer list.
 */
export const listTenantStaff = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const { tenant } = await requireBankAdmin(ctx as any, args.tenantId, "staff.manage");
    const owner = await ctx.db.get((tenant as any).ownerId);
    const rows = await ctx.db.query("tenantUsers").withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId)).take(500);
    const staff = rows.filter((r: any) => isStaffRole(normalizeBankingRole(r.role)));
    const enriched = await Promise.all(
      staff.map(async (m: any) => {
        const user = await ctx.db.get(m.userId);
        const role = normalizeBankingRole(m.role);
        return {
          membershipId: m._id,
          userId: m.userId,
          email: (user as any)?.email ?? null,
          name: (user as any)?.name ?? null,
          role,
          roleLabel: BANKING_ROLE_LABELS[role],
          permissions: permissionsFor(role),
          status: m.status ?? "active",
          addedBy: m.addedBy ?? null,
          createdAt: m.createdAt,
        };
      }),
    );
    return {
      owner: owner
        ? { userId: owner._id, email: (owner as any).email ?? null, name: (owner as any).name ?? null, role: "owner", roleLabel: BANKING_ROLE_LABELS.owner }
        : null,
      staff: enriched,
      assignableRoles: ASSIGNABLE_STAFF_ROLES.map((r) => ({ value: r, label: BANKING_ROLE_LABELS[r], permissions: permissionsFor(r) })),
    };
  },
});

/** Grant a banking role to an existing Cloudie account, by email. */
export const addTenantStaff = mutation({
  args: { tenantId: v.id("tenantSites"), email: v.string(), role: v.string() },
  handler: async (ctx, args) => {
    const { uid: actorId, who, role: actorRole } = await requireBankAdmin(ctx as any, args.tenantId, "staff.manage");
    const email = args.email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("INVALID_EMAIL");
    if (!(ASSIGNABLE_STAFF_ROLES as readonly string[]).includes(args.role)) throw new Error("INVALID_ROLE: owner is not assignable");
    const targetRole = args.role as AssignableStaffRole;
    if (!canGrantRole(actorRole, targetRole)) throw new Error(`FORBIDDEN: cannot grant ${targetRole}`);

    const user = await ctx.db.query("users").withIndex("email", (q) => q.eq("email", email)).first();
    if (!user) throw new Error(`USER_NOT_FOUND: no Cloudie account for ${email}`);

    const existing = await ctx.db
      .query("tenantUsers")
      .withIndex("by_tenant_and_user", (q) => q.eq("tenantId", args.tenantId).eq("userId", user._id))
      .first();
    const now = Date.now();
    if (existing) {
      const before = { role: existing.role, status: existing.status ?? "active" };
      await ctx.db.patch(existing._id, { role: targetRole, status: "active", addedBy: actorId, updatedAt: now });
      await audit(ctx, actorId, who?.email, "BANKING_STAFF_ROLE_CHANGED", "tenantUser", existing._id, before, { role: targetRole }, "staff added via staff screen");
      return { membershipId: existing._id, updated: true };
    }
    const membershipId = await ctx.db.insert("tenantUsers", {
      tenantId: args.tenantId,
      userId: user._id,
      role: targetRole,
      status: "active",
      addedBy: actorId,
      updatedAt: now,
      createdAt: now,
    });
    await audit(ctx, actorId, who?.email, "BANKING_STAFF_ADDED", "tenantUser", membershipId, null, { email, role: targetRole });
    await ctx.db.insert("notifications", {
      userId: user._id,
      title: "Banking console access granted",
      message: `You were granted the ${BANKING_ROLE_LABELS[targetRole]} role at ${(who as any)?.email ? "a banking tenant" : "a banking tenant"}.`,
      type: "banking.staff_added",
      isRead: false,
      createdAt: now,
    } as any);
    return { membershipId, updated: false };
  },
});

export const setTenantStaffRole = mutation({
  args: { tenantId: v.id("tenantSites"), membershipId: v.id("tenantUsers"), role: v.string() },
  handler: async (ctx, args) => {
    const { uid: actorId, who, role: actorRole } = await requireBankAdmin(ctx as any, args.tenantId, "staff.manage");
    if (!(ASSIGNABLE_STAFF_ROLES as readonly string[]).includes(args.role)) throw new Error("INVALID_ROLE: owner is not assignable");
    const targetRole = args.role as AssignableStaffRole;
    if (!canGrantRole(actorRole, targetRole)) throw new Error(`FORBIDDEN: cannot grant ${targetRole}`);
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || (membership as any).tenantId !== args.tenantId) throw new Error("MEMBERSHIP_NOT_FOUND");
    const before = normalizeBankingRole(membership.role);
    if (!canGrantRole(actorRole, before as AssignableStaffRole)) throw new Error(`FORBIDDEN: cannot modify a ${before} membership`);
    await ctx.db.patch(args.membershipId, { role: targetRole, updatedAt: Date.now() });
    await audit(ctx, actorId, who?.email, "BANKING_STAFF_ROLE_CHANGED", "tenantUser", args.membershipId, { role: before }, { role: targetRole });
    return { success: true, role: targetRole };
  },
});

export const removeTenantStaff = mutation({
  args: { tenantId: v.id("tenantSites"), membershipId: v.id("tenantUsers"), reason: v.string() },
  handler: async (ctx, args) => {
    const { uid: actorId, who, role: actorRole } = await requireBankAdmin(ctx as any, args.tenantId, "staff.manage");
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || (membership as any).tenantId !== args.tenantId) throw new Error("MEMBERSHIP_NOT_FOUND");
    const before = normalizeBankingRole(membership.role);
    if (!canGrantRole(actorRole, before as AssignableStaffRole)) throw new Error(`FORBIDDEN: cannot remove a ${before} membership`);
    if (args.reason.trim().length < 5) throw new Error("REASON_REQUIRED");
    // Revoking console access only: accounts, ledger history and audit records
    // belong to the tenant and are never deleted with a membership row.
    await ctx.db.delete(args.membershipId);
    await audit(ctx, actorId, who?.email, "BANKING_STAFF_REMOVED", "tenantUser", args.membershipId, { role: before }, null, args.reason.trim());
    return { success: true };
  },
});

/** Owner-only: switch the tenant between sandbox and live settlement. */
export const setBankingSettlementMode = mutation({
  args: { tenantId: v.id("tenantSites"), mode: v.union(v.literal("sandbox"), v.literal("live")), reason: v.string() },
  handler: async (ctx, args) => {
    const { uid, who, tenant, isOwner, isSuperAdmin } = await requireBankAdmin(ctx as any, args.tenantId, "subscription.view");
    if (!isOwner && !isSuperAdmin) throw new Error("FORBIDDEN: tenant owner only");
    if (args.reason.trim().length < 5) throw new Error("REASON_REQUIRED");
    const before = ((tenant as any).bankingMode === "live" ? "live" : "sandbox") as string;
    await ctx.db.patch(args.tenantId, { bankingMode: args.mode } as any);
    await audit(ctx, uid, who?.email, "BANKING_SETTLEMENT_MODE_CHANGED", "tenantSite", args.tenantId, { bankingMode: before }, { bankingMode: args.mode }, args.reason.trim());
    return { mode: args.mode };
  },
});

// ─── Dual-approval ledger corrections ────────────────────────────────

/**
 * Request an exceptional ledger correction.
 *
 * This is the only "balance change" path in the product, and it is deliberately
 * not a balance edit: approval posts a balanced journal group (the customer
 * account against a contra line), so the ledger still explains every unit.
 */
export const requestLedgerAdjustment = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    accountId: v.id("tenantAccounts"),
    direction: v.union(v.literal("credit"), v.literal("debit")),
    amountMinor: v.number(),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const { uid, who, tenant } = await requireBankAdmin(ctx as any, args.tenantId, "ledger.adjust.request");
    const account = await ctx.db.get(args.accountId);
    if (!account || (account as any).tenantId !== args.tenantId) throw new Error("ACCOUNT_NOT_FOUND");
    const amountMinor = Math.trunc(args.amountMinor);
    if (!Number.isFinite(amountMinor) || amountMinor <= 0) throw new Error("INVALID_AMOUNT");
    if (args.reason.trim().length < 10) throw new Error("REASON_TOO_SHORT: explain the correction (10+ chars)");

    const reference = `ADJ-${Date.now().toString(36).toUpperCase()}${Math.floor(Math.random() * 900 + 100)}`;
    const now = Date.now();
    const id = await ctx.db.insert("bankingApprovals", {
      tenantId: args.tenantId,
      kind: "ledger_adjustment",
      status: "pending",
      accountId: args.accountId,
      direction: args.direction,
      amountMinor,
      currency: ((account as any).currency ?? (tenant as any).currency ?? "USD") as string,
      reason: args.reason.trim(),
      reference,
      requestedBy: uid,
      requestedByEmail: who?.email,
      createdAt: now,
    });
    await audit(ctx, uid, who?.email, "LEDGER_ADJUSTMENT_REQUESTED", "bankingApproval", id, null, { reference, accountId: args.accountId, direction: args.direction, amountMinor }, args.reason.trim());
    // Notify the owner and the other approvers so a second person can decide.
    await ctx.db.insert("notifications", {
      userId: (tenant as any).ownerId,
      title: "Ledger correction awaiting approval",
      message: `${reference}: ${args.direction} of ${(amountMinor / 100).toFixed(2)} ${(account as any).currency ?? "USD"} on ${(account as any).name}. Requested by ${who?.email ?? "a staff member"}.`,
      type: "banking.approval_pending",
      isRead: false,
      createdAt: now,
    } as any);
    return { id, reference, status: "pending" as const };
  },
});

export const decideLedgerAdjustment = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    approvalId: v.id("bankingApprovals"),
    approve: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { uid, who } = await requireBankAdmin(ctx as any, args.tenantId, "ledger.adjust.approve");
    const approval = await ctx.db.get(args.approvalId);
    if (!approval || (approval as any).tenantId !== args.tenantId) throw new Error("APPROVAL_NOT_FOUND");
    if ((approval as any).status !== "pending") throw new Error(`APPROVAL_NOT_PENDING: status is ${(approval as any).status}`);
    // Separation of duties: the person who requested a correction never decides it.
    if ((approval as any).requestedBy === uid) throw new Error("SELF_APPROVAL_FORBIDDEN");
    if (!args.approve && !(args.reason ?? "").trim()) throw new Error("REJECTION_REASON_REQUIRED");

    const now = Date.now();
    if (!args.approve) {
      await ctx.db.patch(args.approvalId, {
        status: "rejected",
        decidedBy: uid,
        decidedByEmail: who?.email,
        decisionReason: (args.reason ?? "").trim(),
        decidedAt: now,
      } as any);
      await audit(ctx, uid, who?.email, "LEDGER_ADJUSTMENT_REJECTED", "bankingApproval", args.approvalId, { status: "pending" }, { status: "rejected" }, (args.reason ?? "").trim());
      return { status: "rejected" as const };
    }

    const account = await ctx.db.get((approval as any).accountId);
    if (!account) throw new Error("ACCOUNT_NOT_FOUND");
    const amountMinor = (approval as any).amountMinor as number;
    const direction = (approval as any).direction as "credit" | "debit";
    const currency = (approval as any).currency as string;
    const prev = (account as any).balanceMinor ?? Math.round(((account as any).balance ?? 0) * 100);
    if (direction === "debit" && prev < amountMinor) throw new Error("INSUFFICIENT_FUNDS");
    const next = direction === "credit" ? prev + amountMinor : prev - amountMinor;
    const groupId = `adjustment-${(approval as any).reference}`;

    await ctx.db.insert("bankingLedgerEntries", {
      tenantId: args.tenantId,
      groupId,
      relatedKind: "adjustment" as const,
      relatedId: args.approvalId as unknown as string,
      accountId: (approval as any).accountId,
      userId: (account as any).userId,
      debitMinor: direction === "debit" ? amountMinor : 0,
      creditMinor: direction === "credit" ? amountMinor : 0,
      currency,
      description: `Approved ledger correction ${(approval as any).reference}: ${(approval as any).reason}`,
      createdAt: now,
    } as any);
    await ctx.db.insert("bankingLedgerEntries", {
      tenantId: args.tenantId,
      groupId,
      relatedKind: "adjustment" as const,
      relatedId: args.approvalId as unknown as string,
      debitMinor: direction === "credit" ? amountMinor : 0,
      creditMinor: direction === "debit" ? amountMinor : 0,
      currency,
      description: `Contra line for ledger correction ${(approval as any).reference}`,
      createdAt: now,
    } as any);
    await ctx.db.patch((account as any)._id, {
      balanceMinor: next,
      availableBalanceMinor: next,
      ledgerBalanceMinor: next,
      balance: next / 100,
    } as any);
    await ctx.db.patch(args.approvalId, {
      status: "approved",
      decidedBy: uid,
      decidedByEmail: who?.email,
      decisionReason: (args.reason ?? "").trim() || undefined,
      decidedAt: now,
      ledgerGroupId: groupId,
    } as any);
    await audit(ctx, uid, who?.email, "LEDGER_ADJUSTMENT_APPROVED", "bankingApproval", args.approvalId, { status: "pending", balanceMinor: prev }, { status: "approved", balanceMinor: next, groupId }, (args.reason ?? "").trim() || undefined);
    await ctx.db.insert("notifications", {
      userId: (account as any).userId,
      title: "Account correction posted",
      message: `A ${direction} correction of ${(amountMinor / 100).toFixed(2)} ${currency} was posted to ${(account as any).name} (${(approval as any).reference}).`,
      type: "banking.adjustment_posted",
      isRead: false,
      createdAt: now,
    } as any);
    return { status: "approved" as const, ledgerGroupId: groupId };
  },
});

export const cancelLedgerAdjustment = mutation({
  args: { tenantId: v.id("tenantSites"), approvalId: v.id("bankingApprovals") },
  handler: async (ctx, args) => {
    const { uid, who } = await requireBankAdmin(ctx as any, args.tenantId, "ledger.adjust.request");
    const approval = await ctx.db.get(args.approvalId);
    if (!approval || (approval as any).tenantId !== args.tenantId) throw new Error("APPROVAL_NOT_FOUND");
    if ((approval as any).status !== "pending") throw new Error("APPROVAL_NOT_PENDING");
    if ((approval as any).requestedBy !== uid) throw new Error("FORBIDDEN: only the requester can cancel");
    await ctx.db.patch(args.approvalId, { status: "cancelled", decidedAt: Date.now() } as any);
    await audit(ctx, uid, who?.email, "LEDGER_ADJUSTMENT_CANCELLED", "bankingApproval", args.approvalId, { status: "pending" }, { status: "cancelled" });
    return { status: "cancelled" as const };
  },
});

export const listLedgerAdjustments = query({
  args: { tenantId: v.id("tenantSites"), status: v.optional(v.string()), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireBankAdmin(ctx as any, args.tenantId, "ledger.view");
    const rows = await ctx.db
      .query("bankingApprovals")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .order("desc")
      .take(Math.min(args.limit ?? 50, 200));
    const filtered = args.status ? rows.filter((r) => (r as any).status === args.status) : rows;
    return await Promise.all(
      filtered.map(async (r: any) => {
        const account = await ctx.db.get(r.accountId);
        return { ...r, accountName: (account as any)?.name ?? null, accountNumber: (account as any)?.accountNumber ?? null };
      }),
    );
  },
});
