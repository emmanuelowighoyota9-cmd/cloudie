import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { auditLog, requireAdmin } from "./adminApi";
import { MASKED_SECRET, PROVIDER, envApiKeyName, maskEmail } from "./emailShared";

/**
 * Server-side store for the admin-managed transactional email provider
 * (Elastic Email).
 *
 * This module is data-only: no HTTP, no crypto, no provider calls. The Node
 * action layer (`email.ts`) does the encryption and talks to Elastic Email, then
 * writes results back through the internal mutations here.
 *
 * Security invariants enforced here:
 *  - The API key never leaves the server: no query in this file returns the
 *    encrypted payload, the plaintext, or any part of it.
 *  - Only ADMIN accounts may read settings or delivery logs.
 *  - Everything a user can see is the masked placeholder plus a source label.
 */

export const EMAIL_STATUSES = [
  "not_configured",
  "disabled",
  "unverified",
  "connected",
  "invalid_key",
  "sender_error",
  "provider_error",
] as const;
export type EmailStatus = (typeof EMAIL_STATUSES)[number];

async function loadSettingsDoc(ctx: QueryCtx) {
  return await ctx.db
    .query("emailSettings")
    .withIndex("by_provider", (q) => q.eq("provider", PROVIDER))
    .first();
}

/** Where the live API key comes from, and whether one exists at all. */
function keyStatus(doc: { apiKeyEncrypted?: string } | null) {
  const envVar = envApiKeyName();
  if (envVar) return { source: "environment" as const, configured: true, envVar };
  if (doc?.apiKeyEncrypted) return { source: "dashboard" as const, configured: true, envVar: null };
  return { source: "none" as const, configured: false, envVar: null };
}

// ─── Admin reads ────────────────────────────────────────────────────────────

/**
 * Safe settings payload for the Admin → Email Settings page.
 * Deliberately omits `apiKeyEncrypted` and any key material.
 */
export const getEmailSettings = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const doc = await loadSettingsDoc(ctx);
    const key = keyStatus(doc ?? null);
    const platformName = await ctx.db
      .query("adminSettings")
      .withIndex("by_key", (q) => q.eq("key", "platform_name"))
      .first();

    const enabled = doc?.enabled ?? false;
    // "Connected" is only ever claimed after a real server-side verification.
    const status: EmailStatus = !key.configured
      ? "not_configured"
      : !enabled
        ? "disabled"
        : ((doc?.status as EmailStatus | undefined) ?? "unverified");

    return {
      provider: PROVIDER,
      providerLabel: "Elastic Email",
      enabled,
      apiKeyConfigured: key.configured,
      apiKeySource: key.source,
      apiKeyEnvVar: key.envVar,
      /** Bullets only — never any part of the stored secret. */
      apiKeyMasked: key.configured ? MASKED_SECRET : "",
      fromEmail: doc?.fromEmail ?? "",
      fromName: doc?.fromName ?? "",
      replyToEmail: doc?.replyToEmail ?? "",
      testRecipient: doc?.testRecipient ?? "",
      platformName: (platformName?.value as string | undefined) ?? "Cloudie",
      status,
      statusMessage: doc?.statusMessage ?? null,
      lastVerifiedAt: doc?.lastVerifiedAt ?? null,
      lastTestAt: doc?.lastTestAt ?? null,
      lastTestStatus: doc?.lastTestStatus ?? null,
      lastTestRecipient: doc?.lastTestRecipient ? maskEmail(doc.lastTestRecipient) : null,
      lastTestMessage: doc?.lastTestMessage ?? null,
      lastError: doc?.lastError ?? null,
      lastErrorAt: doc?.lastErrorAt ?? null,
      updatedAt: doc?.updatedAt ?? null,
      encryptionKeySource: process.env.EMAIL_CREDENTIAL_ENCRYPTION_KEY || process.env.EMAIL_SETTINGS_ENCRYPTION_KEY ? "environment" : "auto",
    };
  },
});

/**
 * Recent email delivery attempts (provider-agnostic view of `emailMessages`).
 * Recipients are masked and no message bodies, tokens, or secrets are returned.
 */
export const listEmailLogs = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const limit = Math.min(Math.max(args.limit ?? 25, 1), 100);
    const rows = await ctx.db.query("emailMessages").withIndex("by_createdAt").order("desc").take(limit);
    return rows.map((m) => ({
      _id: m._id,
      recipient: maskEmail(m.to),
      emailType: m.templateKey ?? "transactional",
      status: m.status,
      provider: m.provider ?? PROVIDER,
      providerLabel: "Elastic Email",
      sentAt: m.sentAt ?? null,
      createdAt: m.createdAt,
      providerMessageId: m.providerMessageId ?? null,
      failureReason: m.lastError ?? null,
      attempts: m.attempts,
    }));
  },
});

