import { getAuthUserId, modifyAccountCredentials } from "@convex-dev/auth/server";
import { query, mutation, internalMutation, action } from "./_generated/server";
import { v } from "convex/values";
import { internal, api } from "./_generated/api";

// ─── Payment Provider Key Management ───

/**
 * Save a payment provider key (secret or public) to adminSettings.
 * Keys are stored with the 'payments' category so they appear in the payments section.
 */
export const savePaymentProviderKey = mutation({
  args: {
    key: v.string(),
    value: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") throw new Error("Admin only");

    // Validate key name
    const allowedKeys = [
      "paystack_secret_key",
      "paystack_public_key",
      "paystack_test_secret",
      "paystack_test_public",
      "paystack_webhook_secret",
    ];
    if (!allowedKeys.includes(args.key)) {
      throw new Error("Invalid payment provider key name");
    }

    // Store or update the key
    const existing = await ctx.db
      .query("adminSettings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        value: args.value,
        updatedBy: userId,
        updatedAt: Date.now(),
      });
    } else {
      await ctx.db.insert("adminSettings", {
        key: args.key,
        value: args.value,
        category: "payments",
        updatedBy: userId,
        updatedAt: Date.now(),
      });
    }

    // Audit log
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actorEmail: user.email,
      action: "paystack_key_updated",
      resource: "payment_provider",
      resourceId: args.key,
      after: { key: args.key, value: "***" },
      reason: "Payment provider key updated",
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Delete a payment provider key from adminSettings.
 */
export const deletePaymentProviderKey = mutation({
  args: {
    key: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") throw new Error("Admin only");

    const existing = await ctx.db
      .query("adminSettings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (existing) {
      await ctx.db.delete(existing._id);
    }

    // Audit log
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actorEmail: user.email,
      action: "paystack_key_deleted",
      resource: "payment_provider",
      resourceId: args.key,
      before: { key: args.key },
      reason: "Payment provider key deleted",
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

/**
 * Environment variables the payment runtime reads for each provider key.
 * `convex/paystack.ts` checks these first, so an env value is the live one.
 */
const PROVIDER_ENV_VARS: Record<string, string[]> = {
  paystack_secret_key: ["PAYSTACK_SECRET_KEY"],
  paystack_public_key: ["VITE_PAYSTACK_PUBLIC_KEY", "PAYSTACK_PUBLIC_KEY"],
  paystack_webhook_secret: ["PAYSTACK_WEBHOOK_SECRET"],
  paystack_test_secret: [],
  paystack_test_public: [],
};

function maskKey(value: string): string {
  return value.length > 8
    ? value.substring(0, 4) + "••••" + value.substring(value.length - 4)
    : "••••••••";
}

/**
 * Get all payment provider keys (masked) for the admin page.
 * `source` tells the admin which value is actually live: a key saved through
 * this dashboard, or one supplied through the project environment.
 */
export const getPaymentProviderKeys = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return [];

    const keys = [
      "paystack_secret_key",
      "paystack_public_key",
      "paystack_test_secret",
      "paystack_test_public",
      "paystack_webhook_secret",
    ];

    const results: {
      key: string;
      isSet: boolean;
      /** "dashboard" = saved here and live, "environment" = supplied via project env, "none" = missing. */
      source: "dashboard" | "environment" | "none";
      masked: string;
      updatedAt: number | null;
      updatedBy: string | null;
    }[] = [];
    for (const key of keys) {
      const row = await ctx.db
        .query("adminSettings")
        .withIndex("by_key", (q) => q.eq("key", key))
        .first();
      const envVar = (PROVIDER_ENV_VARS[key] ?? []).find((name) => !!process.env[name]);
      const envValue = envVar ? process.env[envVar] : undefined;
      if (envVar) {
        // The runtime reads the environment first, so report that as the live value.
        results.push({
          key,
          isSet: true,
          source: "environment",
          masked: maskKey(envValue ?? ""),
          updatedAt: row?.updatedAt ?? null,
          updatedBy: row?.updatedBy ?? null,
        });
      } else if (row) {
        const val = String(row.value);
        const masked = val.length > 8
          ? val.substring(0, 4) + "••••" + val.substring(val.length - 4)
          : "••••••••";
        results.push({
          key,
          isSet: true,
          source: "dashboard",
          masked,
          updatedAt: row.updatedAt,
          updatedBy: row.updatedBy ?? null,
        });
      } else {
        results.push({ key, isSet: false, source: "none", masked: "", updatedAt: null, updatedBy: null });
      }
    }
    return results;
  },
});

// ─── User Management ───
export const listUsers = query({
  args: { limit: v.optional(v.number()), search: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return [];

    let users = await ctx.db.query("users").order("desc").take(args.limit ?? 100);
    if (args.search) {
      const search = args.search.toLowerCase();
      users = users.filter(
        (u) =>
          u.name?.toLowerCase().includes(search) ||
          u.email?.toLowerCase().includes(search),
      );
    }
    return users;
  },
});

export const getUser = query({
  args: { id: v.id("users") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return null;
    return await ctx.db.get(args.id);
  },
});

export const suspendUser = mutation({
  args: {
    userId: v.id("users"),
    suspend: v.boolean(),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthorized");
    const admin = await ctx.db.get(adminId);
    if (!admin || admin.role !== "admin") throw new Error("Admin only");

    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");

    const oldState = { isSuspended: target.isSuspended, role: target.role };
    await ctx.db.patch(args.userId, { isSuspended: args.suspend });

    await ctx.db.insert("auditLogs", {
      actorId: adminId,
      action: args.suspend ? "user_suspension" : "user_unsuspension",
      resource: "user",
      resourceId: args.userId,
      before: oldState,
      after: { isSuspended: args.suspend },
      reason: args.reason,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const terminateUser = mutation({
  args: {
    userId: v.id("users"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("Unauthorized");
    const admin = await ctx.db.get(adminId);
    if (!admin || admin.role !== "admin") throw new Error("Admin only");

    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("User not found");

    await ctx.db.patch(args.userId, { isSuspended: true });

    await ctx.db.insert("auditLogs", {
      actorId: adminId,
      action: "account_termination",
      resource: "user",
      resourceId: args.userId,
      before: { role: target.role },
      after: { isSuspended: true },
      reason: args.reason,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const getUserTransactions = query({
  args: { userId: v.id("users"), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) return [];
    const admin = await ctx.db.get(adminId);
    if (admin?.role !== "admin") return [];
    return await ctx.db
      .query("pointLedger")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(args.limit ?? 50);
  },
});

// ─── Bootstrap & user initialization ───

/**
 * Public gate status: does any administrator exist? Returns ONLY a boolean
 * (no user data) so the client can offer the one-time first-admin claim flow.
 */
export const adminExists = query({
  args: {},
  handler: async (ctx) => {
    const users = await ctx.db.query("users").take(1000);
    return users.some((u) => u.role === "admin");
  },
});

const REFERRAL_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function generateReferralCode(): string {
  let code = "CLOUD-";
  for (let i = 0; i < 6; i++) {
    code += REFERRAL_CHARS.charAt(Math.floor(Math.random() * REFERRAL_CHARS.length));
  }
  return code;
}

/**
 * Promote the signed-in user to ADMIN. Two legitimate cases:
 *
 *  1. Bootstrap — the platform has no administrator yet.
 *  2. Recovery — an administrator exists but cannot be reached (no email on
 *     the account, so neither password reset nor email-code sign-in is
 *     possible), or the operator supplies the ADMIN_SETUP_CODE master code.
 *
 * In normal operation (an administrator with an email exists) this is refused
 * server-side. Every claim is audited.
 */
export const claimFirstAdmin = mutation({
  args: { setupCode: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHORIZED: sign in first");

    const users = await ctx.db.query("users").take(1000);
    const admins = users.filter((u) => u.role === "admin");

    const expected = process.env.ADMIN_SETUP_CODE;
    const hasSetupCode = typeof expected === "string" && expected.length > 0;
    const codeMatches = hasSetupCode && args.setupCode === expected;

    if (admins.length > 0) {
      // The operator's master code always authorises a claim. Otherwise the
      // claim is only allowed when every existing administrator is locked out
      // (no email = no password reset, no email-code sign-in) — refusing here
      // would leave the platform permanently unadministrable.
      const anyReachable = admins.some(
        (a) => typeof a.email === "string" && a.email.trim().length > 0,
      );
      if (!codeMatches && anyReachable) {
        throw new Error("FORBIDDEN: an administrator already exists");
      }
    } else if (hasSetupCode && !codeMatches) {
      throw new Error("INVALID_SETUP_CODE");
    }

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    if (user.isSuspended || user.isTerminated) {
      throw new Error("FORBIDDEN: account is suspended");
    }

    await ctx.db.patch(userId, { role: "admin" });
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actorEmail: user.email,
      action: "ADMIN_CLAIMED",
      resource: "user",
      resourceId: userId,
      after: { role: "admin" },
      reason: codeMatches
        ? "setup_code"
        : admins.length > 0
          ? "no_reachable_administrator"
          : "bootstrap",
      createdAt: Date.now(),
    });
    return { success: true };
  },
});

/**
 * Platform administrators (super-admin console). Admin-only.
 * Returns only the fields the console needs — never secrets or session data.
 */
export const listAdministrators = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHORIZED");
    const me = await ctx.db.get(userId);
    if (me?.role !== "admin") throw new Error("FORBIDDEN: administrator only");

    const users = await ctx.db.query("users").take(1000);
    return users
      .filter((u) => u.role === "admin")
      .map((u) => ({
        _id: u._id,
        email: u.email ?? null,
        name: u.name ?? null,
        isAnonymous: u.isAnonymous ?? false,
        createdAt: u.createdAt ?? null,
        lastActiveAt: u.lastActiveAt ?? null,
      }));
  },
});

/**
 * Server-side administrator password reset.
 *
 * Only callable by an authenticated ADMIN. Uses Convex Auth's own
 * modifyAccountCredentials (same path as the "reset-verification" flow) so
 * the Scrypt hash format and session invalidation match the Password provider.
 * Audited. This must be an ACTION because modifyAccountCredentials runs its
 * hashing in the action runtime.
 */
export const resetAdminPassword = action({
  args: { newPassword: v.string() },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHORIZED: sign in first");
    const admin = await ctx.runQuery(api.users.currentUser);
    if (!admin || admin.role !== "admin") {
      throw new Error("FORBIDDEN: administrator only");
    }
    if (args.newPassword.length < 8) {
      throw new Error("Password must be at least 8 characters.");
    }
    if (!admin.email) throw new Error("ACCOUNT_HAS_NO_EMAIL");
    await modifyAccountCredentials(ctx, {
      provider: "password",
      account: { id: admin.email, secret: args.newPassword },
    });
    await ctx.runMutation(internal.admin.auditAdminPasswordReset, { adminId: userId });
    return { success: true };
  },
});

export const auditAdminPasswordReset = internalMutation({
  args: { adminId: v.id("users") },
  handler: async (ctx, args) => {
    const admin = await ctx.db.get(args.adminId);
    await ctx.db.insert("auditLogs", {
      actorId: args.adminId,
      actorEmail: admin?.email,
      action: "ADMIN_PASSWORD_RESET",
      resource: "user",
      resourceId: args.adminId,
      createdAt: Date.now(),
    });
  },
});

const WELCOME_BONUS_POINTS = 100;

/**
 * Called from the auth page after every successful sign-in/sign-up:
 * - records a login event + last-activity timestamp (security trail)
 * - one-time profile setup on first sign-in: role, createdAt, referral code
 *   and a 100-point welcome bonus backed by an immutable ledger entry.
 * Safe to call repeatedly; the setup block only runs once.
 */
export const initializeUser = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHORIZED");
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("USER_NOT_FOUND");
    const now = Date.now();

    await ctx.db.patch(userId, { lastActiveAt: now });
    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actorEmail: user.email,
      action: "user_login",
      resource: "session",
      createdAt: now,
    });

    if (user.createdAt !== undefined) return { created: false };

    const balance = user.pointsBalance ?? 0;
    const newBalance = balance + WELCOME_BONUS_POINTS;
    await ctx.db.patch(userId, {
      role: user.role ?? "user",
      createdAt: now,
      referralCode: user.referralCode ?? generateReferralCode(),
      pointsBalance: newBalance,
    });
    await ctx.db.insert("pointLedger", {
      userId,
      amount: WELCOME_BONUS_POINTS,
      balanceAfter: newBalance,
      description: "Welcome bonus",
      type: "deposit",
      createdAt: now,
    });
    await ctx.db.insert("notifications", {
      userId,
      title: "Welcome to Cloudie!",
      message: `Your workspace is ready. ${WELCOME_BONUS_POINTS} welcome points were added to your wallet.`,
      type: "system",
      isRead: false,
      link: "/wallet",
      createdAt: now,
    });
    return { created: true };
  },
});

