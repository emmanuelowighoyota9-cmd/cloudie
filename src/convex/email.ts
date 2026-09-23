"use node";

import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { decryptSecret, encryptSecret, generateEncryptionSecret } from "./emailCrypto";
import { AUTO_KEY_NAME, envApiKey, envEncryptionKey } from "./emailShared";
import { renderTemplate, sanitizeHtml, type EmailTemplateKey } from "./emailRender";

/**
 * ─── Elastic Email provider layer ───────────────────────────────────────────
 *
 * The single server-side gateway that talks to Elastic Email. Every other part
 * of the platform sends mail by handing a message to this layer, so provider
 * credentials, retries, logging and authorization live in exactly one place.
 *
 *   Application → email service (this file) → load admin config → decrypt key
 *   → Elastic Email API → recipient
 *
 * The API key is decrypted here, in memory, for the duration of a request. It is
 * never returned to a client, never audited, and never written to a log.
 */

const API_BASE = "https://api.elasticemail.com/v4";
const REQUEST_TIMEOUT_MS = 15_000;

type MessageId = Id<"emailMessages">;
type CampaignId = Id<"emailCampaigns">;
type QueueResult = { id: MessageId; status: string };
type FailResult = { success: boolean; exhausted: boolean };

type ProviderErrorKind = "invalid_key" | "sender_error" | "provider_error" | "network_error" | "scope_limited";
type ProviderOutcome<T> = { ok: true; data: T } | { ok: false; kind: ProviderErrorKind; status: number; message: string };

function timeoutSignal(): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    : undefined;
}

function maskEmailForDisplay(email: string): string {
  const trimmed = String(email ?? "").trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0) return "•••";
  return `${trimmed.slice(0, Math.min(2, at))}•••@${trimmed.slice(at + 1)}`;
}

function cleanProviderMessage(raw: string, apiKey?: string): string {
  let message = String(raw ?? "");
  // Belt and braces: a provider echo must never carry the credential forward.
  if (apiKey) message = message.split(apiKey).join("[redacted]");
  message = message.replace(/\b[A-Fa-f0-9]{40,}\b/g, "[redacted]");
  return message.slice(0, 400);
}

function classify(status: number, detail: string): Exclude<ProviderErrorKind, "network_error"> {
  const text = detail.toLowerCase();
  if (status === 401 || text.includes("api key") || text.includes("unauthorized") || text.includes("not authorized")) {
    return "invalid_key";
  }
  if (
    text.includes("sender") ||
    text.includes("from address") ||
    text.includes("domain") ||
    text.includes("verif") ||
    text.includes("not allowed to send")
  ) {
    return "sender_error";
  }
  if (status === 403) return "scope_limited";
  return "provider_error";
}

async function readError(res: Response, apiKey: string): Promise<string> {
  try {
    const text = await res.text();
    try {
      const parsed = JSON.parse(text) as Record<string, unknown>;
      const detail = parsed.detail ?? parsed.title ?? parsed.message ?? parsed.error;
      if (typeof detail === "string" && detail.trim()) return cleanProviderMessage(detail, apiKey);
    } catch {
      /* not JSON — fall through to the raw text */
    }
    return cleanProviderMessage(text, apiKey) || `HTTP ${res.status}`;
  } catch {
    return `HTTP ${res.status}`;
  }
}

/** Resolve the encryption secret, bootstrapping an auto-generated one if needed. */
async function resolveEncryptionSecret(ctx: ActionCtx): Promise<{ secret: string; source: "environment" | "auto" }> {
  const fromEnv = envEncryptionKey();
  if (fromEnv) return { secret: fromEnv, source: "environment" };

  const existing: string | null = await ctx.runQuery(internal.emailAdmin.getSystemSecret, { name: AUTO_KEY_NAME });
  if (existing) return { secret: existing, source: "auto" };

  const generated = generateEncryptionSecret();
  const stored: { value: string; created: boolean } = await ctx.runMutation(internal.emailAdmin.putSystemSecretIfAbsent, {
    name: AUTO_KEY_NAME,
    value: generated,
  });
  return { secret: stored.value, source: "auto" };
}

type SenderConfig = {
  apiKey: string | null;
  keySource: "dashboard" | "environment" | "none";
  fromEmail: string;
  fromName: string;
  replyToEmail: string | null;
  enabled: boolean;
  platformName: string;
  status: string;
};

/**
 * Load the sender configuration and the decrypted API key. The key is only ever
 * returned to callers inside this server runtime.
 */
