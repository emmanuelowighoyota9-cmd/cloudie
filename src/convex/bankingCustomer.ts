import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, internalMutation } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

// ─── Internal guards ─────────────────────────────────────────────────

async function requireAuth(ctx: MutationCtx | QueryCtx): Promise<{ userId: Id<"users"> }> {
  const uid = await getAuthUserId(ctx as any);
  if (!uid) throw new Error("UNAUTHORIZED");
  return { userId: uid as Id<"users"> };
}

async function getTenant(tenantId: Id<"tenantSites">, ctx: any) {
  const t = await ctx.db.get(tenantId);
  if (!t || t.siteType !== "bank") throw new Error("TENANT_NOT_FOUND");
  return t;
}

async function assertTenantActive(tenant: any) {
  const status = (tenant.lifecycleStatus ?? (tenant.isActive ? "active" : "disabled")) as string;
  if (["disabled", "suspended", "archived", "draft"].includes(status) || !tenant.isActive)
    throw new Error(`TENANT_UNAVAILABLE: tenant is ${status}`);
}

/** Indexed membership check — the owner always counts as a member. */
async function isMemberOf(ctx: MutationCtx | QueryCtx, tenant: any, userId: Id<"users">) {
  if (tenant.ownerId === userId) return true;
  const row = await ctx.db
    .query("tenantUsers")
    .withIndex("by_tenant_and_user", (q: any) => q.eq("tenantId", tenant._id).eq("userId", userId))
    .first();
  return !!row;
}

async function requireTenantUser(ctx: MutationCtx | QueryCtx, tenantId: Id<"tenantSites">) {
  const { userId } = await requireAuth(ctx as any);
  const tenant = await getTenant(tenantId, ctx);
  const isOwner = tenant.ownerId === userId;
  const isMember = await isMemberOf(ctx, tenant, userId);
  if (!isMember) throw new Error("FORBIDDEN: not a member of this tenant");
  return { userId, tenant, isOwner, isMember };
}

/**
 * Soft membership probe for read queries rendered by the public tenant portal.
 * Returns null (instead of throwing) when the visitor is signed out or not a member,
 * so the portal can render its sign-in / self-signup screen instead of an error boundary.
 * Isolation is unchanged: non-members still receive no tenant data.
 */
async function softMember(ctx: MutationCtx | QueryCtx, tenantId: Id<"tenantSites">) {
  const uid = await getAuthUserId(ctx as any);
  if (!uid) return null;
  const tenant = await ctx.db.get(tenantId);
  if (!tenant || tenant.siteType !== "bank") return null;
  const userId = uid as Id<"users">;
  const isOwner = (tenant as any).ownerId === userId;
  const isMember = await isMemberOf(ctx, tenant, userId);
  if (!isMember) return null;
  return { userId, tenant, isOwner, isMember };
}

async function requireOwner(ctx: MutationCtx, tenantId: Id<"tenantSites">) {
  const { userId } = await requireAuth(ctx);
  const tenant = await getTenant(tenantId, ctx);
  if (tenant.ownerId !== userId) {
    throw new Error("FORBIDDEN: tenant owner only");
  }
  return { userId, tenant };
}

function toMinorSafe(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n)) throw new Error("INVALID_AMOUNT");
  // callers already in minor units, just range check
  return Math.trunc(n);
}

function toReference(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase() + Math.floor(Date.now() % 1000).toString().padStart(3, "0");
  return `${prefix}${rand}${Math.floor(Math.random() * 99).toString().padStart(2, "0")}`;
}

async function audit(ctx: MutationCtx, actorId: Id<"users">, action: string, resource: string, resourceId: string, before: unknown, after: unknown, reason?: string) {
  const actor = await ctx.db.get(actorId);
  await ctx.db.insert("auditLogs", { actorId, actorEmail: actor?.email, action, resource, resourceId, before: before as any, after: after as any, reason, createdAt: Date.now() });
}

function verifyDebitsEqCredits(entries: Array<{ debitMinor: number; creditMinor: number }>) {
  const deb = entries.reduce((s, e) => s + e.debitMinor, 0);
  const cre = entries.reduce((s, e) => s + e.creditMinor, 0);
  if (deb !== cre) throw new Error(`invariant violated: debits ${deb} !== credits ${cre}`);
}

async function checkIdem(ctx: MutationCtx, key: string, kind: string, tenantId: Id<"tenantSites">) {
  if (!key) return null;
  const existing = await ctx.db.query("bankingIdempotency").withIndex("by_key", q => q.eq("key", key)).first();
  if (!existing) return null;
  // Idempotency keys are tenant + operation scoped. A key that belongs to another
  // tenant or another operation must never replay someone else's result.
  if (existing.tenantId !== tenantId || existing.kind !== kind) throw new Error("IDEMPOTENCY_KEY_CONFLICT");
  return existing;
}
async function recordIdem(ctx: MutationCtx, key: string, kind: string, tenantId: Id<"tenantSites">, actorId: Id<"users"> | undefined, resultType: string, resultId: string) {
  if (!key) return;
  await ctx.db.insert("bankingIdempotency", { key, kind, tenantId, actorId, resultType, resultId, createdAt: Date.now() });
}

function fmtMoney(minor: number, currency = "USD") {
  const major = (minor / 100).toFixed(2);
  const sym = currency === "USD" ? "$" : currency === "GBP" ? "£" : currency === "EUR" ? "€" : `${currency} `;
  return `${sym}${major}`;
}

// ─── Banking read layer ──────────────────────────────────────────────

export const memberTenant = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const m = await softMember(ctx as QueryCtx, args.tenantId);
    if (!m) return null;
    const t = m.tenant as any;
    return { tenant: { _id: t._id, siteName: t.siteName, displayName: t.displayName, subdomain: t.subdomain, currency: t.currency ?? "USD", lifecycleStatus: t.lifecycleStatus, isActive: t.isActive, branding: t.branding }, isOwner: m.isOwner };
  },
});

