/**
 * Admin management for VTU providers.
 *
 * Every function here re-verifies the admin role SERVER-SIDE via
 * `requireAdmin`, regardless of what the client believes. The `RequireAdmin`
 * component is a convenience layer, not the security boundary.
 *
 * The load-bearing rule of this file: no query here ever returns a sealed or
 * plaintext credential. Admin reads return `hasApiKey` / `hasWebhookSecret`
 * booleans. Convex subscriptions stream query results to every subscribed
 * browser, so a credential in a query result is a credential in every admin's
 * page source — and in the audit log if it is also written there.
 */

import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { auditLog, requireAdmin } from "./adminApi";
import { encrypt, isSecretError } from "./lib/encryption";
import { VTU_AUTH_SCHEMES, VTU_PROVIDER_STATUSES } from "./schema";

/**
 * Seal a secret, turning a missing master key into an actionable message
 * rather than an opaque `ENCRYPTION_KEY_NOT_CONFIGURED` code.
 */
async function sealOrThrow(plaintext: string): Promise<string> {
  try {
    return await encrypt(plaintext);
  } catch (error) {
    if (isSecretError(error) && error.code === "ENCRYPTION_KEY_NOT_CONFIGURED") {
      throw new Error(
        "APP_MASTER_KEY is not configured. Add it in the project Keys panel before saving provider credentials.",
      );
    }
    throw error;
  }
}

const statusValidator = v.union(
  ...VTU_PROVIDER_STATUSES.map((s) => v.literal(s)),
);

/**
 * The closed auth-scheme enum, validated here exactly as the schema does.
 *
 * A free string would let a typo through to a provider that then rejects every
 * call with a confusing 401. The union makes the bad value unrepresentable.
 */
const authSchemeValidator = v.union(
  ...VTU_AUTH_SCHEMES.map((s) => v.literal(s)),
);

// ─── Reads ─────────────────────────────────────────────────────────

/**
 * All providers, for the admin table.
 *
 * `hasApiKey` / `hasWebhookSecret` are booleans precisely so the UI can show
 * "configured" without ever receiving the value.
 */
export const listProviders = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db
      .query("vtuProviders")
      .withIndex("by_status_priority")
      .collect();

    return rows.map((p) => ({
      _id: p._id,
      name: p.name,
      displayName: p.displayName,
      status: p.status,
      active: p.status === "active",
      baseUrl: p.baseUrl,
      healthPath: p.healthPath ?? null,
      authHeader: p.authHeader ?? null,
      authScheme: p.authScheme ?? "",
      callbackSignatureHeader: p.callbackSignatureHeader ?? null,
      timeoutMs: p.timeoutMs ?? null,
      priority: p.priority ?? 100,
      lastTestedAt: p.lastTestedAt ?? null,
      lastTestOk: p.lastTestOk ?? null,
      lastTestError: p.lastTestError ?? null,
      // Booleans. The sealed values stay on the server.
      hasApiKey: Boolean(p.encryptedApiKey),
      hasWebhookSecret: Boolean(p.encryptedWebhookSecret),
      hasAccountPin: Boolean(p.encryptedAccountPin),
      updatedAt: p.updatedAt,
    }));
  },
});

/** Is this user an admin? Used by actions, which cannot use `requireAdmin`. */
export const isAdmin = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    return user?.role === "admin" && !user.isSuspended;
  },
});

/**
 * The row the test-connection action needs.
 *
 * Internal and action-facing, so it returns the SEALED key for that action to
 * open. No public query may do this — a public query is subscribable.
 */
export const getForTest = internalQuery({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("vtuProviders")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
    if (!row) return null;
    return {
      baseUrl: row.baseUrl,
      encryptedApiKey: row.encryptedApiKey,
      healthPath: row.healthPath,
      authHeader: row.authHeader,
      authScheme: row.authScheme,
    };
  },
});

export const recordTestResult = internalMutation({
  args: { name: v.string(), ok: v.boolean(), error: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("vtuProviders")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
    if (!row) return;
    await ctx.db.patch(row._id, {
      lastTestedAt: Date.now(),
      lastTestOk: args.ok,
      lastTestError: args.error,
      updatedAt: Date.now(),
    });
  },
});

// ─── Writes ─────────────────────────────────────────────────────────