async function loadSenderConfig(
  ctx: ActionCtx,
): Promise<{ config: SenderConfig } | { error: { code: string; message: string } }> {
  const row: {
    enabled: boolean;
    apiKeyEncrypted: string | null;
    apiKeySource: "dashboard" | "environment" | "none";
    fromEmail: string;
    fromName: string;
    replyToEmail: string | null;
    status: string;
    platformName: string;
  } | null = await ctx.runQuery(internal.emailAdmin.getConfigForSend, {});

  if (!row) return { error: { code: "NOT_CONFIGURED", message: "Elastic Email is not configured yet." } };

  const env = envApiKey();
  let apiKey: string | null = null;
  if (env) {
    apiKey = env.value;
  } else if (row.apiKeyEncrypted) {
    try {
      const { secret } = await resolveEncryptionSecret(ctx);
      apiKey = decryptSecret(row.apiKeyEncrypted, secret);
    } catch {
      return {
        error: {
          code: "CREDENTIAL_UNREADABLE",
          message:
            "The saved API key could not be decrypted. Replace it in the dashboard (keys are bound to the deployment encryption key).",
        },
      };
    }
  }

  return {
    config: {
      apiKey,
      keySource: env ? "environment" : apiKey ? "dashboard" : "none",
      fromEmail: row.fromEmail,
      fromName: row.fromName,
      replyToEmail: row.replyToEmail,
      enabled: row.enabled,
      platformName: row.platformName,
      status: row.status,
    },
  };
}

// ─── Provider calls ─────────────────────────────────────────────────────────

async function elasticSend(
  apiKey: string,
  message: { to: string; subject: string; html: string; text: string; fromEmail: string; fromName: string; replyTo: string | null },
): Promise<ProviderOutcome<{ messageId: string | null }>> {
  const payload = {
    Recipients: [{ Email: message.to }],
    Content: {
      From: `${message.fromName} <${message.fromEmail}>`,
      ReplyTo: message.replyTo ?? message.fromEmail,
      Subject: message.subject,
      Body: [
        { ContentType: "HTML", Charset: "utf-8", Content: message.html },
        { ContentType: "PlainText", Charset: "utf-8", Content: message.text },
      ],
    },
    Options: { TrackOpens: true, TrackClicks: false },
  };

  try {
    const res = await fetch(`${API_BASE}/emails`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        "X-ElasticEmail-ApiKey": apiKey,
      },
      body: JSON.stringify(payload),
      signal: timeoutSignal(),
    });
    if (!res.ok) {
      const detail = await readError(res, apiKey);
      return { ok: false, kind: classify(res.status, detail), status: res.status, message: detail };
    }
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const messageId = body.MessageID ?? body.messageID ?? body.TransactionID ?? body.transactionID;
    return { ok: true, data: { messageId: typeof messageId === "string" ? messageId : null } };
  } catch (e) {
    return {
      ok: false,
      kind: "network_error",
      status: 0,
      message: cleanProviderMessage(e instanceof Error ? e.message : String(e), apiKey),
    };
  }
}

type AccountProbe =
  | { ok: true; accountEmail: string | null; planName: string | null; credits: number | null }
  | { ok: false; status: number; kind: ProviderErrorKind; message: string };

async function elasticAccount(apiKey: string): Promise<AccountProbe> {
  try {
    const res = await fetch(`${API_BASE}/account`, {
      method: "GET",
      headers: { accept: "application/json", "X-ElasticEmail-ApiKey": apiKey },
      signal: timeoutSignal(),
    });
    if (res.status === 403) {
      return {
        ok: false,
        status: 403,
        kind: "scope_limited",
        message: "The API key does not include the Account scope, so it cannot be verified without sending a test email.",
      };
    }
    if (!res.ok) {
      const detail = await readError(res, apiKey);
      return { ok: false, status: res.status, kind: classify(res.status, detail), message: detail };
    }
    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const pick = (...keys: string[]) => {
      for (const key of keys) {
        const value = body[key];
        if (typeof value === "string" && value.trim()) return value;
        if (typeof value === "number") return String(value);
      }
      return null;
    };
    const creditsRaw = pick("emailCredits", "EmailCredits");
    return {
      ok: true,
      accountEmail: pick("email", "Email"),
      planName: pick("planName", "PlanName"),
      credits: creditsRaw === null ? null : Number(creditsRaw),
    };
  } catch (e) {
    return {
      ok: false,
      status: 0,
      kind: "network_error",
      message: cleanProviderMessage(e instanceof Error ? e.message : String(e), apiKey),
    };
  }
}