export const memberAccounts = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const m = await softMember(ctx as QueryCtx, args.tenantId);
    if (!m) return [];
    const { userId } = m;
    const t = m.tenant as any;
    const rows = await ctx.db.query("tenantAccounts").withIndex("by_tenant_and_user", q => q.eq("tenantId", args.tenantId).eq("userId", userId)).collect();
    // only rows belonging to caller (plus visibility) — no cross-tenant leakage
    return rows.map(r => ({ _id: r._id, name: r.name, accountType: r.accountType, accountNumber: r.accountNumber, currency: (r as any).currency ?? (t as any).currency ?? "USD", isActive: r.isActive, status: (r as any).status ?? (r.isActive ? "active" : "closed"), balanceMinor: (r as any).balanceMinor ?? Math.round((r.balance ?? 0) * 100), createdAt: r.createdAt }));
  },
});

export const accountTransactions = query({
  args: { tenantId: v.id("tenantSites"), accountId: v.id("tenantAccounts"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { userId, isOwner } = await requireTenantUser(ctx as QueryCtx, args.tenantId);
    const acct = await ctx.db.get(args.accountId);
    if (!acct || acct.tenantId !== args.tenantId) throw new Error("ACCOUNT_NOT_FOUND");
    if (acct.userId !== userId && !isOwner) throw new Error("FORBIDDEN: account not owned by caller");
    const take = Math.min(Math.max(args.limit ?? 50, 1), 200);
    const posts = await ctx.db.query("bankingLedgerEntries").withIndex("by_account", q => q.eq("accountId", args.accountId)).order("desc").take(take);
    return posts;
  },
});

export const onboardingMe = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const m = await softMember(ctx as QueryCtx, args.tenantId);
    if (!m) return { kyc: [] as any[] };
    const log = await ctx.db.query("kycRecords").withIndex("by_user", q => q.eq("userId", m.userId)).order("desc").take(20);
    return { kyc: log.filter((r: any) => r.tenantId === args.tenantId) };
  },
});

export const publicTenant = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const t = await ctx.db.get(args.tenantId);
    if (!t || t.siteType !== "bank") return null;
    const status = (t as any).lifecycleStatus ?? (t.isActive ? "active" : "disabled");
    const isAvailable = t.isActive && status === "active";
    return { _id: t._id, siteName: t.siteName, displayName: (t as any).displayName, subdomain: t.subdomain, currency: (t as any).currency ?? "USD", status, isAvailable, branding: (t as any).branding };
  },
});

/** Self-signup: join a banking tenant as a customer (creates tenantUsers row). */
export const joinTenant = mutation({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const { userId } = await requireAuth(ctx as MutationCtx);
    const tenant = await getTenant(args.tenantId, ctx);
    const status = (tenant.lifecycleStatus ?? (tenant.isActive ? "active" : "disabled")) as string;
    const isAvailable = tenant.isActive && status === "active";
    if (!isAvailable) throw new Error(`TENANT_UNAVAILABLE: tenant is ${status}`);
    if (tenant.ownerId === userId) return { alreadyMember: true, isOwner: true };
    const existing = await ctx.db.query("tenantUsers").withIndex("by_tenant", (q: any) => q.eq("tenantId", args.tenantId)).collect();
    if (existing.some((r: any) => r.userId === userId)) return { alreadyMember: true };
    const now = Date.now();
    const id = await ctx.db.insert("tenantUsers", { tenantId: args.tenantId, userId, role: "customer", createdAt: now });
    await audit(ctx as MutationCtx, userId, "TENANT_JOINED_SELF", "tenantSite", args.tenantId, null, { role: "customer" });
    await ctx.db.insert("notifications", { userId, title: `Joined ${tenant.siteName}`, message: `You are now a customer of ${tenant.siteName} (${tenant.subdomain}.g0ki.com).`, type: "banking.joined", isRead: false, link: `/site/${args.tenantId}/banking`, createdAt: now } as any);
    return { id, joined: true };
  },
});

// ─── Account creation (customer self-service, plus admin create) ─────

export const openAccount = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    name: v.string(),
    accountType: v.union(v.literal("checking"), v.literal("savings"), v.literal("credit")),
    currency: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireTenantUser(ctx as MutationCtx, args.tenantId);
    const tenant = await getTenant(args.tenantId, ctx);
    await assertTenantActive(tenant);

    const key = args.idempotencyKey?.trim();
    if (key) {
      const idem = await checkIdem(ctx as MutationCtx, key, "openAccount", args.tenantId);
      if (idem?.resultId) {
        const existing = await ctx.db.get(idem.resultId as any);
        if (existing) return { id: existing._id, reused: true };
      }
    }

    // Convex requires uniqueness defense: generate via crypto-ish + re-check.
    let accountNumber: string;
    for (let i = 0; i < 10; i++) {
      const cand = String(1000000000 + Math.floor(Math.random() * 9_000_000_000));
      const dupe = await ctx.db.query("tenantAccounts").withIndex("by_account_number", q => q.eq("accountNumber", cand)).first();
      if (!dupe) { accountNumber = cand; break; }
    }
    // @ts-ignore assigned-in-loop
    if (!accountNumber!) throw new Error("ACCOUNT_NUMBER_COLLISION");
    const currency = (args.currency ?? (tenant as any).currency ?? "USD").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("INVALID_CURRENCY");
    const routing = String(100000000 + Math.floor(Math.random() * 900000000));

    const now = Date.now();
    const id = await ctx.db.insert("tenantAccounts", {
      tenantId: args.tenantId,
      userId,
      accountType: args.accountType,
      name: args.name.trim(),
      balance: 0,
      accountNumber: accountNumber!,
      routingNumber: routing,
      currency,
      isActive: true,
      status: "active",
      balanceMinor: 0,
      availableBalanceMinor: 0,
      ledgerBalanceMinor: 0,
      createdAt: now,
    } as any);

    await audit(ctx as MutationCtx, userId, "ACCOUNT_OPENED", "tenantAccount", id, null, { name: args.name, accountNumber, currency }, undefined);
    await ctx.db.insert("notifications", { userId, title: "Account opened", message: `${args.name} (${accountNumber}) is now active.`, type: "banking.account_opened", isRead: false, link: `/site/${args.tenantId}/banking`, createdAt: now, metadata: { tenantId: args.tenantId, accountId: id } as any });
    if (key) await recordIdem(ctx as MutationCtx, key, "openAccount", args.tenantId, userId, "tenantAccount", id);
    return { id, accountNumber: accountNumber!, currency };
  },
});