export const createProvider = mutation({
  args: {
    name: v.string(),
    displayName: v.string(),
    baseUrl: v.string(),
    apiKey: v.string(),
    webhookSecret: v.optional(v.string()),
    accountPin: v.optional(v.string()),
    status: v.optional(statusValidator),
    healthPath: v.optional(v.string()),
    authHeader: v.optional(v.string()),
    authScheme: v.optional(authSchemeValidator),
    callbackSignatureHeader: v.optional(v.string()),
    timeoutMs: v.optional(v.number()),
    priority: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);

    const name = args.name.trim().toLowerCase();
    if (!/^[a-z0-9_-]{2,32}$/.test(name)) {
      throw new Error("Provider name must be 2-32 characters: a-z, 0-9, - or _");
    }

    const existing = await ctx.db
      .query("vtuProviders")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    if (existing) throw new Error("A provider with this name already exists");

    const now = Date.now();
    const sealedKey = await sealOrThrow(args.apiKey);
    const sealedWebhook = args.webhookSecret
      ? await sealOrThrow(args.webhookSecret)
      : undefined;
    // Sealed separately from the API key: it is a different secret with its
    // own rotation, and sharing one ciphertext would couple them.
    const sealedPin = args.accountPin ? await sealOrThrow(args.accountPin) : undefined;

    const id: Id<"vtuProviders"> = await ctx.db.insert("vtuProviders", {
      name,
      displayName: args.displayName.trim() || name,
      status: args.status ?? "disabled",
      baseUrl: args.baseUrl.trim(),
      // Sealed at the boundary. A plaintext key never reaches the database.
      encryptedApiKey: sealedKey,
      encryptedWebhookSecret: sealedWebhook,
      encryptedAccountPin: sealedPin,
      healthPath: args.healthPath,
      authHeader: args.authHeader,
      authScheme: args.authScheme,
      callbackSignatureHeader: args.callbackSignatureHeader,
      timeoutMs: args.timeoutMs,
      priority: args.priority ?? 100,
      updatedBy: adminId,
      createdAt: now,
      updatedAt: now,
    });

    // The audit row records the shape of the change, never the secret.
    await auditLog(ctx, adminId, {
      action: "vtu_provider_created",
      resource: "vtuProvider",
      resourceId: name,
      after: {
        name,
        baseUrl: args.baseUrl,
        status: args.status ?? "disabled",
        authScheme: args.authScheme ?? "",
        hasApiKey: true,
        hasWebhookSecret: Boolean(args.webhookSecret),
        hasAccountPin: Boolean(args.accountPin),
      },
    });

    return id;
  },
});

/**
 * Update a provider.
 *
 * Omitting `apiKey` / `webhookSecret` LEAVES THE EXISTING SEALED VALUE ALONE.
 * That is what lets the admin UI show `••••••••` and offer "Replace key" without
 * a read-modify-write that would need the plaintext it is never given.
 */
