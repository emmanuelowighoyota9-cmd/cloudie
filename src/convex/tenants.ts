import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

export const create = mutation({
  args: {
    siteName: v.string(),
    subdomain: v.string(),
    siteType: v.union(v.literal("bank"), v.literal("investment"), v.literal("logistics"), v.literal("ticketing"), v.literal("business"), v.literal("services")),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const existing = await ctx.db
      .query("tenantSites")
      .withIndex("by_subdomain", (q) => q.eq("subdomain", args.subdomain))
      .first();
    if (existing) throw new Error("Subdomain already taken");

    return await ctx.db.insert("tenantSites", {
      ownerId: userId,
      siteName: args.siteName,
      subdomain: args.subdomain,
      siteType: args.siteType,
      isActive: true,
      renewalDate: Date.now() + 365 * 24 * 60 * 60 * 1000,
      contactEmail: args.contactEmail,
      contactPhone: args.contactPhone,
      createdAt: Date.now(),
    });
  },
});

export const listMy = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("tenantSites")
      .withIndex("by_owner", (q) => q.eq("ownerId", userId))
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { id: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const tenant = await ctx.db.get(args.id);
    if (!tenant) return null;
    if (tenant.ownerId !== userId) return null;
    return tenant;
  },
});

export const update = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    siteName: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    branding: v.optional(
      v.object({
        logo: v.optional(v.string()),
        primaryColor: v.optional(v.string()),
        accentColor: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== userId) throw new Error("Not found");

    const updates: Record<string, unknown> = {};
    if (args.siteName) updates.siteName = args.siteName;
    if (args.contactEmail) updates.contactEmail = args.contactEmail;
    if (args.contactPhone) updates.contactPhone = args.contactPhone;
    if (args.branding) updates.branding = args.branding;

    await ctx.db.patch(args.tenantId, updates);
    return { success: true };
  },
});

export const toggleActive = mutation({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== userId) throw new Error("Not found");
    await ctx.db.patch(args.tenantId, { isActive: !tenant.isActive });
    return { success: true };
  },
});

export const submitKyc = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    fullName: v.string(),
    dateOfBirth: v.optional(v.string()),
    documentUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== userId) throw new Error("Not found");

    const now = Date.now();
    return await ctx.db.insert("kycRecords", {
      tenantId: args.tenantId,
      userId,
      status: "submitted",
      fullName: args.fullName,
      dateOfBirth: args.dateOfBirth,
      documentUrl: args.documentUrl,
      resubmissionCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const listKyc = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== userId) return [];
    return await ctx.db
      .query("kycRecords")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .order("desc")
      .collect();
  },
});

export const getTenantLedger = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== userId) return [];
    return await ctx.db
      .query("tenantLedger")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .order("desc")
      .collect();
  },
});

export const adminList = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return [];
    return await ctx.db
      .query("tenantSites")
      .order("desc")
      .take(args.limit ?? 50);
  },
});