// Admin-create an account for a specific customer (owner only)
export const adminOpenAccount = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    userId: v.id("users"),
    name: v.string(),
    accountType: v.union(v.literal("checking"), v.literal("savings"), v.literal("credit")),
    currency: v.optional(v.string()),
    openingDepositMinor: v.optional(v.number()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId: ownerId } = await requireOwner(ctx as MutationCtx, args.tenantId);
    const tenant = await getTenant(args.tenantId, ctx);
    await assertTenantActive(tenant);
    // ensure user is a member of the tenant
    let isMember = tenant.ownerId === args.userId;
    if (!isMember) {
      const rows = await ctx.db.query("tenantUsers").withIndex("by_tenant", q => q.eq("tenantId", args.tenantId)).collect();
      isMember = rows.some(r => r.userId === args.userId);
      if (!isMember) throw new Error("FORBIDDEN: target user is not a member of this tenant");
    }

    const key = args.idempotencyKey?.trim();
    if (key) {
      const idem = await checkIdem(ctx as MutationCtx, key, "adminOpenAccount", args.tenantId);
      if (idem?.resultId) { const existing = await ctx.db.get(idem.resultId as any); if (existing) return { id: existing._id, reused: true }; }
    }

    let accountNumber: string;
    for (let i = 0; i < 10; i++) {
      const cand = String(1000000000 + Math.floor(Math.random() * 9_000_000_000));
      const dupe = await ctx.db.query("tenantAccounts").withIndex("by_account_number", q => q.eq("accountNumber", cand)).first();
      if (!dupe) { accountNumber = cand; break; }
    }
    // @ts-ignore
    if (!accountNumber!) throw new Error("ACCOUNT_NUMBER_COLLISION");
    const currency = (args.currency ?? (tenant as any).currency ?? "USD").toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error("INVALID_CURRENCY");
    const routing = String(100000000 + Math.floor(Math.random() * 900000000));
    const now = Date.now();
    const id = await ctx.db.insert("tenantAccounts", {
      tenantId: args.tenantId,
      userId: args.userId,
      accountType: args.accountType,
      name: args.name.trim(),
      balance: args.openingDepositMinor ? args.openingDepositMinor / 100 : 0,
      accountNumber: accountNumber!,
      routingNumber: routing,
      currency,
      isActive: true,
      status: "active",
      balanceMinor: args.openingDepositMinor ?? 0,
      availableBalanceMinor: args.openingDepositMinor ?? 0,
      ledgerBalanceMinor: args.openingDepositMinor ?? 0,
      createdAt: now,
    } as any);

    await audit(ctx as MutationCtx, ownerId, "ACCOUNT_OPENED_BY_ADMIN", "tenantAccount", id, null, { userId: args.userId, name: args.name, accountNumber });
    await ctx.db.insert("notifications", { userId: args.userId, title: "Bank account created", message: `${args.name} (${accountNumber}) was opened for you at ${tenant.siteName}.`, type: "banking.account_opened", isRead: false, link: `/site/${args.tenantId}/banking`, createdAt: now } as any);
    if (args.openingDepositMinor && args.openingDepositMinor > 0) {
      const groupId = `adjust-${id}-${now}`;
      const d = args.openingDepositMinor;
      // Balanced double-entry: customer account credited, funds-source contra debited.
      const openingEntries = [
        { debitMinor: 0, creditMinor: d },
        { debitMinor: d, creditMinor: 0 },
      ];
      verifyDebitsEqCredits(openingEntries);
      await ctx.db.insert("bankingLedgerEntries", { tenantId: args.tenantId, groupId, relatedKind: "adjustment", relatedId: id, accountId: id, userId: args.userId, debitMinor: 0, creditMinor: d, currency, description: `Opening deposit ${fmtMoney(d, currency)}`, createdAt: now } as any);
      await ctx.db.insert("bankingLedgerEntries", { tenantId: args.tenantId, groupId, relatedKind: "adjustment", relatedId: id, userId: args.userId, debitMinor: d, creditMinor: 0, currency, description: `Opening deposit (contra)`, createdAt: now } as any);
    }
    if (key) await recordIdem(ctx as MutationCtx, key, "adminOpenAccount", args.tenantId, ownerId, "tenantAccount", id);
    return { id, accountNumber: accountNumber!, currency };
  },
});

export const setAccountStatus = mutation({
  args: { tenantId: v.id("tenantSites"), accountId: v.id("tenantAccounts"), status: v.union(v.literal("active"), v.literal("frozen"), v.literal("suspended"), v.literal("closed")), reason: v.string() },
  handler: async (ctx, args) => {
    const { userId } = await requireOwner(ctx as MutationCtx, args.tenantId);
    const acct = await ctx.db.get(args.accountId);
    if (!acct || acct.tenantId !== args.tenantId) throw new Error("ACCOUNT_NOT_FOUND");
    const before = { status: (acct as any).status ?? (acct.isActive ? "active" : "closed"), isActive: acct.isActive };
    const isActive = !["suspended", "closed"].includes(args.status);
    await ctx.db.patch(args.accountId, { status: args.status, isActive, } as any);
    await audit(ctx as MutationCtx, userId, `ACCOUNT_${args.status.toUpperCase()}`, "tenantAccount", args.accountId, before, { status: args.status, isActive }, args.reason);
    return { success: true };
  },
});

// ─── Beneficiaries ──────────────────────────────────────────────────

export const listBeneficiaries = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const m = await softMember(ctx as QueryCtx, args.tenantId);
    if (!m) return [];
    return await ctx.db.query("bankingBeneficiaries").withIndex("by_tenant_owner", q => q.eq("tenantId", args.tenantId).eq("ownerUserId", m.userId)).collect();
  },
});