/** Aggregate delivery health for the status panel. */
export const getEmailDeliveryStats = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("emailMessages").withIndex("by_createdAt").order("desc").take(500);
    return {
      total: rows.length,
      sent: rows.filter((r) => r.status === "sent").length,
      failed: rows.filter((r) => r.status === "failed").length,
      queued: rows.filter((r) => r.status === "queued" || r.status === "sending").length,
      bounced: rows.filter((r) => r.status === "bounced").length,
      blocked: rows.filter((r) => r.status === "blocked_unsubscribed").length,
    };
  },
});

// ─── Internal queries (server only) ─────────────────────────────────────────

/** Admin gate for actions, which cannot touch the database directly. */
export const getAdminUser = internalQuery({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;
    return { _id: user._id, email: user.email, name: user.name, role: user.role, isSuspended: user.isSuspended ?? false };
  },
});

export const getSystemSecret = internalQuery({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const row = await ctx.db
      .query("systemSecrets")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    return row?.value ?? null;
  },
});

/**
 * Everything the sender needs, plus the sealed API key. Internal-only: the
 * ciphertext is useless to a client and must not be exposed to one anyway.
 */
export const getConfigForSend = internalQuery({
  args: {},
  handler: async (ctx) => {
    const doc = await loadSettingsDoc(ctx);
    if (!doc) return null;
    const key = keyStatus(doc);
    const platformName = await ctx.db
      .query("adminSettings")
      .withIndex("by_key", (q) => q.eq("key", "platform_name"))
      .first();
    return {
      enabled: doc.enabled,
      apiKeyEncrypted: doc.apiKeyEncrypted ?? null,
      apiKeySource: key.source,
      fromEmail: doc.fromEmail,
      fromName: doc.fromName,
      replyToEmail: doc.replyToEmail ?? null,
      status: doc.status,
      platformName: (platformName?.value as string | undefined) ?? "Cloudie",
    };
  },
});

/** Cheap readiness probe used before charging for a paid email operation. */
export const getDispatchReadiness = internalQuery({
  args: {},
  handler: async (ctx) => {
    const doc = await loadSettingsDoc(ctx);
    const key = keyStatus(doc ?? null);
    const senderConfigured = !!(doc?.fromEmail ?? "").trim() && !!(doc?.fromName ?? "").trim();
    return {
      provider: PROVIDER,
      enabled: doc?.enabled ?? false,
      apiKeyConfigured: key.configured,
      apiKeySource: key.source,
      senderConfigured,
      ready: (doc?.enabled ?? false) && key.configured && senderConfigured,
      status: (doc?.status as string | undefined) ?? "not_configured",
      statusMessage: doc?.statusMessage ?? null,
    };
  },
});

/** Messages that are due for a delivery attempt (bounded batch). */
export const claimQueuedMessages = internalQuery({
  args: { limit: v.number() },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit, 1), 50);
    const now = Date.now();
    const queued = await ctx.db
      .query("emailMessages")
      .withIndex("by_status", (q) => q.eq("status", "queued"))
      .take(limit * 2);
    const due = queued.filter((m) => m.nextAttemptAt <= now).slice(0, limit);
    return due.map((m) => ({
      _id: m._id,
      to: m.to,
      subject: m.subject,
      html: m.htmlBody ?? null,
      text: m.textBody,
      fromName: m.fromName,
      templateKey: m.templateKey ?? null,
      campaignId: m.campaignId ?? null,
      attempts: m.attempts,
      maxAttempts: m.maxAttempts,
    }));
  },
});

// ─── Internal mutations (server only) ───────────────────────────────────────

/**
 * Store the auto-generated encryption secret exactly once. Idempotent: racing
 * callers all receive the same value, so a credential can never be sealed with a
 * key that was subsequently replaced.
 */
export const putSystemSecretIfAbsent = internalMutation({
  args: { name: v.string(), value: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("systemSecrets")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .first();
    if (existing) return { value: existing.value, created: false };
    await ctx.db.insert("systemSecrets", { name: args.name, value: args.value, createdAt: Date.now() });
    return { value: args.value, created: true };
  },
});

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