export const adminLockdown = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") throw new Error("Admin only");

    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant) throw new Error("Tenant not found");

    await ctx.db.patch(args.tenantId, { isActive: false });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actorEmail: user.email,
      action: "tenant_lockdown",
      resource: "tenantSite",
      resourceId: args.tenantId,
      before: { isActive: tenant.isActive },
      after: { isActive: false },
      reason: args.reason,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const adminKycReview = mutation({
  args: {
    kycId: v.id("kycRecords"),
    status: v.union(
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("resubmission_required"),
      v.literal("under_review"),
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") throw new Error("Admin only");

    const kyc = await ctx.db.get(args.kycId);
    if (!kyc) throw new Error("KYC record not found");

    // Enforce the review state machine: submitted/under_review → outcome
    const allowed: Record<string, string[]> = {
      submitted: ["under_review", "approved", "rejected", "resubmission_required"],
      under_review: ["approved", "rejected", "resubmission_required"],
      resubmission_required: [], // applicant must resubmit first
    };
    if (!allowed[kyc.status]?.includes(args.status)) {
      throw new Error(`Invalid KYC transition: ${kyc.status} → ${args.status}`);
    }

    // Rejection requires a reason
    if (args.status === "rejected" && (!args.notes || args.notes.trim().length < 5)) {
      throw new Error("A rejection reason of at least 5 characters is required");
    }

    await ctx.db.patch(args.kycId, {
      status: args.status,
      notes: args.notes,
      reviewedBy: userId,
      reviewedAt: Date.now(),
      updatedAt: Date.now(),
    });

    await ctx.db.insert("kycEvents", {
      kycId: args.kycId,
      actorId: userId,
      action: `kyc_${args.status}`,
      fromStatus: kyc.status,
      toStatus: args.status,
      reason: args.notes,
      createdAt: Date.now(),
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actorEmail: user.email,
      action: `kyc_${args.status}`,
      resource: "kycRecord",
      resourceId: args.kycId,
      before: { status: kyc.status },
      after: { status: args.status },
      createdAt: Date.now(),
    });

    await ctx.db.insert("notifications", {
      userId: kyc.userId,
      title: `KYC ${args.status.replace(/_/g, " ")}`,
      message:
        args.status === "approved"
          ? "Your identity verification was approved."
          : args.status === "rejected"
            ? `Your verification was rejected: ${args.notes}`
            : "Additional information is required for your verification.",
      type: "kyc_update",
      isRead: false,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const adminListKyc = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return [];
    return await ctx.db.query("kycRecords").order("desc").take(args.limit ?? 50);
  },
});

/** Applicant resubmits KYC after a resubmission_required decision. Audited. */
export const resubmitKyc = mutation({
  args: {
    kycId: v.id("kycRecords"),
    fullName: v.string(),
    dateOfBirth: v.optional(v.string()),
    documentUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const kyc = await ctx.db.get(args.kycId);
    if (!kyc) throw new Error("KYC record not found");
    if (kyc.userId !== userId) throw new Error("Forbidden");
    if (kyc.status !== "resubmission_required") {
      throw new Error("Resubmission is not available for this case");
    }

    const now = Date.now();
    await ctx.db.patch(args.kycId, {
      status: "submitted",
      fullName: args.fullName,
      dateOfBirth: args.dateOfBirth,
      documentUrl: args.documentUrl ?? kyc.documentUrl,
      resubmissionCount: (kyc.resubmissionCount ?? 0) + 1,
      reviewedBy: undefined,
      reviewedAt: undefined,
      updatedAt: now,
    });

    await ctx.db.insert("kycEvents", {
      kycId: args.kycId,
      actorId: userId,
      action: "kyc_resubmitted",
      fromStatus: "resubmission_required",
      toStatus: "submitted",
      createdAt: now,
    });

    return { success: true };
  },
});

// ─── Tenant Accounts ───────────────────────────────────────────────────────

export const listAccounts = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== userId) return [];
    return await ctx.db
      .query("tenantAccounts")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .order("desc")
      .take(500);
  },
});

export const createAccount = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    userId: v.id("users"),
    accountType: v.union(v.literal("checking"), v.literal("savings"), v.literal("credit")),
    name: v.string(),
    initialBalance: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Unauthorized");
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== ownerId) throw new Error("Not found");
    if (!tenant.isActive) throw new Error("Site is locked");
    const holder = await ctx.db.get(args.userId);
    if (!holder) throw new Error("Account holder not found");
    if (args.userId !== ownerId) {
      const membership = await ctx.db.query("tenantUsers").withIndex("by_tenant_and_user", (q) => q.eq("tenantId", args.tenantId).eq("userId", args.userId)).first();
      if (!membership) throw new Error("Account holder must be a member of this site");
    }
    const accountName = args.name.trim();
    if (!accountName || accountName.length > 80) throw new Error("Account name must be 1–80 characters");
    const lifecycle = (tenant as any).lifecycleStatus ?? (tenant.isActive ? "active" : "disabled");
    if (["disabled", "suspended", "archived", "draft"].includes(lifecycle)) throw new Error(`Site is ${lifecycle}`);

    // Generate a unique account number (collision-checked against the by_account_number index).
    let acctNum = "";
    for (let i = 0; i < 10; i++) {
      const cand = `${Math.floor(1000000000 + Math.random() * 9000000000)}`;
      const dupe = await ctx.db.query("tenantAccounts").withIndex("by_account_number", (q) => q.eq("accountNumber", cand)).first();
      if (!dupe) { acctNum = cand; break; }
    }
    if (!acctNum) throw new Error("Account number collision");
    const routingNum = `${Math.floor(100000000 + Math.random() * 900000000)}`;
    const currency = (tenant as any).currency ?? "USD";
    const requestedOpening = args.initialBalance ?? 0;
    if (!Number.isFinite(requestedOpening) || requestedOpening < 0) throw new Error("Opening balance cannot be negative");
    const openingMinor = Math.round(requestedOpening * 100);
    if (!Number.isSafeInteger(openingMinor)) throw new Error("Opening balance is outside the supported range");
    const now = Date.now();

    const id = await ctx.db.insert("tenantAccounts", {
      tenantId: args.tenantId,
      userId: args.userId,
      accountType: args.accountType,
      name: accountName,
      balance: openingMinor / 100,
      accountNumber: acctNum,
      routingNumber: routingNum,
      currency,
      isActive: true,
      status: "active",
      balanceMinor: openingMinor,
      availableBalanceMinor: openingMinor,
      ledgerBalanceMinor: openingMinor,
      createdAt: now,
    });

    // Opening funding is recorded through the same double-entry ledger every other money path uses.
    if (openingMinor > 0) {
      const groupId = `opening-${id}-${now}`;
      await ctx.db.insert("bankingLedgerEntries", { tenantId: args.tenantId, groupId, relatedKind: "adjustment", relatedId: id, accountId: id, userId: args.userId, debitMinor: 0, creditMinor: openingMinor, currency, description: "Opening balance", createdAt: now } as any);
      await ctx.db.insert("bankingLedgerEntries", { tenantId: args.tenantId, groupId, relatedKind: "adjustment", relatedId: id, userId: args.userId, debitMinor: openingMinor, creditMinor: 0, currency, description: "Opening balance (contra)", createdAt: now } as any);
    }
    await ctx.db.insert("auditLogs", { actorId: ownerId, action: "ACCOUNT_OPENED_BY_ADMIN", resource: "tenantAccount", resourceId: id, after: { userId: args.userId, accountNumber: acctNum, openingMinor, currency }, createdAt: now } as any);
    return id;
  },
});