export const addBeneficiary = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    nickname: v.string(),
    accountNumber: v.string(),
    accountHolderName: v.optional(v.string()),
    accountType: v.optional(v.string()),
    isExternal: v.boolean(),
    bankName: v.optional(v.string()),
    routingNumber: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireTenantUser(ctx as MutationCtx, args.tenantId);
    const tenant = await getTenant(args.tenantId, ctx);
    await assertTenantActive(tenant);
    const nick = args.nickname.trim();
    if (nick.length < 1) throw new Error("INVALID_NICKNAME");
    const acctNum = args.accountNumber.trim();
    // Prevent duplicate beneficiares within caller scope
    const dup = await ctx.db.query("bankingBeneficiaries")
      .withIndex("by_tenant_owner", q => q.eq("tenantId", args.tenantId).eq("ownerUserId", userId))
      .collect();
    if (dup.some(d => d.accountNumber === acctNum)) throw new Error("DUPLICATE_BENEFICIARY");
    const id = await ctx.db.insert("bankingBeneficiaries", {
      tenantId: args.tenantId,
      ownerUserId: userId,
      nickname: nick,
      accountNumber: acctNum,
      accountHolderName: args.accountHolderName?.trim(),
      accountType: args.accountType,
      isExternal: !!args.isExternal,
      bankName: args.bankName?.trim(),
      routingNumber: args.routingNumber?.trim(),
      createdAt: Date.now(),
    });
    await audit(ctx as MutationCtx, userId, "BENEFICIARY_ADDED", "bankingBeneficiary", id, null, { nickname: nick, isExternal: args.isExternal });
    return { id };
  },
});

export const removeBeneficiary = mutation({
  args: { tenantId: v.id("tenantSites"), beneficiaryId: v.id("bankingBeneficiaries") },
  handler: async (ctx, args) => {
    const { userId } = await requireTenantUser(ctx as MutationCtx, args.tenantId);
    const row = await ctx.db.get(args.beneficiaryId);
    if (!row || row.tenantId !== args.tenantId || row.ownerUserId !== userId) throw new Error("BENEFICIARY_NOT_FOUND");
    await ctx.db.delete(args.beneficiaryId);
    await audit(ctx as MutationCtx, userId, "BENEFICIARY_REMOVED", "bankingBeneficiary", args.beneficiaryId, row, null, undefined);
    return { success: true };
  },
});

// ─── Deposits ───────────────────────────────────────────────────────

export const createDeposit = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    accountId: v.optional(v.id("tenantAccounts")),
    amountMinor: v.number(),
    currency: v.optional(v.string()),
    method: v.string(),
    description: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireTenantUser(ctx as MutationCtx, args.tenantId);
    const tenant = await getTenant(args.tenantId, ctx);
    await assertTenantActive(tenant);
    const amountMinor = toMinorSafe(args.amountMinor);
    if (amountMinor <= 0) throw new Error("INVALID_AMOUNT");
    // Validate the funding target up-front: the account must exist, belong to this
    // tenant, and be owned by the caller. Never trust a client-supplied account id.
    let target: any = null;
    if (args.accountId) {
      target = await ctx.db.get(args.accountId);
      if (!target || (target as any).tenantId !== args.tenantId) throw new Error("ACCOUNT_NOT_FOUND");
      if ((target as any).userId !== userId) throw new Error("FORBIDDEN: account not owned by caller");
      const st = ((target as any).status ?? (target.isActive ? "active" : "closed")) as string;
      if (!target.isActive || ["frozen", "suspended", "closed"].includes(st)) throw new Error("ACCOUNT_INACTIVE");
    }
    const currency = (args.currency ?? target?.currency ?? (tenant as any).currency ?? "USD").toUpperCase();
    const key = args.idempotencyKey?.trim();
    if (key) {
      const row = await ctx.db.query("bankingDeposits").withIndex("by_idempotency", q => q.eq("idempotencyKey", key)).first();
      if (row) {
        if ((row as any).tenantId !== args.tenantId || row.userId !== userId) throw new Error("IDEMPOTENCY_KEY_CONFLICT");
        return { id: row._id, reference: row.reference, reused: true };
      }
    }
    const reference = toReference("DEP-");
    const now = Date.now();
    const id = await ctx.db.insert("bankingDeposits", {
      tenantId: args.tenantId,
      userId,
      accountId: args.accountId,
      reference,
      amountMinor,
      currency,
      status: "pending",
      method: args.method,
      description: args.description?.trim(),
      idempotencyKey: key,
      createdAt: now,
    } as any);
    await audit(ctx as MutationCtx, userId, "DEPOSIT_CREATED", "bankingDeposit", id, null, { reference, amountMinor, currency });
    // Notify via Convex realtime subscription; customer visible via query.
    await ctx.db.insert("notifications", { userId, title: "Deposit initiated", message: `Deposit ${fmtMoney(amountMinor, currency)} (${reference}) — pending`, type: "banking.deposit", isRead: false, link: `/site/${args.tenantId}/banking`, createdAt: now, metadata: { tenantId: args.tenantId, depositId: id } as any });
    return { id, reference, status: "pending" as const };
  },
});

