"use node";

import { action, internalAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { getAuthUserId } from "@convex-dev/auth/server";
import { decryptSecret, encryptSecret, generateEncryptionSecret } from "./emailCrypto";
import { AUTO_KEY_NAME, envApiKey, envEncryptionKey, envSmtpPassword, type TransportKind } from "./emailShared";
import nodemailer from "nodemailer";
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

type SmtpConfig = {
  host: string;
  port: number;
  secure: boolean;
  username: string;
  password: string | null;
  passwordSource: "dashboard" | "environment" | "none";
};

type SenderConfig = {
  /** Which provider transport actually carries the message. */
  transport: TransportKind;
  apiKey: string | null;
  keySource: "dashboard" | "environment" | "none";
  smtp: SmtpConfig | null;
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
    transport: string | null;
    apiKeyEncrypted: string | null;
    apiKeySource: "dashboard" | "environment" | "none";
    smtpHost: string | null;
    smtpPort: number | null;
    smtpSecure: boolean;
    smtpUsername: string | null;
    smtpPasswordEncrypted: string | null;
    smtpPasswordSource: "dashboard" | "environment" | "none";
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

  // ── SMTP credential (same sealing scheme, same key resolution) ───────────
  const envSmtp = envSmtpPassword();
  let smtpPassword: string | null = null;
  let smtpPasswordSource: "dashboard" | "environment" | "none" = "none";
  if (envSmtp) {
    smtpPassword = envSmtp.value;
    smtpPasswordSource = "environment";
  } else if (row.smtpPasswordEncrypted) {
    try {
      const { secret } = await resolveEncryptionSecret(ctx);
      smtpPassword = decryptSecret(row.smtpPasswordEncrypted, secret);
      smtpPasswordSource = "dashboard";
    } catch {
      return {
        error: {
          code: "CREDENTIAL_UNREADABLE",
          message:
            "The saved SMTP password could not be decrypted. Replace it in the dashboard (credentials are bound to the deployment encryption key).",
        },
      };
    }
  }

  const smtp: SmtpConfig | null =
    row.smtpHost || row.smtpPort || row.smtpUsername
      ? {
          host: (row.smtpHost ?? "").trim(),
          port: row.smtpPort ?? 0,
          secure: row.smtpSecure ?? false,
          username: (row.smtpUsername ?? "").trim(),
          password: smtpPassword,
          passwordSource: smtpPasswordSource,
        }
      : null;

  return {
    config: {
      transport: row.transport === "smtp" ? "smtp" : "api",
      apiKey,
      keySource: env ? "environment" : apiKey ? "dashboard" : "none",
      smtp,
      fromEmail: row.fromEmail,
      fromName: row.fromName,
      replyToEmail: row.replyToEmail,
      enabled: row.enabled,
      platformName: row.platformName,
      status: row.status,
    },
  };
}

/**
 * Human-readable reason the active transport cannot send, or `null` when it is
 * ready. Used by every send path so a half-configured transport is reported
 * instead of silently failing.
 */
function credentialProblem(config: SenderConfig): string | null {
  if (config.transport === "smtp") {
    const smtp = config.smtp;
    if (!smtp || !smtp.host || !smtp.port) {
      return "Set the SMTP host and port, then save the transport settings.";
    }
    if (!smtp.username || !smtp.password) {
      return "Add the SMTP username and password for the relay.";
    }
    return null;
  }
  if (!config.apiKey) return "Add your Elastic Email API key to enable transactional email.";
  return null;
}

/** Label used in status messages and delivery logs for the active transport. */
function transportLabel(config: SenderConfig): string {
  return config.transport === "smtp"
    ? `SMTP relay ${config.smtp?.host ?? ""}:${config.smtp?.port ?? ""}`.trim()
    : "Elastic Email API";
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

type SmtpOutcome =
  | { ok: true; messageId: string | null }
  | { ok: false; kind: ProviderErrorKind; status: number; message: string };

/** Create a relay connection from the stored configuration. */
function smtpTransport(config: SenderConfig) {
  const smtp = config.smtp;
  if (!smtp) throw new Error("SMTP_NOT_CONFIGURED");
  return nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure,
    auth: { user: smtp.username, pass: smtp.password ?? "" },
    connectionTimeout: REQUEST_TIMEOUT_MS,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    tls: { minVersion: "TLSv1.2" },
  });
}