export const closeAccount = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    accountId: v.id("tenantAccounts"),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Unauthorized");
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== ownerId) throw new Error("Not found");
    const account = await ctx.db.get(args.accountId);
    if (!account || account.tenantId !== args.tenantId) throw new Error("Account not found");
    const now = Date.now();
    await ctx.db.patch(args.accountId, { isActive: false, status: "closed" });
    await ctx.db.insert("auditLogs", {
      actorId: ownerId,
      action: "ACCOUNT_CLOSED_BY_ADMIN",
      resource: "tenantAccount",
      resourceId: args.accountId,
      before: { isActive: account.isActive, status: (account as any).status ?? "active" },
      after: { isActive: false, status: "closed" },
      createdAt: now,
    } as any);
    return { success: true };
  },
});

export const depositToAccount = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    accountId: v.id("tenantAccounts"),
    amount: v.number(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Unauthorized");
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== ownerId) throw new Error("Not found");
    const account = await ctx.db.get(args.accountId);
    if (!account || account.tenantId !== args.tenantId) throw new Error("Account not found");
    if (!account.isActive) throw new Error("Account is closed");
    const acctStatus = (account as any).status ?? (account.isActive ? "active" : "closed");
    if (["frozen", "suspended", "closed"].includes(acctStatus)) throw new Error("Account is " + acctStatus);

    const amountMinor = amountToMinor(args.amount);
    const depositAmount = amountMinor / 100;
    const description = validateReason(args.description, `Deposit to ${account.name}`);
    const currency = (account as any).currency ?? (tenant as any).currency ?? "USD";
    const prev = (account as any).balanceMinor ?? Math.round((account.balance ?? 0) * 100);
    if (!Number.isSafeInteger(prev) || prev < 0 || !Number.isSafeInteger(prev + amountMinor)) throw new Error("Account balance is outside the supported range");
    const newMinor = prev + amountMinor;
    const now = Date.now();
    const groupId = `admin-deposit-${args.accountId}-${now}-${Math.random().toString(36).slice(2, 8)}`;

    // Same double-entry ledger as every other money path (balanced group, never a bare balance write).
    await ctx.db.insert("bankingLedgerEntries", { tenantId: args.tenantId, groupId, relatedKind: "deposit", relatedId: args.accountId, accountId: args.accountId, userId: account.userId, debitMinor: 0, creditMinor: amountMinor, currency, description, createdAt: now } as any);
    await ctx.db.insert("bankingLedgerEntries", { tenantId: args.tenantId, groupId, relatedKind: "deposit", relatedId: args.accountId, userId: account.userId, debitMinor: amountMinor, creditMinor: 0, currency, description: `${description} (contra)`, createdAt: now } as any);

    await ctx.db.patch(args.accountId, { balanceMinor: newMinor, availableBalanceMinor: newMinor, ledgerBalanceMinor: newMinor, balance: newMinor / 100 } as any);

    await ctx.db.insert("tenantLedger", {
      tenantId: args.tenantId,
      userId: account.userId,
      amount: depositAmount,
      description,
      type: "deposit",
      createdAt: now,
    });

    await ctx.db.insert("auditLogs", { actorId: ownerId, action: "DEPOSIT_RECORDED", resource: "tenantAccount", resourceId: args.accountId, before: { balanceMinor: prev }, after: { balanceMinor: newMinor, amountMinor, currency, groupId }, reason: description, createdAt: now } as any);

    await ctx.db.insert("notifications", {
      userId: account.userId,
      title: "Deposit received",
      message: `${fmtCurrency(depositAmount, currency)} deposited to ${account.name}. New balance: ${fmtCurrency(newMinor / 100, currency)}.`,
      type: "wallet",
      isRead: false,
      link: "/business",
      createdAt: now,
    });

    return { newBalance: newMinor / 100 };
  },
});