/** Reconcile/complete a deposit into the ledger — admin or trusted. */
export const reconcileDeposit = mutation({
  args: { tenantId: v.id("tenantSites"), depositId: v.id("bankingDeposits"), completed: v.boolean(), failureReason: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const { userId: actorId } = await requireOwner(ctx as MutationCtx, args.tenantId);
    const dep = await ctx.db.get(args.depositId);
    if (!dep || dep.tenantId !== args.tenantId) throw new Error("DEPOSIT_NOT_FOUND");
    if (dep.status === "completed" && args.completed) throw new Error("DUPLICATE: already completed");
    // Idempotency: if already has ledgerGroupId, it's completed — reuse result.
    if ((dep as any).reconciledLedgerGroupId && args.completed) {
      return { status: (dep as any).status, reused: true };
    }
    const now = Date.now();
    if (args.completed) {
      const groupId = `deposit-${dep.reference}-${dep._id}`;
      const acctId = (dep as any).accountId as Id<"tenantAccounts"> | undefined;
      const acct = acctId ? await ctx.db.get(acctId) : null;
      const currency = (dep as any).currency as string;
      const amountMinor = (dep as any).amountMinor as number;
      // Double-entry: debit external (represented via a contra/fee) and credit customer's account.
      // For portability, we model as (debit contra, credit account) — both entries tenant-scoped.
      await ctx.db.insert("bankingLedgerEntries", { tenantId: args.tenantId, groupId, relatedKind: "deposit" as const, relatedId: args.depositId as unknown as string, accountId: acctId, userId: dep.userId as Id<"users"> | undefined, debitMinor: 0, creditMinor: amountMinor, currency, description: `Deposit ${dep.reference} credited`, createdAt: now } as any);
      await ctx.db.insert("bankingLedgerEntries", { tenantId: args.tenantId, groupId, relatedKind: "deposit" as const, relatedId: args.depositId as unknown as string, debitMinor: amountMinor, creditMinor: 0, currency, description: `Deposit ${dep.reference} (contra)`, createdAt: now } as any);
      // Update cached balances on the target account (authoritative source remains ledger).
      if (acct) {
        const prev = (acct as any).balanceMinor ?? Math.round(((acct as any).balance ?? 0) * 100);
        const next = prev + amountMinor;
        await ctx.db.patch(acct._id, { balanceMinor: next, availableBalanceMinor: next, ledgerBalanceMinor: next, balance: next / 100, isActive: true } as any);
      }
      await ctx.db.patch(args.depositId, { status: "completed", completedAt: now, reconciledLedgerGroupId: groupId } as any);
      await audit(ctx as MutationCtx, actorId, "DEPOSIT_RECONCILED", "bankingDeposit", args.depositId, { status: (dep as any).status }, { status: "completed", groupId });
      await ctx.db.insert("notifications", { userId: dep.userId as any, title: "Deposit completed", message: `Your deposit ${dep.reference} (${fmtMoney(amountMinor, currency)}) was credited.`, type: "banking.deposit_completed", isRead: false, link: `/site/${args.tenantId}/banking`, createdAt: now } as any);
      return { status: "completed" as const };
    } else {
      await ctx.db.patch(args.depositId, { status: "failed", completedAt: now } as any);
      await audit(ctx as MutationCtx, actorId, "DEPOSIT_FAILED", "bankingDeposit", args.depositId, { status: (dep as any).status }, { status: "failed", reason: args.failureReason });
      await ctx.db.insert("notifications", { userId: dep.userId as any, title: "Deposit failed", message: `Deposit ${dep.reference} failed${args.failureReason ? `: ${args.failureReason}` : "."}`, type: "banking.deposit_failed", isRead: false, link: `/site/${args.tenantId}/banking`, createdAt: now } as any);
      return { status: "failed" as const };
    }
  },
});

// ─── Withdrawals ────────────────────────────────────────────────────