async function writeConfig(
  ctx: MutationCtx,
  adminId: Id<"users">,
  args: {
    enabled: boolean;
    fromEmail: string;
    fromName: string;
    replyToEmail?: string;
    testRecipient?: string;
    reason: string;
  },
) {
  const now = Date.now();
  const existing = await loadSettingsDoc(ctx);
  const fromEmail = args.fromEmail.trim();
  const fromName = args.fromName.trim();
  const replyToEmail = args.replyToEmail?.trim() || undefined;
  const testRecipient = args.testRecipient?.trim() || undefined;

  if (fromEmail && !EMAIL_RE.test(fromEmail)) throw new Error("INVALID_FROM_EMAIL: enter a valid sender email address");
  if (replyToEmail && !EMAIL_RE.test(replyToEmail)) throw new Error("INVALID_REPLY_TO: enter a valid reply-to address");
  if (testRecipient && !EMAIL_RE.test(testRecipient)) throw new Error("INVALID_TEST_RECIPIENT: enter a valid test recipient");
  if (args.enabled && (!fromEmail || !fromName)) {
    throw new Error("SENDER_REQUIRED: set the From email and From name before enabling transactional email");
  }

  const before = existing
    ? {
        enabled: existing.enabled,
        fromEmail: existing.fromEmail,
        fromName: existing.fromName,
        replyToEmail: existing.replyToEmail ?? null,
        testRecipient: existing.testRecipient ?? null,
      }
    : null;

  const patch = {
    enabled: args.enabled,
    fromEmail,
    fromName,
    replyToEmail,
    testRecipient,
    updatedBy: adminId,
    updatedAt: now,
  };

  let id: Id<"emailSettings">;
  if (existing) {
    await ctx.db.patch(existing._id, patch);
    id = existing._id;
  } else {
    id = await ctx.db.insert("emailSettings", {
      provider: PROVIDER,
      apiKeySource: "none",
      status: "not_configured",
      ...patch,
    });
  }

  await auditLog(ctx, adminId, {
    action: "EMAIL_SETTINGS_UPDATED",
    resource: "emailSettings",
    resourceId: id,
    before,
    after: {
      enabled: patch.enabled,
      fromEmail: patch.fromEmail,
      fromName: patch.fromName,
      replyToEmail: patch.replyToEmail ?? null,
      testRecipient: patch.testRecipient ?? null,
    },
    reason: args.reason,
  });
  return { id };
}

/**
 * Persist the sender configuration and the enable/disable flag. Admin-only and
 * validated server-side — the API key itself is handled separately by the
 * `email.saveApiKey` action so it is never part of a settings write.
 */
export const saveConfig = mutation({
  args: {
    enabled: v.boolean(),
    fromEmail: v.string(),
    fromName: v.string(),
    replyToEmail: v.optional(v.string()),
    testRecipient: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    return await writeConfig(ctx, adminId, { ...args, reason: "Sender configuration updated from the admin dashboard" });
  },
});

/** Persist a freshly sealed API key. Only the ciphertext + bullets are stored. */
export const saveApiKeyRow = internalMutation({
  args: {
    adminId: v.id("users"),
    apiKeyEncrypted: v.string(),
    replacedExisting: v.boolean(),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const existing = await loadSettingsDoc(ctx);
    const patch = {
      apiKeyEncrypted: args.apiKeyEncrypted,
      apiKeyMasked: MASKED_SECRET,
      apiKeySource: "dashboard",
      status: "unverified" as const,
      statusMessage: "API key saved. Run a test email to confirm delivery.",
      updatedBy: args.adminId,
      updatedAt: now,
    };
    let id;
    if (existing) {
      await ctx.db.patch(existing._id, patch);
      id = existing._id;
    } else {
      id = await ctx.db.insert("emailSettings", {
        provider: PROVIDER,
        enabled: false,
        fromEmail: "",
        fromName: "",
        ...patch,
      });
    }
    // Never record the key — only the fact that it changed.
    await auditLog(ctx, args.adminId, {
      action: args.replacedExisting ? "EMAIL_API_KEY_REPLACED" : "EMAIL_API_KEY_SET",
      resource: "emailSettings",
      resourceId: id,
      after: { masked: MASKED_SECRET, storedEncrypted: true },
      reason: "Elastic Email API key updated from the admin dashboard",
    });
    return { id };
  },
});