// ─── Authorization ──────────────────────────────────────────────────────────

async function requireAdminAction(ctx: ActionCtx) {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("UNAUTHORIZED: sign in first");
  const user: { _id: string; email?: string | null; role?: string | null; isSuspended: boolean } | null = await ctx.runQuery(
    internal.emailAdmin.getAdminUser,
    { userId },
  );
  if (!user || user.role !== "admin") throw new Error("FORBIDDEN: administrator only");
  if (user.isSuspended) throw new Error("FORBIDDEN: administrator account suspended");
  return { adminId: userId, email: user.email ?? null };
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}

/** Shared verification path: probe the provider and persist the outcome. */
async function verifyAndRecord(
  ctx: ActionCtx,
  config: SenderConfig,
): Promise<{ status: string; message: string }> {
  if (!config.apiKey) {
    await ctx.runMutation(internal.emailAdmin.recordVerification, {
      status: "not_configured",
      statusMessage: "Add your Elastic Email API key to enable transactional email.",
      verified: false,
    });
    return { status: "not_configured", message: "No API key is configured." };
  }

  const probe = await elasticAccount(config.apiKey);
  if (probe.ok) {
    const label = probe.accountEmail ? maskEmailForDisplay(probe.accountEmail) : "your Elastic Email account";
    await ctx.runMutation(internal.emailAdmin.recordVerification, {
      status: "connected",
      statusMessage: `Verified against ${label}${probe.planName ? ` (${probe.planName})` : ""}.`,
      verified: true,
    });
    return { status: "connected", message: `Connected to Elastic Email as ${label}.` };
  }

  if (probe.kind === "scope_limited") {
    await ctx.runMutation(internal.emailAdmin.recordVerification, {
      status: "unverified",
      statusMessage: probe.message,
      verified: false,
    });
    return { status: "unverified", message: probe.message };
  }

  await ctx.runMutation(internal.emailAdmin.recordVerification, {
    status: probe.kind === "invalid_key" ? "invalid_key" : probe.kind === "sender_error" ? "sender_error" : "provider_error",
    statusMessage: probe.message,
    lastError: probe.message,
    verified: false,
  });
  return { status: probe.kind, message: probe.message };
}

// ─── Admin actions ──────────────────────────────────────────────────────────

/** Validate and store a new API key (encrypted), then verify it server-side. */
export const saveApiKey = action({
  args: { apiKey: v.string() },
  handler: async (ctx, args) => {
    await requireAdminAction(ctx);
    const key = args.apiKey.trim();
    if (key.length < 16 || /\s/.test(key)) {
      throw new Error("INVALID_API_KEY: paste the full Elastic Email API key (no spaces)");
    }

    const { adminId } = await requireAdminAction(ctx);
    const { secret, source } = await resolveEncryptionSecret(ctx);
    const encrypted = encryptSecret(key, secret);
    const existing: { apiKeyEncrypted: string | null } | null = await ctx.runQuery(internal.emailAdmin.getConfigForSend, {});

    await ctx.runMutation(internal.emailAdmin.saveApiKeyRow, {
      adminId,
      apiKeyEncrypted: encrypted,
      replacedExisting: !!existing?.apiKeyEncrypted,
    });

    const loaded = await loadSenderConfig(ctx);
    if ("error" in loaded) return { success: true, status: "unverified", message: loaded.error.message, encryptionKeySource: source };
    const verification = await verifyAndRecord(ctx, loaded.config);
    return {
      success: true,
      status: verification.status,
      message:
        verification.status === "connected"
          ? `API key saved and verified. ${verification.message}`
          : `API key saved. ${verification.message}`,
      encryptionKeySource: source,
    };
  },
});

/** Remove the stored API key (does not touch a deployment-level env key). */
export const clearApiKey = action({
  args: {},
  handler: async (ctx) => {
    const { adminId } = await requireAdminAction(ctx);
    await ctx.runMutation(internal.emailAdmin.clearApiKeyRow, { adminId });
    return { success: true };
  },
});

/** Re-check the provider connection server-side and record the result. */
export const refreshEmailStatus = action({
  args: {},
  handler: async (ctx) => {
    await requireAdminAction(ctx);
    const loaded = await loadSenderConfig(ctx);
    if ("error" in loaded) {
      await ctx.runMutation(internal.emailAdmin.recordVerification, {
        status: "not_configured",
        statusMessage: loaded.error.message,
        verified: false,
      });
      return { status: "not_configured", message: loaded.error.message };
    }
    return await verifyAndRecord(ctx, loaded.config);
  },
});