export const withdrawFromAccount = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    accountId: v.id("tenantAccounts"),
    amount: v.number(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Unauthorized");
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== ownerId) throw new Error("Not found");
    const account = await ctx.db.get(args.accountId);
    if (!account || account.tenantId !== args.tenantId) throw new Error("Account not found");
    if (!account.isActive) throw new Error("Account is closed");
    const acctStatus = (account as any).status ?? (account.isActive ? "active" : "closed");
    if (["frozen", "suspended", "closed"].includes(acctStatus)) throw new Error("Account is " + acctStatus);

    const amountMinor = amountToMinor(args.amount);
    const withdrawAmount = amountMinor / 100;
    const description = validateReason(args.description, `Withdrawal from ${account.name}`);
    const currency = (account as any).currency ?? (tenant as any).currency ?? "USD";
    const prev = (account as any).balanceMinor ?? Math.round((account.balance ?? 0) * 100);
    if (account.accountType !== "credit" && prev < amountMinor) {
      throw new Error("Insufficient funds");
    }
    if (!Number.isSafeInteger(prev) || !Number.isSafeInteger(prev - amountMinor)) throw new Error("Account balance is outside the supported range");
    const newMinor = prev - amountMinor;
    const now = Date.now();
    const groupId = `admin-withdrawal-${args.accountId}-${now}-${Math.random().toString(36).slice(2, 8)}`;

    await ctx.db.insert("bankingLedgerEntries", { tenantId: args.tenantId, groupId, relatedKind: "withdrawal", relatedId: args.accountId, accountId: args.accountId, userId: account.userId, debitMinor: amountMinor, creditMinor: 0, currency, description, createdAt: now } as any);
    await ctx.db.insert("bankingLedgerEntries", { tenantId: args.tenantId, groupId, relatedKind: "withdrawal", relatedId: args.accountId, userId: account.userId, debitMinor: 0, creditMinor: amountMinor, currency, description: `${description} (contra)`, createdAt: now } as any);

    await ctx.db.patch(args.accountId, { balanceMinor: newMinor, availableBalanceMinor: newMinor, ledgerBalanceMinor: newMinor, balance: newMinor / 100 } as any);

    await ctx.db.insert("tenantLedger", {
      tenantId: args.tenantId,
      userId: account.userId,
      amount: -withdrawAmount,
      description,
      type: "withdrawal",
      createdAt: now,
    });

    await ctx.db.insert("auditLogs", { actorId: ownerId, action: "WITHDRAWAL_RECORDED", resource: "tenantAccount", resourceId: args.accountId, before: { balanceMinor: prev }, after: { balanceMinor: newMinor, amountMinor, currency, groupId }, reason: description, createdAt: now } as any);

    await ctx.db.insert("notifications", {
      userId: account.userId,
      title: "Withdrawal processed",
      message: `${fmtCurrency(withdrawAmount, currency)} withdrawn from ${account.name}. New balance: ${fmtCurrency(newMinor / 100, currency)}.`,
      type: "wallet",
      isRead: false,
      link: "/business",
      createdAt: now,
    });

    return { newBalance: newMinor / 100 };
  },
});

function fmtCurrency(n: number, currency = "USD") {
  const supported = /^[A-Z]{3}$/.test(currency) ? currency : "USD";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: supported }).format(n);
}
function amountToMinor(amount: number): number {
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Enter an amount greater than zero");
  const minor = Math.round(amount * 100);
  if (!Number.isSafeInteger(minor) || minor <= 0) throw new Error("Amount is outside the supported range");
  return minor;
}
function validateReason(description: string | undefined, fallback: string): string {
  const reason = (description ?? fallback).trim();
  if (!reason || reason.length > 240) throw new Error("Transaction description must be 1–240 characters");
  return reason;
}

// ─── Tenant Users ──────────────────────────────────────────────────────────

export const listTenantUsers = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== userId) return [];
    const rows = await ctx.db
      .query("tenantUsers")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();
    const users = await Promise.all(rows.map((r) => ctx.db.get(r.userId)));
    return rows.map((r, i) => ({
      _id: r._id,
      userId: r.userId,
      role: r.role,
      createdAt: r.createdAt,
      email: users[i]?.email ?? null,
      name: users[i]?.name ?? null,
    }));
  },
});