export const clearApiKeyRow = internalMutation({
  args: { adminId: v.id("users") },
  handler: async (ctx, args) => {
    const existing = await loadSettingsDoc(ctx);
    if (!existing) return { success: true };
    await ctx.db.patch(existing._id, {
      apiKeyEncrypted: undefined,
      apiKeyMasked: undefined,
      apiKeySource: "none",
      status: "not_configured",
      statusMessage: "API key removed.",
      lastVerifiedAt: undefined,
      updatedBy: args.adminId,
      updatedAt: Date.now(),
    });
    await auditLog(ctx, args.adminId, {
      action: "EMAIL_API_KEY_CLEARED",
      resource: "emailSettings",
      resourceId: existing._id,
      reason: "Elastic Email API key removed from the admin dashboard",
    });
    return { success: true };
  },
});

/** Record the outcome of a server-side connection check. */
export const recordVerification = internalMutation({
  args: {
    status: v.string(),
    statusMessage: v.optional(v.string()),
    lastError: v.optional(v.string()),
    verified: v.boolean(),
  },
  handler: async (ctx, args) => {
    const existing = await loadSettingsDoc(ctx);
    const now = Date.now();
    if (!existing) return { success: false };
    await ctx.db.patch(existing._id, {
      status: args.status,
      statusMessage: args.statusMessage,
      lastError: args.lastError,
      lastErrorAt: args.lastError ? now : existing.lastErrorAt,
      lastVerifiedAt: args.verified ? now : existing.lastVerifiedAt,
      updatedAt: now,
    });
    return { success: true };
  },
});

/** Record the outcome of an administrator-triggered test email. */
export const recordTest = internalMutation({
  args: {
    adminId: v.id("users"),
    success: v.boolean(),
    recipient: v.string(),
    message: v.string(),
  },
  handler: async (ctx, args) => {
    const existing = await loadSettingsDoc(ctx);
    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        lastTestAt: now,
        lastTestStatus: args.success ? "success" : "failed",
        lastTestRecipient: args.recipient,
        lastTestMessage: args.message,
        lastError: args.success ? undefined : args.message,
        lastErrorAt: args.success ? existing.lastErrorAt : now,
        lastVerifiedAt: args.success ? now : existing.lastVerifiedAt,
        status: args.success ? "connected" : existing.status === "connected" ? "connected" : existing.status,
        statusMessage: args.success ? "Last test email delivered successfully." : existing.statusMessage,
        updatedAt: now,
      });
    }
    await auditLog(ctx, args.adminId, {
      action: args.success ? "EMAIL_TEST_SENT" : "EMAIL_TEST_FAILED",
      resource: "emailSettings",
      resourceId: existing?._id,
      after: { recipient: maskEmail(args.recipient), delivered: args.success },
      reason: args.message,
    });
    return { success: true };
  },
});