/**
 * Send a real test email through Elastic Email, then record the outcome.
 * Requires the provider to be enabled — a disabled provider never attempts a
 * send, matching the enable/disable contract.
 */
export const sendTestEmail = action({
  args: { recipient: v.string() },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdminAction(ctx);
    const recipient = args.recipient.trim();
    if (!isValidEmail(recipient)) throw new Error("INVALID_RECIPIENT: provide a valid recipient email address");

    const loaded = await loadSenderConfig(ctx);
    if ("error" in loaded) return { success: false, status: "not_configured", message: loaded.error.message };
    const config = loaded.config;

    if (!config.apiKey) {
      return { success: false, status: "not_configured", message: "Add your Elastic Email API key first." };
    }
    if (!config.fromEmail.trim() || !config.fromName.trim()) {
      return { success: false, status: "sender_error", message: "Set the From email and From name before testing." };
    }
    if (!config.enabled) {
      return {
        success: false,
        status: "disabled",
        message: "Transactional email is disabled. Enable it (or use Save configuration with the toggle on) before sending a test.",
      };
    }

    const rendered = renderTemplate("test_email", { platformName: config.platformName, recipientName: config.fromName });

    const queued = (await ctx.runMutation(internal.emailAdmin.enqueueMessage, {
      to: recipient,
      fromName: config.fromName,
      subject: rendered.subject,
      textBody: rendered.text,
      htmlBody: rendered.html,
      templateKey: "test_email",
      maxAttempts: 1,
      initialStatus: "queued",
    })) as QueueResult;

    if (queued.status === "blocked_unsubscribed") {
      await ctx.runMutation(internal.emailAdmin.recordTest, {
        adminId,
        success: false,
        recipient,
        message: "Recipient is on the unsubscribe list — no email was sent.",
      });
      return { success: false, status: "blocked", message: "That address has unsubscribed from platform email." };
    }

    await ctx.runMutation(internal.emailAdmin.markMessageSending, { messageId: queued.id });
    const outcome = await elasticSend(config.apiKey, {
      to: recipient,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      fromEmail: config.fromEmail,
      fromName: config.fromName,
      replyTo: config.replyToEmail,
    });

    if (outcome.ok) {
      await ctx.runMutation(internal.emailAdmin.markMessageSent, {
        messageId: queued.id,
        providerMessageId: outcome.data.messageId ?? undefined,
      });
      await ctx.runMutation(internal.emailAdmin.recordTest, {
        adminId,
        success: true,
        recipient,
        message: "Test email sent successfully.",
      });
      return { success: true, status: "connected", message: "Test email sent successfully.", providerMessageId: outcome.data.messageId };
    }

    const isSenderProblem = outcome.kind === "sender_error";
    const friendly = isSenderProblem
      ? `Elastic Email rejected the sender address: ${outcome.message}. Verify the From address or its domain in your Elastic Email account.`
      : outcome.message;

    await ctx.runMutation(internal.emailAdmin.markMessageFailed, {
      messageId: queued.id,
      error: friendly,
      terminal: true,
    });
    await ctx.runMutation(internal.emailAdmin.recordTest, { adminId, success: false, recipient, message: friendly });
    return { success: false, status: outcome.kind, message: friendly };
  },
});

// ─── Centralized transactional service ──────────────────────────────────────

/**
 * The one entry point application code uses to send mail. It renders a
 * code-controlled template, queues the message in the delivery ledger, and hands
 * it to the dispatcher. If email is disabled or unconfigured the queue entry is
 * marked failed with a clear reason and reported to the caller, so a security-
 * critical flow is never silently discarded.
 */