export const addTenantUser = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    email: v.string(),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Unauthorized");
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== ownerId) throw new Error("Not found");
    if (!tenant.isActive) throw new Error("Site is locked");

    // Find user by email (index not available, scan users).
    const target = await ctx.db
      .query("users")
      .filter((q) => q.eq("email", args.email))
      .first();
    if (!target) throw new Error(`No user found with email ${args.email}`);

    const existing = await ctx.db
      .query("tenantUsers")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();
    if (existing.some((r) => r.userId === target._id)) {
      throw new Error("User is already a member of this site");
    }

    const now = Date.now();
    return await ctx.db.insert("tenantUsers", {
      tenantId: args.tenantId,
      userId: target._id,
      role: args.role || "member",
      createdAt: now,
    });
  },
});

export const removeTenantUser = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    membershipId: v.id("tenantUsers"),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Unauthorized");
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== ownerId) throw new Error("Not found");
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.tenantId !== args.tenantId) throw new Error("Membership not found");
    await ctx.db.delete(args.membershipId);
    return { success: true };
  },
});

// ─── Tenant Ledger ──────────────────────────────────────────────────────────

export const addLedgerEntry = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    userId: v.id("users"),
    amount: v.number(),
    description: v.string(),
    type: v.string(),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Unauthorized");
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== ownerId) throw new Error("Not found");
    const targetUser = await ctx.db.get(args.userId);
    if (!targetUser) throw new Error("Customer not found");
    if (!Number.isFinite(args.amount) || !Number.isSafeInteger(Math.round(args.amount * 100))) throw new Error("Invalid ledger amount");
    const description = args.description.trim();
    const type = args.type.trim();
    if (!description || description.length > 240) throw new Error("Description must be 1–240 characters");
    if (!type || type.length > 40) throw new Error("Ledger type must be 1–40 characters");
    const now = Date.now();
    const entryId = await ctx.db.insert("tenantLedger", { tenantId: args.tenantId, userId: args.userId, amount: args.amount, description, type, createdAt: now });
    await ctx.db.insert("auditLogs", { actorId: ownerId, action: "TENANT_LEDGER_ENTRY_CREATED", resource: "tenantLedger", resourceId: entryId, after: { tenantId: args.tenantId, userId: args.userId, amount: args.amount, type }, reason: description, createdAt: now } as any);
    return entryId;
  },
});

export const creditDemoAccount = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    userId: v.id("users"),
    amount: v.number(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Unauthorized");
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== ownerId) throw new Error("Not found");
    if (!tenant.isActive) throw new Error("Site is locked");
    if (!(await ctx.db.get(args.userId))) throw new Error("Customer not found");
    const amountMinor = amountToMinor(args.amount);
    const amount = amountMinor / 100;
    const description = validateReason(args.description, "Account credit");
    const now = Date.now();
    const entryId = await ctx.db.insert("tenantLedger", { tenantId: args.tenantId, userId: args.userId, amount, description, type: "credit", createdAt: now });
    // Notify the target user.
    await ctx.db.insert("notifications", {
      userId: args.userId,
      title: "Credit ledger entry recorded",
      message: `A credit ledger entry of ${fmtCurrency(amount, (tenant as any).currency ?? "USD")} was recorded for your ${tenant.siteType} account at ${tenant.siteName}. This entry alone does not confirm an account balance change.`,
      type: "wallet",
      isRead: false,
      link: "/business",
      createdAt: now,
    });
    await ctx.db.insert("auditLogs", { actorId: ownerId, action: "TENANT_CREDIT_LEDGER_ENTRY", resource: "tenantLedger", resourceId: entryId, after: { userId: args.userId, amountMinor, tenantId: args.tenantId }, reason: description, createdAt: now } as any);
    return { success: true };
  },
});

export const debitDemoAccount = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    userId: v.id("users"),
    amount: v.number(),
    description: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Unauthorized");
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== ownerId) throw new Error("Not found");
    if (!tenant.isActive) throw new Error("Site is locked");
    if (!(await ctx.db.get(args.userId))) throw new Error("Customer not found");
    const amountMinor = amountToMinor(args.amount);
    const amount = amountMinor / 100;
    const description = validateReason(args.description, "Account debit");
    const now = Date.now();
    const entryId = await ctx.db.insert("tenantLedger", { tenantId: args.tenantId, userId: args.userId, amount: -amount, description, type: "debit", createdAt: now });
    await ctx.db.insert("notifications", {
      userId: args.userId,
      title: "Debit ledger entry recorded",
      message: `A debit ledger entry of ${fmtCurrency(amount, (tenant as any).currency ?? "USD")} was recorded for your ${tenant.siteType} account at ${tenant.siteName}. This entry alone does not confirm an account balance change.`,
      type: "wallet",
      isRead: false,
      link: "/business",
      createdAt: now,
    });
    await ctx.db.insert("auditLogs", { actorId: ownerId, action: "TENANT_DEBIT_LEDGER_ENTRY", resource: "tenantLedger", resourceId: entryId, after: { userId: args.userId, amountMinor, tenantId: args.tenantId }, reason: description, createdAt: now } as any);
    return { success: true };
  },
});

