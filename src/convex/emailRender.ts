/**
 * Application-controlled transactional email templates + HTML hardening.
 *
 * Transactional templates live in code (this module) rather than in the
 * database, so an administrator can never inject executable markup into mail
 * that the platform sends. Content that *does* originate from a user —
 * marketing campaign bodies — is passed through {@link sanitizeHtml} before it
 * is handed to the provider.
 */

export type EmailTemplateKey =
  | "test_email"
  | "welcome"
  | "points_received"
  | "shipment_update"
  | "password_reset_notice"
  | "raw";

export type EmailTemplateData = {
  recipientName?: string;
  platformName?: string;
  points?: number;
  trackingNumber?: string;
  status?: string;
  message?: string;
  details?: string;
};

export type RenderedEmail = { subject: string; html: string; text: string };

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Strip anything executable from markup before it reaches a mail client:
 * script/style/iframe/object/embed/form elements, event handler attributes and
 * `javascript:` URLs. This is intentionally conservative.
 */
export function sanitizeHtml(input: string): string {
  let out = String(input ?? "");
  out = out.replace(/<\s*(script|style|iframe|object|embed|form|link|meta)\b[\s\S]*?<\s*\/\s*\1\s*>/gi, "");
  out = out.replace(/<\s*(script|style|iframe|object|embed|form|link|meta)\b[^>]*\/?>/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*[^\s>]+/gi, "");
  out = out.replace(/(href|src)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, '$1="#"');
  return out.trim();
}

function shell(title: string, bodyHtml: string, platformName: string): string {
  return `<!doctype html><html><body style="margin:0;padding:24px;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:14px;overflow:hidden;">
    <div style="padding:18px 24px;border-bottom:1px solid #e2e8f0;background:#ffffff;">
      <span style="font-size:14px;font-weight:700;letter-spacing:.02em;color:#1d4ed8;">${escapeHtml(platformName)}</span>
    </div>
    <div style="padding:24px;">
      <h1 style="margin:0 0 12px;font-size:18px;line-height:1.3;">${escapeHtml(title)}</h1>
      <div style="font-size:14px;line-height:1.65;color:#334155;">${bodyHtml}</div>
    </div>
    <div style="padding:16px 24px;border-top:1px solid #e2e8f0;font-size:11px;color:#94a3b8;">
      This is a transactional message from ${escapeHtml(platformName)}.
    </div>
  </div>
</body></html>`;
}

function rows(pairs: [string, string][]): string {
  return `<table style="width:100%;border-collapse:collapse;font-size:13px;">${pairs
    .map(
      ([k, v]) =>
        `<tr><td style="padding:6px 0;color:#64748b;">${escapeHtml(k)}</td><td style="padding:6px 0;text-align:right;font-weight:600;">${escapeHtml(v)}</td></tr>`,
    )
    .join("")}</table>`;
}

/** Render a code-controlled template into subject + html + plain text. */
export function renderTemplate(key: EmailTemplateKey, data: EmailTemplateData = {}): RenderedEmail {
  const platformName = data.platformName?.trim() || "Cloudie";
  const name = data.recipientName?.trim() || "there";

  switch (key) {
    case "test_email":
      return {
        subject: `${platformName}: test email`,
        html: shell(
          "Elastic Email is connected",
          `<p style="margin:0 0 12px;">Hi ${escapeHtml(name)} — this test confirms that ${escapeHtml(platformName)} can deliver transactional email through Elastic Email.</p>${rows([
            ["Provider", "Elastic Email"],
            ["Sent at", new Date().toISOString()],
          ])}<p style="margin:14px 0 0;color:#64748b;font-size:12px;">No action is needed. You can disable test sending from Admin → Email Settings.</p>`,
          platformName,
        ),
        text: `${platformName}: test email\n\nThis test confirms transactional email delivery through Elastic Email works.\nSent at ${new Date().toISOString()}`,
      };
    case "welcome":
      return {
        subject: `Welcome to ${platformName}`,
        html: shell(
          `Welcome, ${name}`,
          `<p style="margin:0 0 12px;">Your ${escapeHtml(platformName)} workspace is ready.</p>${data.details ? `<p style="margin:0 0 12px;">${escapeHtml(data.details)}</p>` : ""}`,
          platformName,
        ),
        text: `Welcome to ${platformName}, ${name}.\n\n${data.details ?? "Your workspace is ready."}`,
      };
    case "points_received":
      return {
        subject: `${platformName}: points credited`,
        html: shell(
          "Points added to your wallet",
          `<p style="margin:0 0 12px;">Hi ${escapeHtml(name)}, your wallet was updated.</p>${rows([
            ["Points", String(data.points ?? 0)],
            ["Reference", data.details ?? "—"],
          ])}`,
          platformName,
        ),
        text: `${data.points ?? 0} points were credited to your ${platformName} wallet. ${data.details ?? ""}`.trim(),
      };
    case "shipment_update":
      return {
        subject: `${platformName}: ${data.trackingNumber ?? "shipment"} — ${data.status ?? "update"}`,
        html: shell(
          "Shipment update",
          `<p style="margin:0 0 12px;">Hi ${escapeHtml(name)}, there is a new update on your shipment.</p>${rows([
            ["Tracking number", data.trackingNumber ?? "—"],
            ["Status", data.status ?? "—"],
            ["Location", data.details ?? "—"],
          ])}`,
          platformName,
        ),
        text: `Shipment ${data.trackingNumber ?? ""}: ${data.status ?? ""} ${data.details ?? ""}`.trim(),
      };
    case "password_reset_notice":
      return {
        subject: `${platformName}: password changed`,
        html: shell(
          "Your password was changed",
          `<p style="margin:0 0 12px;">Hi ${escapeHtml(name)}, your ${escapeHtml(platformName)} password was changed. If this wasn't you, contact support immediately.</p>`,
          platformName,
        ),
        text: `Your ${platformName} password was changed. If this wasn't you, contact support immediately.`,
      };
    case "raw":
    default: {
      const html = sanitizeHtml(data.details ?? "");
      const plain = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      return {
        subject: data.message?.trim() || `${platformName} notification`,
        html: shell(data.message?.trim() || "Notification", html || "<p></p>", platformName),
        text: plain,
      };
    }
  }
}