export const sendTransactional = internalAction({
  args: {
    to: v.string(),
    templateKey: v.string(),
    data: v.optional(v.any()),
    userId: v.optional(v.id("users")),
    campaignId: v.optional(v.id("emailCampaigns")),
    subjectOverride: v.optional(v.string()),
  },
  handler: async (ctx, args): Promise<{ queued: boolean; status: string; message: string }> => {
    const loaded = await loadSenderConfig(ctx);
    if ("error" in loaded) return { queued: false, status: "not_configured", message: loaded.error.message };
    const config = loaded.config;
    if (!config.apiKey || !config.fromEmail.trim() || !config.fromName.trim()) {
      return { queued: false, status: "not_configured", message: "Transactional email is not fully configured." };
    }
    if (!config.enabled) {
      return { queued: false, status: "disabled", message: "Transactional email is disabled by the administrator." };
    }

    const data = { platformName: config.platformName, ...((args.data as Record<string, unknown>) ?? {}) };
    const rendered = renderTemplate(args.templateKey as EmailTemplateKey, data);
    const queued = (await ctx.runMutation(internal.emailAdmin.enqueueMessage, {
      to: args.to,
      fromName: config.fromName,
      subject: args.subjectOverride?.trim() || rendered.subject,
      textBody: rendered.text,
      htmlBody: rendered.html,
      templateKey: args.templateKey,
      userId: args.userId,
      campaignId: args.campaignId,
    })) as QueueResult;
    if (queued.status !== "queued") {
      return { queued: false, status: queued.status, message: "Recipient has unsubscribed from platform email." };
    }
    await ctx.scheduler.runAfter(0, internal.email.dispatchQueued, { limit: 10 });
    return { queued: true, status: "queued", message: "Queued for delivery." };
  },
});