/** Queue one outbound message for the centralized email service. */
export const enqueueMessage = internalMutation({
  args: {
    to: v.string(),
    fromName: v.string(),
    subject: v.string(),
    textBody: v.string(),
    htmlBody: v.optional(v.string()),
    templateKey: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    campaignId: v.optional(v.id("emailCampaigns")),
    jobId: v.optional(v.id("cloudieJobs")),
    maxAttempts: v.optional(v.number()),
    initialStatus: v.optional(v.union(v.literal("queued"), v.literal("blocked_unsubscribed"))),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const unsubscribed = await ctx.db
      .query("emailUnsubscribes")
      .withIndex("by_email", (q) => q.eq("email", args.to.trim().toLowerCase()))
      .first();
    const status = unsubscribed ? ("blocked_unsubscribed" as const) : (args.initialStatus ?? ("queued" as const));
    const id = await ctx.db.insert("emailMessages", {
      to: args.to,
      fromName: args.fromName,
      subject: args.subject,
      textBody: args.textBody,
      htmlBody: args.htmlBody,
      provider: PROVIDER,
      templateKey: args.templateKey,
      userId: args.userId,
      campaignId: args.campaignId,
      jobId: args.jobId,
      status,
      attempts: 0,
      maxAttempts: args.maxAttempts ?? 3,
      nextAttemptAt: now,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("emailDeliveryLogs", {
      messageId: id,
      event: status === "blocked_unsubscribed" ? "blocked_unsubscribed" : "queued",
      createdAt: now,
    });
    return { id, status };
  },
});

export const markMessageSending = internalMutation({
  args: { messageId: v.id("emailMessages") },
  handler: async (ctx, args) => {
    const now = Date.now();
    const message = await ctx.db.get(args.messageId);
    if (!message) return { success: false };
    await ctx.db.patch(args.messageId, {
      status: "sending",
      attempts: message.attempts + 1,
      updatedAt: now,
    });
    await ctx.db.insert("emailDeliveryLogs", { messageId: args.messageId, event: "send_attempt", createdAt: now });
    return { success: true, attempts: message.attempts + 1, maxAttempts: message.maxAttempts };
  },
});

export const markMessageSent = internalMutation({
  args: { messageId: v.id("emailMessages"), providerMessageId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const now = Date.now();
    const message = await ctx.db.get(args.messageId);
    if (!message) return { success: false };
    await ctx.db.patch(args.messageId, {
      status: "sent",
      sentAt: now,
      provider: PROVIDER,
      providerMessageId: args.providerMessageId,
      lastError: undefined,
      updatedAt: now,
    });
    await ctx.db.insert("emailDeliveryLogs", {
      messageId: args.messageId,
      event: "sent",
      detail: args.providerMessageId ? `provider message id: ${args.providerMessageId}` : undefined,
      createdAt: now,
    });
    if (message.campaignId) {
      await markDelivery(ctx, message.campaignId, message.to, "sent");
    }
    return { success: true };
  },
});

export const markMessageFailed = internalMutation({
  args: {
    messageId: v.id("emailMessages"),
    error: v.string(),
    retryInMs: v.optional(v.number()),
    terminal: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const message = await ctx.db.get(args.messageId);
    if (!message) return { success: false };
    const exhausted = args.terminal === true || message.attempts >= message.maxAttempts;
    await ctx.db.patch(args.messageId, {
      status: exhausted ? "failed" : "queued",
      lastError: args.error,
      nextAttemptAt: exhausted ? message.nextAttemptAt : now + (args.retryInMs ?? 60_000),
      updatedAt: now,
    });
    await ctx.db.insert("emailDeliveryLogs", {
      messageId: args.messageId,
      event: "failed",
      detail: args.error.slice(0, 500),
      createdAt: now,
    });
    if (exhausted && message.campaignId) {
      await markDelivery(ctx, message.campaignId, message.to, "failed");
    }
    return { success: true, exhausted };
  },
});

/** Mark a queued message as a hard bounce reported by the provider. */
export const markMessageBounced = internalMutation({
  args: { messageId: v.id("emailMessages"), detail: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const message = await ctx.db.get(args.messageId);
    if (!message) return { success: false };
    await ctx.db.patch(args.messageId, { status: "bounced", lastError: args.detail, updatedAt: now });
    await ctx.db.insert("emailDeliveryLogs", { messageId: args.messageId, event: "bounced", detail: args.detail.slice(0, 500), createdAt: now });
    return { success: true };
  },
});

/** Keep campaign delivery rows in sync with the provider outcome. */
async function markDelivery(
  ctx: MutationCtx,
  campaignId: Id<"emailCampaigns">,
  recipient: string,
  status: string,
) {
  const rows = await ctx.db
    .query("emailDeliveries")
    .withIndex("by_campaign", (q) => q.eq("campaignId", campaignId))
    .take(500);
  const match = rows.find((r) => r.recipientEmail.toLowerCase() === recipient.trim().toLowerCase());
  if (!match) return;
  await ctx.db.patch(match._id, {
    status: status === "sent" ? "sent" : status,
    sentAt: status === "sent" ? Date.now() : match.sentAt,
  });
}

/** Close out a campaign once nothing is left in flight. */
export const finalizeCampaign = internalMutation({
  args: { campaignId: v.id("emailCampaigns") },
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("emailMessages")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .take(500);
    if (messages.length === 0) return { pending: 0, failed: 0 };
    const pending = messages.filter((m) => m.status === "queued" || m.status === "sending").length;
    if (pending > 0) return { pending };
    const failed = messages.filter((m) => m.status === "failed" || m.status === "bounced").length;
    await ctx.db.patch(args.campaignId, {
      status: failed > 0 && failed === messages.length ? "failed" : "sent",
      sentAt: Date.now(),
    });
    return { pending: 0, failed };
  },
});

/**
 * Mark a campaign as failed without dispatching (provider unavailable/disabled).
 * The campaign is left visibly failed instead of silently reporting success.
 */
export const failCampaign = internalMutation({
  args: { campaignId: v.id("emailCampaigns"), reason: v.string() },
  handler: async (ctx, args) => {
    const now = Date.now();
    const deliveries = await ctx.db
      .query("emailDeliveries")
      .withIndex("by_campaign", (q) => q.eq("campaignId", args.campaignId))
      .take(500);
    for (const row of deliveries) {
      if (row.status === "pending") await ctx.db.patch(row._id, { status: "failed" });
    }
    await ctx.db.patch(args.campaignId, { status: "failed", sentAt: now });
    return { failed: deliveries.length };
  },
});