/** Map a nodemailer failure onto the provider error vocabulary. */
function classifySmtpError(error: unknown): { kind: ProviderErrorKind; status: number; message: string } {
  const candidate = error as { code?: string; responseCode?: number; response?: string; message?: string } | null;
  const code = String(candidate?.code ?? "");
  const status = typeof candidate?.responseCode === "number" ? candidate.responseCode : 0;
  const detail = candidate?.response ?? candidate?.message ?? String(error);
  const message = cleanProviderMessage(detail);

  if (code === "EAUTH" || status === 535 || status === 534 || /auth/i.test(message)) {
    return { kind: "invalid_key", status, message };
  }
  if (code.startsWith("E" + "CONN") || code === "ETIMEDOUT" || code === "ESOCKET" || code === "EDNS" || code === "ECONNECTION") {
    return { kind: "network_error", status, message };
  }
  if (status >= 550 && status <= 559) return { kind: "sender_error", status, message };
  return { kind: "provider_error", status, message };
}

/** Deliver one message through the configured SMTP relay. */
async function smtpSend(
  config: SenderConfig,
  message: { to: string; subject: string; html: string; text: string; fromEmail: string; fromName: string; replyTo: string | null },
): Promise<SmtpOutcome> {
  try {
    const info = await smtpTransport(config).sendMail({
      from: { name: message.fromName, address: message.fromEmail },
      to: message.to,
      replyTo: message.replyTo ?? message.fromEmail,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });
    const messageId = typeof info?.messageId === "string" ? info.messageId : null;
    return { ok: true, messageId };
  } catch (error) {
    const failure = classifySmtpError(error);
    return { ok: false, ...failure };
  }
}

/** Validate the relay credentials without sending anything. */
async function smtpVerify(config: SenderConfig): Promise<{ ok: true } | { ok: false; kind: ProviderErrorKind; message: string }> {
  try {
    await smtpTransport(config).verify();
    return { ok: true };
  } catch (error) {
    const failure = classifySmtpError(error);
    return { ok: false, kind: failure.kind, message: failure.message };
  }
}