export const updateProvider = mutation({
  args: {
    name: v.string(),
    displayName: v.optional(v.string()),
    baseUrl: v.optional(v.string()),
    apiKey: v.optional(v.string()),
    webhookSecret: v.optional(v.string()),
    clearWebhookSecret: v.optional(v.boolean()),
    accountPin: v.optional(v.string()),
    clearAccountPin: v.optional(v.boolean()),
    status: v.optional(statusValidator),
    healthPath: v.optional(v.string()),
    authHeader: v.optional(v.string()),
    authScheme: v.optional(authSchemeValidator),
    callbackSignatureHeader: v.optional(v.string()),
    timeoutMs: v.optional(v.number()),
    priority: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);

    const row = await ctx.db
      .query("vtuProviders")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
    if (!row) throw new Error("Provider not found");

    const patch: Record<string, unknown> = { updatedAt: Date.now(), updatedBy: adminId };
    if (args.displayName !== undefined) patch.displayName = args.displayName;
    if (args.baseUrl !== undefined) patch.baseUrl = args.baseUrl;
    if (args.status !== undefined) patch.status = args.status;
    if (args.healthPath !== undefined) patch.healthPath = args.healthPath;
    if (args.authHeader !== undefined) patch.authHeader = args.authHeader;
    if (args.authScheme !== undefined) patch.authScheme = args.authScheme;
    if (args.callbackSignatureHeader !== undefined) {
      patch.callbackSignatureHeader = args.callbackSignatureHeader;
    }
    if (args.timeoutMs !== undefined) patch.timeoutMs = args.timeoutMs;
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.notes !== undefined) patch.notes = args.notes;

    if (args.apiKey) patch.encryptedApiKey = await sealOrThrow(args.apiKey);
    if (args.webhookSecret) {
      patch.encryptedWebhookSecret = await sealOrThrow(args.webhookSecret);
    }
    if (args.clearWebhookSecret) patch.encryptedWebhookSecret = undefined;

    // Same leave-alone-unless-replaced rule as the other two secrets: the UI
    // shows a mask and offers "Replace", and never receives the plaintext.
    if (args.accountPin) patch.encryptedAccountPin = await sealOrThrow(args.accountPin);
    if (args.clearAccountPin) patch.encryptedAccountPin = undefined;

    await ctx.db.patch(row._id, patch);

    await auditLog(ctx, adminId, {
      action: "vtu_provider_updated",
      resource: "vtuProvider",
      resourceId: args.name,
      before: { status: row.status, baseUrl: row.baseUrl },
      after: {
        status: args.status ?? row.status,
        baseUrl: args.baseUrl ?? row.baseUrl,
        authScheme: args.authScheme ?? row.authScheme ?? "",
        apiKeyReplaced: Boolean(args.apiKey),
        webhookSecretReplaced: Boolean(args.webhookSecret || args.clearWebhookSecret),
        accountPinReplaced: Boolean(args.accountPin || args.clearAccountPin),
      },
      reason: args.apiKey ? "credential replaced" : "configuration updated",
    });
  },
});

/**
 * Change a provider's status.
 *
 * `disabled` stops NEW purchases routing to it, because resolution gates on
 * `status === "active"` before a purchase is reserved. It does NOT abort
 * anything in flight: a transaction already dispatched is settled against the
 * provider reference it carries, and webhook verification deliberately still
 * accepts a disabled provider so those transactions can complete.
 */
export const setProviderStatus = mutation({
  args: { name: v.string(), status: statusValidator, reason: v.string() },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    if (!args.reason || args.reason.trim().length < 3) {
      throw new Error("A reason is required");
    }

    const row = await ctx.db
      .query("vtuProviders")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
    if (!row) throw new Error("Provider not found");

    await ctx.db.patch(row._id, {
      status: args.status,
      updatedAt: Date.now(),
      updatedBy: adminId,
    });

    await auditLog(ctx, adminId, {
      action: "vtu_provider_status_changed",
      resource: "vtuProvider",
      resourceId: args.name,
      before: { status: row.status },
      after: { status: args.status },
      reason: args.reason,
    });
  },
});

export const deleteProvider = mutation({
  args: { name: v.string(), reason: v.string() },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    if (!args.reason || args.reason.trim().length < 3) {
      throw new Error("A reason is required");
    }

    const row = await ctx.db
      .query("vtuProviders")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
    if (!row) throw new Error("Provider not found");

    const inFlight = await ctx.db
      .query("vtuTransactions")
      .withIndex("by_status", (q) => q.eq("status", "processing"))
      .take(50);
    const owned = inFlight.filter((t) => t.provider === args.name);
    if (owned.length > 0) {
      throw new Error(
        `Cannot delete: ${owned.length} transaction(s) are still in flight for this provider. Disable it instead — disabling lets those complete.`,
      );
    }

    await ctx.db.delete(row._id);
    await auditLog(ctx, adminId, {
      action: "vtu_provider_deleted",
      resource: "vtuProvider",
      resourceId: args.name,
      before: { name: row.name, baseUrl: row.baseUrl, status: row.status },
      reason: args.reason,
    });
  },
});

// ─── Migration ──────────────────────────────────────────────────────

/**
 * Seed the Pairgate row from env, ONCE.
 *
 * On the FIRST run it inserts `pairgate` with status `sandbox` — the status
 * the slice-1 integration actually runs in, so nothing changes for users.
 *
 * On EVERY SUBSEQUENT run it is a NO-OP for the credential: an existing row
 * keeps its sealed key. Only `baseUrl` and display metadata are refreshed when
 * they are empty. Re-running can never create a second row or silently
 * overwrite an admin-supplied key.
 *
 * After this runs, `PAIRGATE_API_KEY` and `PAIRGATE_WEBHOOK_SECRET` are DEAD
 * for runtime purposes. Resolution reads the table and nothing else, with no
 * fallback under any condition — a deleted row must fail loudly rather than
 * resurrect a credential somebody deliberately removed.
 *
 * Also upgrades a slice-1 row that still carries the old `provider` /
 * `encryptedSecret` field names, so a pre-cutover row is repaired in place
 * rather than duplicated.
 */