export const createWithdrawal = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    accountId: v.id("tenantAccounts"),
    amountMinor: v.number(),
    currency: v.optional(v.string()),
    destination: v.optional(v.string()),
    method: v.optional(v.string()),
    description: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireTenantUser(ctx as MutationCtx, args.tenantId);
    const tenant = await getTenant(args.tenantId, ctx);
    await assertTenantActive(tenant);
    const acct = await ctx.db.get(args.accountId);
    if (!acct || acct.tenantId !== args.tenantId || acct.userId !== userId) throw new Error("ACCOUNT_NOT_FOUND");
    const status = ((acct as any).status ?? (acct.isActive ? "active" : "closed")) as string;
    if (!acct.isActive || ["frozen", "suspended", "closed"].includes(status)) throw new Error("ACCOUNT_INACTIVE");
    const feeConfig = await ctx.db.query("bankingFeeConfig").withIndex("by_tenant", q => q.eq("tenantId", args.tenantId)).first();
    const feeMinor = feeConfig?.withdrawalFeeMinor ?? 0;
    const amountMinor = toMinorSafe(args.amountMinor);
    if (amountMinor <= 0) throw new Error("INVALID_AMOUNT");
    const minTx = feeConfig?.minTransactionMinor ?? 0;
    const perTx = feeConfig?.perTransactionLimitMinor ?? Number.MAX_SAFE_INTEGER;
    if (amountMinor < minTx) throw new Error(`MINIMUM_TRANSACTION_${minTx}`);
    if (amountMinor > perTx) throw new Error(`PER_TRANSACTION_LIMIT_${perTx}`);
    if (feeConfig?.dailyWithdrawalLimitMinor) {
      const windowStart = Date.now() - 24 * 3600 * 1000;
      const prior = await ctx.db.query("bankingWithdrawals")
        .withIndex("by_user", q => q.eq("userId", userId).gte("createdAt", windowStart))
        .collect();
      const already = prior.filter(w => w.tenantId === args.tenantId && ["pending", "processing", "completed"].includes(w.status)).reduce((s, w) => s + (w as any).amountMinor + (w as any).feeMinor, 0);
      if (already + amountMinor + feeMinor > (feeConfig.dailyWithdrawalLimitMinor || Number.MAX_SAFE_INTEGER))
        throw new Error("DAILY_LIMIT_EXCEEDED");
    }
    const currency = (args.currency ?? (acct as any).currency ?? (tenant as any).currency ?? "USD").toUpperCase();
    const total = amountMinor + feeMinor;
    const available = (acct as any).balanceMinor ?? Math.round(((acct as any).balance ?? 0) * 100);
    if (available < total) throw new Error("INSUFFICIENT_FUNDS");
    const key = args.idempotencyKey?.trim();
    if (key) {
      const row = await ctx.db.query("bankingWithdrawals").withIndex("by_idempotency", q => q.eq("idempotencyKey", key)).first();
      if (row) {
        if ((row as any).tenantId !== args.tenantId || row.userId !== userId) throw new Error("IDEMPOTENCY_KEY_CONFLICT");
        return { id: row._id, reference: row.reference, status: row.status, reused: true };
      }
    }
    const reference = toReference("WTH-");
    const now = Date.now();
    const groupId = `withdraw-${reference}`;
    const id = await ctx.db.insert("bankingWithdrawals", {
      tenantId: args.tenantId,
      userId,
      accountId: args.accountId,
      reference,
      amountMinor,
      feeMinor,
      totalDebitMinor: total,
      currency,
      destination: args.destination?.trim(),
      method: args.method ?? "withdrawal",
      status: "pending",
      description: args.description?.trim(),
      idempotencyKey: key,
      ledgerGroupId: groupId,
      createdAt: now,
    } as any);

    // Atomic debit + fee as ledger entries (the source of truth)
    const feeSuffix = feeMinor ? ` + fee ${fmtMoney(feeMinor, currency)}` : "";
    await ctx.db.insert("bankingLedgerEntries", { tenantId: args.tenantId, groupId, relatedKind: "withdrawal", relatedId: id, accountId: args.accountId, userId, debitMinor: amountMinor, creditMinor: 0, currency, description: `Withdrawal ${reference}${feeSuffix}`, idempotencyKey: `ledger-${groupId}-debit`, createdAt: now } as any);
    if (feeMinor) {
      await ctx.db.insert("bankingLedgerEntries", { tenantId: args.tenantId, groupId, relatedKind: "fee", relatedId: id, accountId: args.accountId, userId, debitMinor: feeMinor, creditMinor: 0, currency, description: `Withdrawal fee ${reference}`, idempotencyKey: `ledger-${groupId}-fee`, createdAt: now } as any);
    }
    await ctx.db.insert("bankingLedgerEntries", { tenantId: args.tenantId, groupId, relatedKind: "withdrawal", relatedId: id, debitMinor: 0, creditMinor: amountMinor + feeMinor, currency, description: `Withdrawal ${reference} (contra)`, idempotencyKey: `ledger-${groupId}-contra`, createdAt: now } as any);

    await ctx.db.patch(args.accountId, { balanceMinor: available - total, availableBalanceMinor: available - total, ledgerBalanceMinor: available - total, balance: (available - total) / 100 } as any);
    await ctx.db.patch(id, { status: "completed", completedAt: now } as any);
    if (key) await recordIdem(ctx as MutationCtx, key, "withdrawal", args.tenantId, userId, "bankingWithdrawals", id);
    await audit(ctx as MutationCtx, userId, "WITHDRAWAL_COMPLETED", "bankingWithdrawal", id, null, { reference, amountMinor, feeMinor, currency } as any);
    await ctx.db.insert("notifications", { userId, title: "Withdrawal processed", message: `Withdrawal ${reference} of ${fmtMoney(amountMinor, currency)}${feeMinor ? ` (fee ${fmtMoney(feeMinor, currency)})` : ""} completed.`, type: "banking.withdrawal_completed", isRead: false, link: `/site/${args.tenantId}/banking`, createdAt: now, metadata: { tenantId: args.tenantId, accountId: args.accountId, withdrawalId: id } as any });
    return { id, reference, status: "completed" as const };
  },
});

// ─── Transfers ──────────────────────────────────────────────────────