/** KYC audit history — owner or admin. */
export const kycHistory = query({
  args: { kycId: v.id("kycRecords") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    const kyc = await ctx.db.get(args.kycId);
    if (!kyc) return [];
    if (kyc.userId !== userId && user?.role !== "admin") return [];
    return await ctx.db
      .query("kycEvents")
      .withIndex("by_kyc", (q) => q.eq("kycId", args.kycId))
      .order("asc")
      .collect();
  },
});

// ─── Public tenant site access (generated banking website) ─────────────────

/** Public: get tenant site info by ID (no auth required — used by the generated site). */
export const publicGet = query({
  args: { id: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const tenant = await ctx.db.get(args.id);
    if (!tenant) return null;
    return {
      _id: tenant._id,
      siteName: tenant.siteName,
      subdomain: tenant.subdomain,
      siteType: tenant.siteType,
      isActive: tenant.isActive,
      branding: tenant.branding,
      contactEmail: tenant.contactEmail,
      contactPhone: tenant.contactPhone,
      createdAt: tenant.createdAt,
    };
  },
});

/** Public: list active accounts for a tenant site (for stats display). */
export const publicStats = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || !tenant.isActive) return null;
    const accounts = await ctx.db
      .query("tenantAccounts")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();
    const activeAccounts = accounts.filter((a) => a.isActive);
    return {
      totalAccounts: activeAccounts.length,
      totalBalance: activeAccounts.reduce((s, a) => s + a.balance, 0),
      checking: activeAccounts.filter((a) => a.accountType === "checking").length,
      savings: activeAccounts.filter((a) => a.accountType === "savings").length,
      credit: activeAccounts.filter((a) => a.accountType === "credit").length,
    };
  },
});

// ─── Customer access (tenant members) ────────────────────────────────────

/** Check if the current user is a member of this tenant. */
async function requireTenantMember(ctx: { db: any; auth: any }, tenantId: string) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("Authentication required");
  const membership = await ctx.db
    .query("tenantUsers")
    .withIndex("by_tenant", (q: any) => q.eq("tenantId", tenantId))
    .collect();
  const isMember = membership.some((m: any) => m.userId === userId);
  const tenant = await ctx.db.get(tenantId);
  if (!tenant) throw new Error("Site not found");
  return { userId, isOwner: tenant.ownerId === userId, isMember: isMember || tenant.ownerId === userId, tenant };
}

/** Customer: list my accounts for this tenant. */
export const myAccounts = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const { userId, isMember } = await requireTenantMember(ctx, args.tenantId);
    if (!isMember) return [];
    return await ctx.db
      .query("tenantAccounts")
      .withIndex("by_tenant_and_user", (q) => q.eq("tenantId", args.tenantId).eq("userId", userId))
      .order("desc")
      .collect();
  },
});

/** Customer: list my transactions for this tenant. */
export const myTransactions = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const { userId, isMember } = await requireTenantMember(ctx, args.tenantId);
    if (!isMember) return [];
    return await ctx.db
      .query("tenantLedger")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect()
      .then((rows) => rows.filter((r) => r.userId === userId).sort((a, b) => b.createdAt - a.createdAt));
  },
});

/** Customer: submit KYC for this tenant. */
export const customerSubmitKyc = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    fullName: v.string(),
    dateOfBirth: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId, isMember } = await requireTenantMember(ctx, args.tenantId);
    if (!isMember) throw new Error("Not a member of this site");
    const now = Date.now();
    return await ctx.db.insert("kycRecords", {
      tenantId: args.tenantId,
      userId,
      status: "submitted",
      fullName: args.fullName,
      dateOfBirth: args.dateOfBirth,
      resubmissionCount: 0,
      createdAt: now,
      updatedAt: now,
    });
  },
});

/** Customer: list my KYC for this tenant. */
export const myKyc = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const { userId, isMember } = await requireTenantMember(ctx, args.tenantId);
    if (!isMember) return [];
    return await ctx.db
      .query("kycRecords")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect()
      .then((rows) => rows.filter((r) => r.userId === userId).sort((a, b) => b.createdAt - a.createdAt));
  },
});