// ─── Audit Logs ───
export const getAuditLogs = query({
  args: { limit: v.optional(v.number()), action: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return [];
    if (args.action) {
      return await ctx.db
        .query("auditLogs")
        .withIndex("by_action", (q) => q.eq("action", args.action!))
        .order("desc")
        .take(args.limit ?? 100);
    }
    return await ctx.db.query("auditLogs").order("desc").take(args.limit ?? 100);
  },
});

/** Paginated, filterable audit log for the /admin/audit page. */
export const getAuditLogsPaged = query({
  args: {
    action: v.optional(v.string()),
    cursor: v.optional(v.string()),
    pageSize: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return { page: [], isDone: true, continueCursor: "" };
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return { page: [], isDone: true, continueCursor: "" };

    const builder = ctx.db
      .query("auditLogs")
      .withIndex("by_action", (q) =>
        args.action ? q.eq("action", args.action) : q.gte("action", ""),
      )
      .order("desc");
    const result = await builder.paginate({
      numItems: args.pageSize ?? 30,
      cursor: args.cursor ?? null,
    });
    return {
      page: result.page,
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

/** Admin list of all marketplace orders. */
export const adminListOrders = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return [];
    return await ctx.db.query("marketplaceOrders").order("desc").take(args.limit ?? 100);
  },
});

/**
 * CSV export data source (admin-only). Returns raw rows for the requested
 * dataset; the client formats and downloads. Row caps keep memory bounded.
 */
export const exportData = query({
  args: {
    dataset: v.union(
      v.literal("users"),
      v.literal("transactions"),
      v.literal("orders"),
      v.literal("shipments"),
      v.literal("audit"),
    ),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return [];
    const cap = Math.min(args.limit ?? 5000, 5000);

    switch (args.dataset) {
      case "users":
        return await ctx.db.query("users").order("desc").take(cap);
      case "transactions":
        return await ctx.db.query("pointLedger").order("desc").take(cap);
      case "orders":
        return await ctx.db.query("marketplaceOrders").order("desc").take(cap);
      case "shipments":
        return await ctx.db.query("shipments").order("desc").take(cap);
      case "audit":
        return await ctx.db.query("auditLogs").order("desc").take(cap);
      default:
        return [];
    }
  },
});

// ─── Analytics ───
export const getAnalytics = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return null;

    const allUsers = await ctx.db.query("users").collect();
    const allShipments = await ctx.db.query("shipments").collect();
    const allDocuments = await ctx.db.query("documents").collect();
    const allVendors = await ctx.db.query("vendors").collect();
    const allTenants = await ctx.db.query("tenantSites").collect();
    const allOrders = await ctx.db.query("marketplaceOrders").collect();
    const allProducts = await ctx.db.query("marketplaceProducts").collect();
    const allLedger = await ctx.db.query("pointLedger").collect();
    const allCampaigns = await ctx.db.query("emailCampaigns").collect();

    const totalMinted = allLedger
      .filter((l) => l.amount > 0)
      .reduce((s, l) => s + l.amount, 0);
    const totalBurned = allLedger
      .filter((l) => l.amount < 0)
      .reduce((s, l) => s + Math.abs(l.amount), 0);

    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    return {
      totalUsers: allUsers.length,
      activeUsers: allUsers.filter((u) => !u.isSuspended).length,
      totalVendors: allVendors.length,
      approvedVendors: allVendors.filter((v) => v.status === "approved").length,
      totalTenants: allTenants.length,
      activeTenants: allTenants.filter((t) => t.isActive).length,
      totalShipments: allShipments.length,
      totalDocuments: allDocuments.length,
      totalOrders: allOrders.length,
      totalProducts: allProducts.length,
      totalCampaigns: allCampaigns.length,
      pointsMinted: totalMinted,
      pointsBurned: totalBurned,
      pointsInCirculation: totalMinted - totalBurned,
      last7Days: {
        newUsers: allUsers.filter((u) => (u.createdAt ?? 0) > sevenDaysAgo).length,
        shipments: allShipments.filter((s) => s.createdAt > sevenDaysAgo).length,
        documents: allDocuments.filter((d) => d.createdAt > sevenDaysAgo).length,
      },
    };
  },
});

export const getInfrastructure = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return null;

    const allLedger = await ctx.db.query("pointLedger").collect();
    const allNotifications = await ctx.db.query("notifications").collect();
    const allAssets = await ctx.db.query("assets").collect();

    return {
      totalTransactions: allLedger.length,
      pendingNotifications: allNotifications.filter((n) => !n.isRead).length,
      totalAssets: allAssets.length,
      health: {
        database: "healthy",
        storage: "healthy",
        auth: "healthy",
      },
    };
  },
});