export const createTransfer = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    sourceAccountId: v.id("tenantAccounts"),
    destType: v.union(v.literal("internal_account"), v.literal("beneficiary"), v.literal("external")),
    destAccountId: v.optional(v.id("tenantAccounts")),
    beneficiaryId: v.optional(v.id("bankingBeneficiaries")),
    amountMinor: v.number(),
    currency: v.optional(v.string()),
    description: v.optional(v.string()),
    idempotencyKey: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireTenantUser(ctx as MutationCtx, args.tenantId);
    const tenant = await getTenant(args.tenantId, ctx);
    await assertTenantActive(tenant);
    const src = await ctx.db.get(args.sourceAccountId);
    if (!src || src.tenantId !== args.tenantId || src.userId !== userId) throw new Error("ACCOUNT_NOT_FOUND");
    const sst = ((src as any).status ?? (src.isActive ? "active" : "closed")) as string;
    if (!src.isActive || ["frozen", "suspended", "closed"].includes(sst)) throw new Error("SOURCE_ACCOUNT_INACTIVE");

    let destAccount: any = null;
    if (args.destType === "internal_account") {
      if (!args.destAccountId) throw new Error("INVALID_DESTINATION");
      destAccount = await ctx.db.get(args.destAccountId);
      if (!destAccount || destAccount.tenantId !== args.tenantId) throw new Error("DESTINATION_NOT_FOUND");
      const dstStatus = ((destAccount as any).status ?? (destAccount.isActive ? "active" : "closed")) as string;
      if (!destAccount.isActive || ["frozen", "suspended", "closed"].includes(dstStatus)) throw new Error("DESTINATION_INACTIVE");
      if (destAccount._id === src._id) throw new Error("SELF_TRANSFER_FORBIDDEN");
    } else if (args.destType === "beneficiary") {
      if (!args.beneficiaryId) throw new Error("INVALID_BENEFICIARY");
      const ben = await ctx.db.get(args.beneficiaryId);
      if (!ben || ben.tenantId !== args.tenantId || ben.ownerUserId !== userId) throw new Error("BENEFICIARY_NOT_FOUND");
    }

    const feeConfig = await ctx.db.query("bankingFeeConfig").withIndex("by_tenant", q => q.eq("tenantId", args.tenantId)).first();
    const feeMinor = feeConfig?.transferFeeMinor ?? 0;
    const amountMinor = toMinorSafe(args.amountMinor);
    if (amountMinor <= 0) throw new Error("INVALID_AMOUNT");
    const minTx = feeConfig?.minTransactionMinor ?? 0;
    const perTx = feeConfig?.perTransactionLimitMinor ?? Number.MAX_SAFE_INTEGER;
    if (amountMinor < minTx) throw new Error(`MINIMUM_TRANSACTION_${minTx}`);
    if (amountMinor > perTx) throw new Error(`PER_TRANSACTION_LIMIT_${perTx}`);
    if (feeConfig?.dailyTransferLimitMinor) {
      const from = Date.now() - 24 * 3600 * 1000;
      const prior = await ctx.db.query("bankingTransfers").withIndex("by_tenant", q => q.eq("tenantId", args.tenantId)).collect();
      const myPrior = prior.filter(t => t.initiatorUserId === userId && ["pending", "processing", "completed"].includes(t.status) && t.createdAt >= from);
      const already = myPrior.reduce((s, t) => s + (t as any).amountMinor + (t as any).feeMinor, 0);
      if (already + amountMinor + feeMinor > (feeConfig.dailyTransferLimitMinor || Number.MAX_SAFE_INTEGER)) throw new Error("DAILY_LIMIT_EXCEEDED");
    }
    const currency = (args.currency ?? (src as any).currency ?? (tenant as any).currency ?? "USD").toUpperCase();
    const totalDebit = amountMinor + feeMinor;
    const available = (src as any).balanceMinor ?? Math.round(((src as any).balance ?? 0) * 100);
    if (available < totalDebit) throw new Error("INSUFFICIENT_FUNDS");

    const key = args.idempotencyKey?.trim();
    if (key) {
      const row = await ctx.db.query("bankingTransfers").withIndex("by_idempotency", q => q.eq("idempotencyKey", key)).first();
      if (row) {
        if ((row as any).tenantId !== args.tenantId || row.initiatorUserId !== userId) throw new Error("IDEMPOTENCY_KEY_CONFLICT");
        return { id: row._id, reference: row.reference, status: row.status, reused: true };
      }
    }

    const reference = toReference("TXN-");
    const now = Date.now();
    const groupId = `transfer-${reference}`;
    const ledgerRows: Array<any> = [];

    // Principal movement: debit source, credit destination (or external contra).
    ledgerRows.push({ tenantId: args.tenantId, groupId, relatedKind: "transfer" as const, relatedId: `pending-${reference}`, accountId: args.sourceAccountId, userId, debitMinor: amountMinor, creditMinor: 0, currency, description: `Transfer ${reference} → ${args.destType}`, idempotencyKey: `ledger-${groupId}-debit`, createdAt: now });
    ledgerRows.push({ tenantId: args.tenantId, groupId, relatedKind: "transfer" as const, relatedId: `pending-${reference}`, accountId: (args.destAccountId ?? undefined) as any, userId: destAccount ? (destAccount.userId as Id<"users">) : undefined, debitMinor: 0, creditMinor: amountMinor, currency, description: `Transfer ${reference} credited`, idempotencyKey: `ledger-${groupId}-credit`, createdAt: now });
    // Fee, if any — balanced within same group (debit fee holder, credit contra).
    if (feeMinor) {
      ledgerRows.push({ tenantId: args.tenantId, groupId, relatedKind: "fee" as const, relatedId: `pending-${reference}`, accountId: args.sourceAccountId, userId, debitMinor: feeMinor, creditMinor: 0, currency, description: `Transfer fee ${reference}`, idempotencyKey: `ledger-${groupId}-fee`, createdAt: now });
      ledgerRows.push({ tenantId: args.tenantId, groupId, relatedKind: "fee" as const, relatedId: `pending-${reference}`, debitMinor: 0, creditMinor: feeMinor, currency, description: `Transfer fee ${reference} (contra)`, idempotencyKey: `ledger-${groupId}-fee-contra`, createdAt: now });
    }
    verifyDebitsEqCredits(ledgerRows.map(r => ({ debitMinor: r.debitMinor ?? 0, creditMinor: r.creditMinor ?? 0 })));

    const transferId = await ctx.db.insert("bankingTransfers", {
      tenantId: args.tenantId,
      initiatorUserId: userId,
      sourceAccountId: args.sourceAccountId,
      destType: args.destType,
      destAccountId: args.destAccountId,
      beneficiaryId: args.beneficiaryId,
      reference,
      amountMinor,
      feeMinor,
      totalDebitMinor: totalDebit,
      currency,
      feeSnapshot: feeConfig ? { transferFeeMinor: feeConfig.transferFeeMinor, perTransactionLimitMinor: feeConfig.perTransactionLimitMinor, dailyLimitMinor: feeConfig.dailyTransferLimitMinor } : null,
      status: "pending",
      description: args.description?.trim(),
      idempotencyKey: key,
      ledgerGroupId: groupId,
      createdAt: now,
    } as any);

    // Now patch relatedId to the real transfer id and write ledger posts atomically within the same mutation.
    for (const row of ledgerRows) {
      row.relatedId = transferId;
      await ctx.db.insert("bankingLedgerEntries", row);
    }

    const srcNew = available - totalDebit;
    await ctx.db.patch(args.sourceAccountId, { balanceMinor: srcNew, availableBalanceMinor: srcNew, ledgerBalanceMinor: srcNew, balance: srcNew / 100 } as any);
    if (destAccount && args.destType === "internal_account") {
      const destPrev = (destAccount as any).balanceMinor ?? Math.round(((destAccount as any).balance ?? 0) * 100);
      const destNew = destPrev + amountMinor;
      await ctx.db.patch(destAccount._id, { balanceMinor: destNew, availableBalanceMinor: destNew, ledgerBalanceMinor: destNew, balance: destNew / 100 } as any);
      await ctx.db.insert("notifications", { userId: destAccount.userId as any, title: "Incoming transfer", message: `You received ${fmtMoney(amountMinor, currency)} from ${reference}.`, type: "banking.transfer_incoming", isRead: false, link: `/site/${args.tenantId}/banking`, createdAt: now } as any);
    }

    await ctx.db.patch(transferId, { status: "completed", completedAt: now } as any);

    if (key) await recordIdem(ctx as MutationCtx, key, "transfer", args.tenantId, userId, "bankingTransfers", transferId);
    await audit(ctx as MutationCtx, userId, "TRANSFER_COMPLETED", "bankingTransfer", transferId, null, { reference, amountMinor, feeMinor, currency, destType: args.destType });
    await ctx.db.insert("notifications", { userId, title: "Transfer completed", message: `Transfer ${reference} of ${fmtMoney(amountMinor, currency)}${feeMinor ? ` (fee ${fmtMoney(feeMinor, currency)})` : ""} completed.`, type: "banking.transfer_completed", isRead: false, link: `/site/${args.tenantId}/banking`, createdAt: now } as any);

    return { id: transferId, reference, status: "completed" as const, feeMinor };
  },
});

