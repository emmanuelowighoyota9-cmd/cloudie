/**
 * The platform's one transactional-email conversation (Elastic Email).
 *
 * Shared by every server-side mailer so there is a single place that knows the
 * provider endpoint, the sender identity and the error handling. Credentials
 * come from the environment, never from the database and never from the client:
 *
 *   ELASTIC_EMAIL_API_KEY     required — without it a send fails as
 *                             `NOT_CONFIGURED` so the caller can refund instead
 *                             of silently dropping the message.
 *   ELASTIC_EMAIL_FROM        sender address (defaults to the platform no-reply
 *                             address; must be verified at the provider).
 *   ELASTIC_EMAIL_FROM_NAME   sender name (defaults to the platform name).
 *
 * Provider error text is truncated and scrubbed of the API key before it can
 * reach a response body or a log line.
 */

const API_BASE = "https://api.elasticemail.com/v4";
const REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_FROM = "no-reply@cloudie.wuaze.com";

export type OutboundEmail = { to: string; subject: string; html: string; text: string };

export type MailAttempt =
  | { ok: true; messageId: string | null }
  | { ok: false; code: string; message: string };

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
export function scrubProviderMessage(raw: string, apiKey: string): string {
  const message = (raw ?? "").replace(apiKey, "[redacted]").slice(0, 400);
  return message || "The mail provider rejected the message.";
}

function timeoutSignal(): AbortSignal | undefined {
  return typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function"
    ? AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    : undefined;
}

/**
 * Send one message. `replyTo` defaults to the sender address so a reply reaches
 * the operator rather than the no-reply mailbox.
 */
export async function sendTransactionalEmail(
  email: OutboundEmail,
  platformName: string,
  options: { replyTo?: string } = {},
): Promise<MailAttempt> {
  const loaded = readConfig(platformName);
  if ("error" in loaded) return { ok: false, code: "NOT_CONFIGURED", message: loaded.error };
  const { config } = loaded;

  const payload = {
    Recipients: [{ Email: email.to }],
    Content: {
      From: `${config.fromName} <${config.from}>`,
      ReplyTo: options.replyTo ?? config.from,
      Subject: email.subject,
      Body: [
        { ContentType: "HTML", Charset: "utf-8", Content: email.html },
        { ContentType: "PlainText", Charset: "utf-8", Content: email.text },
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
        message: scrubProviderMessage(detail, config.apiKey),
      };
    }

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    const id = body.MessageID ?? body.messageID ?? body.TransactionID ?? body.transactionID;
    return { ok: true, messageId: typeof id === "string" ? id : null };
  } catch (error) {
    return {
      ok: false,
      code: "PROVIDER_NETWORK",
      message: scrubProviderMessage(
        error instanceof Error ? error.message : String(error),
        config.apiKey,
      ),
    };
  }
}