/** Enqueue a campaign batch (used by the paid email service). */
export const enqueueCampaign = internalAction({
  args: {
    campaignId: v.id("emailCampaigns"),
    subject: v.string(),
    userId: v.id("users"),
    contentHtml: v.string(),
    recipients: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<{ queued: number; skipped: number; status: string; message: string }> => {
    const loaded = await loadSenderConfig(ctx);
    const blocked = "error" in loaded
      ? loaded.error.message
      : !loaded.config.apiKey || !loaded.config.fromEmail.trim() || !loaded.config.fromName.trim()
        ? "Transactional email is not fully configured."
        : !loaded.config.enabled
          ? "Transactional email is disabled by the administrator."
          : null;
    if (blocked) {
      // Never report a campaign as sent when nothing could leave the platform.
      await ctx.runMutation(internal.emailAdmin.failCampaign, { campaignId: args.campaignId, reason: blocked });
      return { queued: 0, skipped: args.recipients.length, status: "failed", message: blocked };
    }
    const config = "config" in loaded ? loaded.config : null;
    if (!config) return { queued: 0, skipped: args.recipients.length, status: "failed", message: "Sender configuration unavailable." };

    const safeHtml = sanitizeHtml(args.contentHtml);
    const rendered = renderTemplate("raw", { platformName: config.platformName, message: args.subject, details: safeHtml });
    const batch = args.recipients.slice(0, 200);
    let queued = 0;
    for (const recipient of batch) {
      const result = (await ctx.runMutation(internal.emailAdmin.enqueueMessage, {
        to: recipient,
        fromName: config.fromName,
        subject: args.subject,
        textBody: rendered.text,
        htmlBody: rendered.html,
        templateKey: "campaign",
        userId: args.userId,
        campaignId: args.campaignId,
        maxAttempts: 2,
      })) as QueueResult;
      if (result.status === "queued") queued++;
    }

    if (queued === 0) {
      // Every recipient was suppressed (unsubscribed) — resolve the campaign
      // instead of leaving it stuck in "scheduled".
      const reason = "No message was queued: every recipient is unsubscribed from platform email.";
      await ctx.runMutation(internal.emailAdmin.failCampaign, { campaignId: args.campaignId, reason });
      return { queued: 0, skipped: args.recipients.length, status: "blocked", message: reason };
    }

    await ctx.scheduler.runAfter(0, internal.email.dispatchQueued, { limit: 20 });
    return {
      queued,
      skipped: args.recipients.length - queued,
      status: "queued",
      message: `${queued} message(s) queued for delivery.`,
    };
  },
});

/** Queue a single campaign recipient (bounded, used in batches). */
export const enqueueCampaignMessage = internalAction({
  args: {
    campaignId: v.id("emailCampaigns"),
    subject: v.string(),
    userId: v.id("users"),
    contentHtml: v.string(),
    recipient: v.string(),
  },
  handler: async (ctx, args): Promise<{ queued: boolean; status: string; message: string }> => {
    const loaded = await loadSenderConfig(ctx);
    if ("error" in loaded) {
      await ctx.runMutation(internal.emailAdmin.failCampaign, { campaignId: args.campaignId, reason: loaded.error.message });
      return { queued: false, status: "not_configured", message: loaded.error.message };
    }
    const config = loaded.config;
    if (!config.apiKey || !config.fromEmail.trim() || !config.fromName.trim()) {
      const reason = "Transactional email is not fully configured.";
      await ctx.runMutation(internal.emailAdmin.failCampaign, { campaignId: args.campaignId, reason });
      return { queued: false, status: "not_configured", message: reason };
    }
    if (!config.enabled) {
      const reason = "Transactional email is disabled by the administrator.";
      await ctx.runMutation(internal.emailAdmin.failCampaign, { campaignId: args.campaignId, reason });
      return { queued: false, status: "disabled", message: reason };
    }
    const safeHtml = sanitizeHtml(args.contentHtml);
    const rendered = renderTemplate("raw", { platformName: config.platformName, message: args.subject, details: safeHtml });
    const result = (await ctx.runMutation(internal.emailAdmin.enqueueMessage, {
      to: args.recipient,
      fromName: config.fromName,
      subject: args.subject,
      textBody: rendered.text,
      htmlBody: rendered.html,
      templateKey: "campaign",
      userId: args.userId,
      campaignId: args.campaignId,
      maxAttempts: 2,
    })) as QueueResult;
    return { queued: result.status === "queued", status: result.status, message: result.status };
  },
});

/**
 * Drain a bounded batch from the delivery queue. Event-driven: the next run is
 * only scheduled when something is left to retry, so an idle platform performs
 * no work.
 */
export const dispatchQueued = internalAction({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(Math.max(args.limit ?? 10, 1), 50);
    const loaded = await loadSenderConfig(ctx);
    const config = "config" in loaded ? loaded.config : null;
    const loadError = "error" in loaded ? loaded.error : null;
    const apiKey = config?.apiKey ?? null;
    const ready = !!config && !!apiKey && config.enabled && !!config.fromEmail.trim() && !!config.fromName.trim();

    const messages = (await ctx.runQuery(internal.emailAdmin.claimQueuedMessages, { limit })) as {
      _id: MessageId;
      to: string;
      subject: string;
      html: string | null;
      text: string;
      fromName: string;
      templateKey: string | null;
      campaignId: CampaignId | null;
      attempts: number;
      maxAttempts: number;
    }[];

    if (messages.length === 0) return { processed: 0, sent: 0, failed: 0 };

    if (!ready || !config || !apiKey) {
      const reason =
        loadError?.message ??
        (!config
          ? "Elastic Email is not configured."
          : !config.enabled
            ? "Transactional email is disabled by the administrator."
            : "Sender configuration is incomplete.");
      for (const message of messages) {
        await ctx.runMutation(internal.emailAdmin.markMessageFailed, {
          messageId: message._id,
          error: reason,
          terminal: true,
        });
      }
      await ctx.runMutation(internal.emailAdmin.recordVerification, {
        status: "provider_error",
        statusMessage: `Delivery attempted while email was unavailable: ${reason}`,
        lastError: reason,
        verified: false,
      });
      return { processed: messages.length, sent: 0, failed: messages.length };
    }

    let sent = 0;
    let failed = 0;
    let retryScheduled = false;
    const campaigns = new Set<CampaignId>();

    for (const message of messages) {
      await ctx.runMutation(internal.emailAdmin.markMessageSending, { messageId: message._id });
      const outcome = await elasticSend(apiKey, {
        to: message.to,
        subject: message.subject,
        html: message.html ?? `<p>${message.text.replace(/</g, "&lt;")}</p>`,
        text: message.text,
        fromEmail: config.fromEmail,
        fromName: message.fromName || config.fromName,
        replyTo: config.replyToEmail,
      });

      if (outcome.ok) {
        await ctx.runMutation(internal.emailAdmin.markMessageSent, {
          messageId: message._id,
          providerMessageId: outcome.data.messageId ?? undefined,
        });
        sent++;
      } else {
        failed++;
        const exhausted = message.attempts + 1 >= message.maxAttempts || outcome.kind === "invalid_key" || outcome.kind === "sender_error";
        const retryDelay = Math.min(15 * 60_000, 60_000 * (message.attempts + 1));
        const result = (await ctx.runMutation(internal.emailAdmin.markMessageFailed, {
          messageId: message._id,
          error: outcome.message,
          retryInMs: retryDelay,
          terminal: exhausted,
        })) as FailResult;
        if (!result.exhausted) retryScheduled = true;
      }
      if (message.campaignId) campaigns.add(message.campaignId);
    }

    for (const campaignId of campaigns) {
      await ctx.runMutation(internal.emailAdmin.finalizeCampaign, { campaignId });
    }

    if (retryScheduled) {
      await ctx.scheduler.runAfter(120_000, internal.email.dispatchQueued, { limit });
    }

    return { processed: messages.length, sent, failed };
  },
});