/** Customer: get my notifications for this tenant. */
export const myNotifications = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const { userId, isMember } = await requireTenantMember(ctx, args.tenantId);
    if (!isMember) return [];
    return await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", userId).eq("isRead", false).gt("createdAt", Date.now() - 30 * 24 * 60 * 60 * 1000))
      .order("desc")
      .take(50);
  },
});

// ─── Bank Admin (site owner only) ────────────────────────────────────────

/** Bank admin: get dashboard stats. */
export const adminGetStats = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== userId) return null;

    const [accounts, customers, kyc, ledger] = await Promise.all([
      ctx.db.query("tenantAccounts").withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId)).collect(),
      ctx.db.query("tenantUsers").withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId)).collect(),
      ctx.db.query("kycRecords").withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId)).collect(),
      ctx.db.query("tenantLedger").withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId)).collect(),
    ]);

    const activeAccounts = accounts.filter((a) => a.isActive);
    const pendingKyc = kyc.filter((k) => k.status === "submitted" || k.status === "under_review");
    const totalDeposits = ledger.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
    const totalWithdrawals = ledger.filter((l) => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0);

    return {
      totalCustomers: customers.length,
      totalAccounts: activeAccounts.length,
      totalBalance: activeAccounts.reduce((s, a) => s + a.balance, 0),
      pendingKyc: pendingKyc.length,
      totalTransactions: ledger.length,
      totalDeposits,
      totalWithdrawals,
      totalChecking: activeAccounts.filter((a) => a.accountType === "checking").length,
      totalSavings: activeAccounts.filter((a) => a.accountType === "savings").length,
      totalCredit: activeAccounts.filter((a) => a.accountType === "credit").length,
    };
  },
});

/** Bank admin: list all customers with details. */
export const adminListCustomers = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== userId) return [];

    const memberships = await ctx.db
      .query("tenantUsers")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();

    const results = await Promise.all(
      memberships.map(async (m) => {
        const user = await ctx.db.get(m.userId);
        const accounts = await ctx.db
          .query("tenantAccounts")
          .withIndex("by_tenant_and_user", (q) => q.eq("tenantId", args.tenantId).eq("userId", m.userId))
          .collect();
        const kyc = await ctx.db
          .query("kycRecords")
          .withIndex("by_user", (q) => q.eq("userId", m.userId))
          .collect();
        const latestKyc = kyc.filter((k) => k.tenantId === args.tenantId).sort((a, b) => b.createdAt - a.createdAt)[0];
        const ledger = await ctx.db
          .query("tenantLedger")
          .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
          .collect();
        const userTransactions = ledger.filter((l) => l.userId === m.userId);

        return {
          _id: m._id,
          userId: m.userId,
          role: m.role,
          name: user?.name ?? null,
          email: user?.email ?? null,
          joinedAt: m.createdAt,
          accountCount: accounts.filter((a) => a.isActive).length,
          totalBalance: accounts.filter((a) => a.isActive).reduce((s, a) => s + a.balance, 0),
          kycStatus: latestKyc?.status ?? "not_submitted",
          transactionCount: userTransactions.length,
        };
      })
    );

    return results;
  },
});

/** Bank admin: get a specific customer's full details. */
export const adminGetCustomer = query({
  args: { tenantId: v.id("tenantSites"), userId: v.id("users") },
  handler: async (ctx, args) => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) return null;
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== adminId) return null;

    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    const accounts = await ctx.db
      .query("tenantAccounts")
      .withIndex("by_tenant_and_user", (q) => q.eq("tenantId", args.tenantId).eq("userId", args.userId))
      .collect();

    const ledger = await ctx.db
      .query("tenantLedger")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect()
      .then((rows) => rows.filter((r) => r.userId === args.userId).sort((a, b) => b.createdAt - a.createdAt));

    const kyc = await ctx.db
      .query("kycRecords")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect()
      .then((rows) => rows.filter((r) => r.tenantId === args.tenantId).sort((a, b) => b.createdAt - a.createdAt));

    return {
      user: { _id: user._id, name: user.name, email: user.email, createdAt: user.createdAt },
      accounts,
      transactions: ledger,
      kyc,
    };
  },
});