// ─── Banking queries (member + owner) ─────────────────────────────────

export const bankingHistory = query({
  args: { tenantId: v.id("tenantSites"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const m = await softMember(ctx as QueryCtx, args.tenantId);
    if (!m) return { transfers: [] as any[], deposits: [] as any[], withdrawals: [] as any[], ledgerPosts: [] as any[] };
    const { userId } = m;
    // member sees their own txns; owner sees broader (allowed: tenant owner)
    const [transfers, deposits, withdrawals, entries] = await Promise.all([
      ctx.db.query("bankingTransfers").withIndex("by_tenant", q => q.eq("tenantId", args.tenantId)).order("desc").take(200),
      ctx.db.query("bankingDeposits").withIndex("by_user", q => q.eq("userId", userId)).order("desc").take(50),
      ctx.db.query("bankingWithdrawals").withIndex("by_user", q => q.eq("userId", userId)).order("desc").take(50),
      ctx.db.query("bankingLedgerEntries").withIndex("by_user", q => q.eq("userId", userId)).order("desc").take(100),
    ]);
    const ownTransfers = transfers.filter(t => t.initiatorUserId === userId);
    return { transfers: ownTransfers, deposits, withdrawals, ledgerPosts: entries };
  },
});

export const statement = query({
  args: { tenantId: v.id("tenantSites"), accountId: v.id("tenantAccounts"), fromMs: v.optional(v.number()), toMs: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const { userId, isOwner } = await requireTenantUser(ctx as QueryCtx, args.tenantId);
    const acct = await ctx.db.get(args.accountId);
    if (!acct || acct.tenantId !== args.tenantId) throw new Error("ACCOUNT_NOT_FOUND");
    if (acct.userId !== userId && !isOwner) throw new Error("FORBIDDEN");
    const from = args.fromMs ?? (Date.now() - 30 * 24 * 3600 * 1000);
    const to = args.toMs ?? Date.now();
    const posts = await ctx.db.query("bankingLedgerEntries").withIndex("by_account", q => q.eq("accountId", args.accountId)).order("asc").collect();
    const windowed = posts.filter(p => p.createdAt >= from && p.createdAt <= to);
    const before = posts.filter(p => p.createdAt < from);
    // opening balance = current balance - window credits/debits diff
    const opening = before.reduce((s, p) => s + ((p as any).creditMinor ?? 0) - ((p as any).debitMinor ?? 0), 0);
    const windowCredits = windowed.reduce((s, p) => s + ((p as any).creditMinor ?? 0), 0);
    const windowDebits = windowed.reduce((s, p) => s + ((p as any).debitMinor ?? 0), 0);
    const closing = opening + windowCredits - windowDebits;
    const accountBalanceMinor = (acct as any).balanceMinor ?? Math.round(((acct as any).balance ?? 0) * 100);
    return {
      account: { _id: acct._id, name: (acct as any).name, accountNumber: (acct as any).accountNumber, currency: (acct as any).currency ?? "USD" },
      tenant: { currency: (acct as any).currency ?? "USD" },
      range: { from, to },
      openingBalanceMinor: opening,
      closingBalanceMinor: closing,
      authoritativeBalanceMinor: accountBalanceMinor,
      posts: windowed,
      isBalanced: closing !== undefined,
    };
  },
});

export const adminTenantHistory = query({
  args: { tenantId: v.id("tenantSites"), limit: v.optional(v.number()), userId: v.optional(v.id("users")), status: v.optional(v.string()), search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("UNAUTHORIZED");
    const who = await ctx.db.get(adminId);
    const tenant = await ctx.db.get(args.tenantId);
    const isOwner = tenant && (tenant as any).ownerId === adminId;
    if ((who?.role !== "admin") && !isOwner) throw new Error("FORBIDDEN");
    let transfers = await ctx.db.query("bankingTransfers").withIndex("by_tenant", q => q.eq("tenantId", args.tenantId)).order("desc").take(Math.min(args.limit ?? 50, 200));
    let deposits = await ctx.db.query("bankingDeposits").withIndex("by_tenant", q => q.eq("tenantId", args.tenantId)).order("desc").take(Math.min(args.limit ?? 50, 200));
    let withdrawals = await ctx.db.query("bankingWithdrawals").withIndex("by_tenant", q => q.eq("tenantId", args.tenantId)).order("desc").take(Math.min(args.limit ?? 50, 200));
    const entries = await ctx.db.query("bankingLedgerEntries").withIndex("by_tenant", q => q.eq("tenantId", args.tenantId)).order("desc").take(Math.min(args.limit ?? 50, 200));
    if (args.userId) {
      const uid = args.userId;
      transfers = transfers.filter(t => t.initiatorUserId === uid);
      deposits = deposits.filter(d => d.userId === uid);
      withdrawals = withdrawals.filter(w => w.userId === uid);
    }
    if (args.status) {
      const s = args.status;
      transfers = transfers.filter(t => (t as any).status === s);
      deposits = deposits.filter(d => (d as any).status === s);
      withdrawals = withdrawals.filter(w => (w as any).status === s);
    }
    if (args.search?.trim()) {
      const t = args.search.toLowerCase();
      transfers = transfers.filter(x => (x as any).reference.toLowerCase().includes(t) || (x as any).description?.toLowerCase().includes(t));
      deposits = deposits.filter(x => (x as any).reference.toLowerCase().includes(t));
      withdrawals = withdrawals.filter(x => (x as any).reference.toLowerCase().includes(t));
    }
    return { transfers, deposits, withdrawals, ledgerPosts: entries };
  },
});
