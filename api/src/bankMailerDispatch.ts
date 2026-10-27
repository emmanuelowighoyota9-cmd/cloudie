/**
 * Bank Mailer — provider dispatch.
 *
 * The platform's transactional provider is Elastic Email (the same gateway
 * `src/convex/email.ts` talks to); this module is the API-server copy of that
 * conversation, deliberately small: one POST per notice, sent in parallel.
 *
 * Credentials come from the environment, never from the database and never
 * from the client:
 *
 *   ELASTIC_EMAIL_API_KEY     required — without it every send fails as
 *                             `NOT_CONFIGURED`, which the workflow answers with
 *                             a full refund rather than a silent drop.
 *   ELASTIC_EMAIL_FROM        sender address (defaults to the platform
 *                             no-reply address; must be verified at the
 *                             provider for delivery to succeed).
 *   ELASTIC_EMAIL_FROM_NAME   sender name (defaults to the platform name).
 *
 * Provider error text is truncated and scrubbed of the API key before it can
 * reach a response body or a log line.
 */
import type { Attempt, DispatchReport, NoticePair } from "./bankMailerSend.js";

const API_BASE = "https://api.elasticemail.com/v4";
const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_FROM = "no-reply@cloudie.wuaze.com";

type SendConfig = { apiKey: string; from: string; fromName: string };

function readConfig(platformName: string): { config: SendConfig } | { error: string } {
  const apiKey = (process.env.ELASTIC_EMAIL_API_KEY ?? "").trim();
  if (!apiKey) {
    return {
      error:
        "Transactional email is not configured on the API server (ELASTIC_EMAIL_API_KEY is missing).",
    };
  }
  const from = (process.env.ELASTIC_EMAIL_FROM ?? "").trim() || DEFAULT_FROM;
  const fromName = (process.env.ELASTIC_EMAIL_FROM_NAME ?? "").trim() || platformName || "Cloudie";
  return { config: { apiKey, from, fromName } };
}

/** Trim provider detail and remove the API key if an upstream echoed it back. */
function scrub(raw: string, apiKey: string): string {
  const message = (raw ?? "").replace(apiKey, "[redacted]").slice(0, 400);
  return message || "The mail provider rejected the message.";
}

function timeoutSignal(): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    : undefined;
}

async function sendOne(
  config: SendConfig,
  notice: { to: string; subject: string; html: string; text: string },
): Promise<Attempt> {
  const payload = {
    Recipients: [{ Email: notice.to }],
    Content: {
      From: `${config.fromName} <${config.from}>`,
      ReplyTo: config.from,
      Subject: notice.subject,
      Body: [
        { ContentType: "HTML", Charset: "utf-8", Content: notice.html },
        { ContentType: "PlainText", Charset: "utf-8", Content: notice.text },
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
        "X-ElasticEmail-ApiKey": config.apiKey,
      },
      body: JSON.stringify(payload),
      signal: timeoutSignal(),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      return {
        ok: false,
        code: `PROVIDER_${res.status}`,
        message: scrub(detail, config.apiKey),
      };
    }

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const id = body.MessageID ?? body.messageID ?? body.TransactionID ?? body.transactionID;
    return { ok: true, messageId: typeof id === "string" ? id : null };
  } catch (error) {
    return {
      ok: false,
      code: "PROVIDER_NETWORK",
      message: scrub(error instanceof Error ? error.message : String(error), config.apiKey),
    };
  }
}

/**
 * Dispatch both notices in parallel. When the provider is not configured,
 * both attempts fail fast with the same reason so the workflow refunds and
 * tells the user why instead of half-sending.
 */
export async function dispatchNoticePair(pair: NoticePair, platformName: string): Promise<DispatchReport> {
  const loaded = readConfig(platformName);
  if ("error" in loaded) {
    return {
      debit: { ok: false, code: "NOT_CONFIGURED", message: loaded.error },
      credit: { ok: false, code: "NOT_CONFIGURED", message: loaded.error },
    };
  }
  const [debit, credit] = await Promise.all([
    sendOne(loaded.config, pair.debit),
    sendOne(loaded.config, pair.credit),
  ]);
  return { debit, credit };
}