/** Route a message through whichever transport is active. */
async function dispatchSend(
  config: SenderConfig,
  message: { to: string; subject: string; html: string; text: string; fromEmail: string; fromName: string; replyTo: string | null },
): Promise<ProviderOutcome<{ messageId: string | null }>> {
  if (config.transport === "smtp") {
    const result = await smtpSend(config, message);
    return result.ok ? { ok: true, data: { messageId: result.messageId } } : result;
  }
  return await elasticSend(config.apiKey ?? "", message);
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
  const problem = credentialProblem(config);
  if (problem) {
    await ctx.runMutation(internal.emailAdmin.recordVerification, {
      status: "not_configured",
      statusMessage: problem,
      verified: false,
    });
    return { status: "not_configured", message: problem };
  }

  // SMTP is verified by actually opening a relay session, not by inspecting
  // stored fields — "Connected" must mean the provider accepted the credentials.
  if (config.transport === "smtp") {
    const probe = await smtpVerify(config);
    if (probe.ok) {
      const label = transportLabel(config);
      await ctx.runMutation(internal.emailAdmin.recordVerification, {
        status: "connected",
        statusMessage: `${label} authenticated successfully.`,
        verified: true,
      });
      return { status: "connected", message: `Connected through ${label}.` };
    }
    await ctx.runMutation(internal.emailAdmin.recordVerification, {
      status: probe.kind === "invalid_key" ? "invalid_key" : probe.kind === "sender_error" ? "sender_error" : "provider_error",
      statusMessage: probe.message,
      lastError: probe.message,
      verified: false,
    });
    return { status: probe.kind, message: probe.message };
  }

  const probe = await elasticAccount(config.apiKey as string);
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

    // The key is only verified when the HTTP API is actually the live transport —
    // otherwise the check would be reporting on the SMTP relay instead.
    if (loaded.config.transport === "smtp") {
      return {
        success: true,
        status: "unverified",
        message: "API key saved. The SMTP relay is the active transport, so this key is stored but not currently used.",
        encryptionKeySource: source,
      };
    }

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

/**
 * Choose how mail leaves the platform and persist the non-secret relay details.
 * Either transport is validated server-side, then the live configuration is
 * re-verified so the status panel reflects reality immediately.
 */
export const saveTransportConfig = action({
  args: {
    transport: v.string(),
    smtpHost: v.optional(v.string()),
    smtpPort: v.optional(v.number()),
    smtpSecure: v.optional(v.boolean()),
    smtpUsername: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdminAction(ctx);
    if (args.transport !== "api" && args.transport !== "smtp") {
      throw new Error("INVALID_TRANSPORT: choose either the API or the SMTP relay");
    }

    const host = (args.smtpHost ?? "").trim();
    const username = (args.smtpUsername ?? "").trim();
    const port = Math.trunc(args.smtpPort ?? 0);

    if (args.transport === "smtp") {
      if (!host || /\s/.test(host)) throw new Error("INVALID_SMTP_HOST: enter the relay hostname (e.g. smtp.elasticemail.com)");
      if (!Number.isFinite(port) || port < 1 || port > 65_535) throw new Error("INVALID_SMTP_PORT: enter a port between 1 and 65535");
    }

    await ctx.runMutation(internal.emailAdmin.saveTransportRow, {
      adminId,
      transport: args.transport,
      smtpHost: host || undefined,
      smtpPort: args.transport === "smtp" ? port : args.smtpPort,
      smtpSecure: args.smtpSecure ?? false,
      smtpUsername: username || undefined,
    });

    const loaded = await loadSenderConfig(ctx);
    if ("error" in loaded) {
      return { success: false, status: "not_configured", message: loaded.error.message };
    }
    const verification = await verifyAndRecord(ctx, loaded.config);
    return {
      success: verification.status === "connected",
      status: verification.status,
      message: `Transport saved. ${verification.message}`,
    };
  },
});

/** Seal a new SMTP relay password (and optional username), then verify it. */
export const saveSmtpPassword = action({
  args: { password: v.string(), username: v.optional(v.string()), smtpHost: v.optional(v.string()), smtpPort: v.optional(v.number()), smtpSecure: v.optional(v.boolean()) },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdminAction(ctx);
    const password = args.password.trim();
    if (password.length < 4) throw new Error("INVALID_SMTP_PASSWORD: paste the SMTP password issued by your provider");

    const host = (args.smtpHost ?? "").trim();
    const port = Math.trunc(args.smtpPort ?? 0);
    if (!host || /\s/.test(host)) throw new Error("INVALID_SMTP_HOST: enter the relay hostname (e.g. smtp.elasticemail.com)");
    if (!Number.isFinite(port) || port < 1 || port > 65_535) throw new Error("INVALID_SMTP_PORT: enter a port between 1 and 65535");
    const username = (args.username ?? "").trim();
    if (!username || /\s/.test(username)) throw new Error("INVALID_SMTP_USERNAME: enter the SMTP username issued by your provider");

    const existing: { smtpPasswordEncrypted: string | null } | null = await ctx.runQuery(internal.emailAdmin.getConfigForSend, {});
    const { secret, source } = await resolveEncryptionSecret(ctx);

    // Persist host/port first so the credential is verified against the settings
    // the administrator just entered, not stale ones.
    await ctx.runMutation(internal.emailAdmin.saveTransportRow, {
      adminId,
      transport: "smtp",
      smtpHost: host,
      smtpPort: port,
      smtpSecure: args.smtpSecure ?? false,
      smtpUsername: username,
    });
    await ctx.runMutation(internal.emailAdmin.saveSmtpCredentialRow, {
      adminId,
      passwordEncrypted: encryptSecret(password, secret),
      username,
      replacedExisting: !!existing?.smtpPasswordEncrypted,
    });

    const loaded = await loadSenderConfig(ctx);
    if ("error" in loaded) return { success: false, status: "unverified", message: loaded.error.message };
    const verification = await verifyAndRecord(ctx, loaded.config);
    return {
      success: verification.status === "connected",
      status: verification.status,
      message:
        verification.status === "connected"
          ? `SMTP credentials saved and verified. ${verification.message}`
          : `SMTP credentials saved. ${verification.message}`,
      encryptionKeySource: source,
    };
  },
});

/** Remove the stored SMTP password (does not touch a deployment-level env var). */
export const clearSmtpPassword = action({
  args: {},
  handler: async (ctx) => {
    const { adminId } = await requireAdminAction(ctx);
    await ctx.runMutation(internal.emailAdmin.clearSmtpCredentialRow, { adminId });
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

    const problem = credentialProblem(config);
    if (problem) {
      return { success: false, status: "not_configured", message: problem };
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
    const outcome = await dispatchSend(config, {
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
      ? `${transportLabel(config)} rejected the sender address: ${outcome.message}. Verify the From address or its domain with your email provider.`
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
    if (credentialProblem(config) || !config.fromEmail.trim() || !config.fromName.trim()) {
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
      : credentialProblem(loaded.config) || !loaded.config.fromEmail.trim() || !loaded.config.fromName.trim()
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
    if (credentialProblem(config) || !config.fromEmail.trim() || !config.fromName.trim()) {
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
    const credentialIssue = config ? credentialProblem(config) : "Email provider is not configured.";
    const ready = !!config && !credentialIssue && config.enabled && !!config.fromEmail.trim() && !!config.fromName.trim();

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

    if (!ready || !config) {
      const reason =
        loadError?.message ?? credentialIssue ??
        (!config
          ? "Email provider is not configured."
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
      const outcome = await dispatchSend(config, {
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