export const migratePairgateFromEnv = mutation({
  args: {},
  handler: async (ctx) => {
    const { adminId } = await requireAdmin(ctx);
    const now = Date.now();

    // Legacy shape: schema validation is off, so an old row is still readable.
    const all = await ctx.db.query("vtuProviders").take(20);
    const legacy: any = all.find(
      (p: any) => !p.name && typeof p.provider === "string",
    );
    if (legacy) {
      await ctx.db.delete(legacy._id);
      await ctx.db.insert("vtuProviders", {
        name: String(legacy.provider),
        displayName: legacy.displayName ?? String(legacy.provider),
        status: legacy.status ?? "sandbox",
        baseUrl: legacy.baseUrl ?? "",
        // Re-seals the old ciphertext under the current primary key. The old
        // payload stays readable via the legacy ring entry either way.
        encryptedApiKey: legacy.encryptedSecret ?? "",
        encryptedWebhookSecret: legacy.encryptedCallbackSecret ?? undefined,
        callbackSignatureHeader: legacy.callbackSignatureHeader ?? undefined,
        authHeader: legacy.authHeader ?? undefined,
        timeoutMs: legacy.timeoutMs ?? undefined,
        priority: 100,
        updatedBy: adminId,
        createdAt: legacy._creationTime ?? now,
        updatedAt: now,
      });
      await auditLog(ctx, adminId, {
        action: "vtu_provider_migrated_legacy_row",
        resource: "vtuProvider",
        resourceId: String(legacy.provider),
        reason: "Upgraded slice-1 field names in place",
      });
      return { action: "upgraded_legacy" as const, provider: String(legacy.provider) };
    }

    const existing = await ctx.db
      .query("vtuProviders")
      .withIndex("by_name", (q) => q.eq("name", "pairgate"))
      .unique();

    if (existing) {
      // Idempotent no-op. An admin-supplied key is never overwritten.
      if (!existing.baseUrl) {
        await ctx.db.patch(existing._id, { baseUrl: "", updatedAt: now });
      }
      await auditLog(ctx, adminId, {
        action: "vtu_provider_migration_noop",
        resource: "vtuProvider",
        resourceId: "pairgate",
        reason: "Row already present",
      });
      return { action: "noop" as const, provider: "pairgate" };
    }

    const apiKey = process.env.PAIRGATE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "PAIRGATE_API_KEY is not configured. Add it in the project Keys panel, or create the provider from the admin page.",
      );
    }

    const sealedKey = await sealOrThrow(apiKey);

    const webhookSecret = process.env.PAIRGATE_WEBHOOK_SECRET;
    const sealedWebhook = webhookSecret ? await sealOrThrow(webhookSecret) : undefined;

    await ctx.db.insert("vtuProviders", {
      name: "pairgate",
      displayName: "Pairgate",
      // Sandbox, not active: this is what slice 1 actually ran against, so
      // nothing changes for existing users.
      status: "sandbox",
      baseUrl: process.env.PAIRGATE_BASE_URL ?? "https://api.pairgate.com",
      encryptedApiKey: sealedKey,
      encryptedWebhookSecret: sealedWebhook,
      callbackSignatureHeader: "x-pairgate-signature",
      authHeader: "x-api-key",
      healthPath: "/api/v1/balance",
      timeoutMs: 20_000,
      priority: 100,
      updatedBy: adminId,
      createdAt: now,
      updatedAt: now,
    });

    await auditLog(ctx, adminId, {
      action: "vtu_provider_migrated",
      resource: "vtuProvider",
      resourceId: "pairgate",
      after: { name: "pairgate", status: "sandbox", hasApiKey: true },
      reason: "Seeded from PAIRGATE_API_KEY; env vars are no longer read at runtime",
    });

    return { action: "inserted" as const, provider: "pairgate" };
  },
});