/** Bank admin: add customer by email. */
export const adminAddCustomer = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    email: v.string(),
    role: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Unauthorized");
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== ownerId) throw new Error("Not found");
    if (!tenant.isActive) throw new Error("Site is locked");

    const target = await ctx.db
      .query("users")
      .filter((q) => q.eq("email", args.email))
      .first();
    if (!target) throw new Error(`No user found with email ${args.email}`);

    const existing = await ctx.db
      .query("tenantUsers")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .collect();
    if (existing.some((r) => r.userId === target._id)) {
      throw new Error("User is already a member");
    }

    const now = Date.now();
    await ctx.db.insert("tenantUsers", {
      tenantId: args.tenantId,
      userId: target._id,
      role: args.role || "customer",
      createdAt: now,
    });

    await ctx.db.insert("notifications", {
      userId: target._id,
      title: `Welcome to ${tenant.siteName}`,
      message: `You have been added as a customer to ${tenant.siteName}. Log in to access your accounts.`,
      type: "business",
      isRead: false,
      link: `/site/${args.tenantId}`,
      createdAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: ownerId,
      action: "tenant_customer_added",
      resource: "tenantSite",
      resourceId: args.tenantId,
      after: { email: args.email, role: args.role || "customer" },
      createdAt: now,
    });

    return { success: true };
  },
});

/** Bank admin: remove customer. */
export const adminRemoveCustomer = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    membershipId: v.id("tenantUsers"),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Unauthorized");
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== ownerId) throw new Error("Not found");
    const membership = await ctx.db.get(args.membershipId);
    if (!membership || membership.tenantId !== args.tenantId) throw new Error("Membership not found");
    await ctx.db.delete(args.membershipId);
    return { success: true };
  },
});

/** Bank admin: review customer KYC. */
export const adminReviewCustomerKyc = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    kycId: v.id("kycRecords"),
    status: v.union(
      v.literal("approved"),
      v.literal("rejected"),
      v.literal("resubmission_required"),
      v.literal("under_review"),
    ),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const ownerId = await getAuthUserId(ctx);
    if (!ownerId) throw new Error("Unauthorized");
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== ownerId) throw new Error("Not found");
    const kyc = await ctx.db.get(args.kycId);
    if (!kyc || kyc.tenantId !== args.tenantId) throw new Error("KYC record not found");

    const now = Date.now();
    await ctx.db.patch(args.kycId, {
      status: args.status,
      notes: args.notes,
      reviewedBy: ownerId,
      reviewedAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("kycEvents", {
      kycId: args.kycId,
      actorId: ownerId,
      action: `kyc_${args.status}`,
      fromStatus: kyc.status,
      toStatus: args.status,
      reason: args.notes,
      createdAt: now,
    });

    await ctx.db.insert("notifications", {
      userId: kyc.userId,
      title: `KYC ${args.status.replace(/_/g, " ")}`,
      message: args.status === "approved"
        ? `Your identity verification at ${tenant.siteName} was approved.`
        : args.status === "rejected"
          ? `Your verification at ${tenant.siteName} was rejected: ${args.notes}`
          : `Additional information is required for your verification at ${tenant.siteName}.`,
      type: "business",
      isRead: false,
      link: `/site/${args.tenantId}`,
      createdAt: now,
    });

    return { success: true };
  },
});

/** Bank admin: list all transactions for the tenant. */
export const adminListTransactions = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== userId) return [];
    const ledger = await ctx.db
      .query("tenantLedger")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .order("desc")
      .take(200);
    const enriched = await Promise.all(
      ledger.map(async (l) => {
        const user = await ctx.db.get(l.userId);
        return { ...l, userName: user?.name ?? user?.email ?? "Unknown" };
      })
    );
    return enriched;
  },
});

/** Bank admin: list all KYC records for the tenant. */
export const adminListKycRecords = query({
  args: { tenantId: v.id("tenantSites") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== userId) return [];
    const records = await ctx.db
      .query("kycRecords")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .order("desc")
      .take(100);
    const enriched = await Promise.all(
      records.map(async (r) => {
        const user = await ctx.db.get(r.userId);
        return { ...r, userName: user?.name ?? user?.email ?? "Unknown" };
      })
    );
    return enriched;
  },
});

/** Bank admin: list deposits awaiting reconciliation (customer-initiated). */
export const adminListDeposits = query({
  args: { tenantId: v.id("tenantSites"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant || tenant.ownerId !== userId) return [];
    const rows = await ctx.db
      .query("bankingDeposits")
      .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId))
      .order("desc")
      .take(Math.min(args.limit ?? 100, 500));
    const enriched = await Promise.all(
      rows.map(async (d: any) => {
        const user: any = await ctx.db.get(d.userId);
        const account: any = d.accountId ? await ctx.db.get(d.accountId) : null;
        return {
          ...d,
          userName: user?.name ?? user?.email ?? "Unknown",
          accountName: account ? (account as any).name : null,
          accountNumber: account ? (account as any).accountNumber : null,
        };
      })
    );
    return enriched;
  },
});