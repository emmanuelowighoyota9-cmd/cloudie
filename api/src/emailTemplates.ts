/**
 * Email Template Catalog — product model, HTML sanitisation, placeholder rules
 * and the renderer shared by the API, the customer mailers and the admin UI.
 *
 * The admin uploads a layout as HTML. It is sanitised here, on the server, and
 * every placeholder is checked against the allow-list of the product's
 * `service_type` before the row is stored. On send the API re-renders the same
 * row with the form values, so a customer reviews exactly what is delivered.
 *
 * Nothing here touches the network or the database, so it is importable from
 * `api/`, from the browser bundle and from the test runner.
 */

/* ── Service types ───────────────────────────────────────────────────────── */

export const TEMPLATE_SERVICE_TYPES = [
  {
    id: "billing",
    label: "Billing & invoices",
    description: "Payment, transfer and invoice layouts. Used by Bank Mailer.",
  },
  {
    id: "security_alerts",
    label: "Security alerts",
    description: "Sign-in, key-change and suspicious-activity notices.",
  },
  {
    id: "user_onboarding",
    label: "User onboarding",
    description: "Welcome, verification and account-activation layouts.",
  },
  {
    id: "notifications",
    label: "Transaction notifications",
    description: "Deposit, withdrawal and transfer layouts. Used by Crypto Mails.",
  },
] as const;

export type TemplateServiceType = (typeof TEMPLATE_SERVICE_TYPES)[number]["id"];

const SERVICE_TYPE_IDS = new Set<string>(TEMPLATE_SERVICE_TYPES.map((type) => type.id));

export function isTemplateServiceType(value: unknown): value is TemplateServiceType {
  return typeof value === "string" && SERVICE_TYPE_IDS.has(value);
}

/* ── Approved placeholders ───────────────────────────────────────────────── */

export type TemplateVariable = { key: string; label: string; sample: string };

/**
 * Each service type may only use its own placeholders. Anything else is
 * rejected at upload time — an unknown tag would render as an empty hole in a
 * delivered email, which is exactly the failure this catalogue exists to stop.
 */
export const TEMPLATE_VARIABLES: Record<TemplateServiceType, readonly TemplateVariable[]> = {
  billing: [
    { key: "brand_name", label: "Platform brand", sample: "Cloudie" },
    { key: "customer_name", label: "Customer name", sample: "Ada Obi" },
    { key: "notice_type", label: "Notice type", sample: "Debit notice" },
    { key: "amount", label: "Amount", sample: "2,500.00" },
    { key: "currency", label: "Currency", sample: "USD" },
    { key: "transaction_id", label: "Transaction ID", sample: "TXN-9F2C41A7" },
    { key: "reference", label: "Reference code", sample: "REF-884120" },
    { key: "status", label: "Status", sample: "Success" },
    { key: "date", label: "Date & time", sample: "29 Oct 2026, 14:02 UTC" },
    { key: "description", label: "Description / remarks", sample: "Invoice settlement" },
    { key: "party_name", label: "Notified party", sample: "Ada Obi" },
    { key: "party_email", label: "Notified email", sample: "ada@example.com" },
    { key: "party_account", label: "Notified account", sample: "0123456789" },
    { key: "party_bank", label: "Notified bank", sample: "First Meridian Bank" },
    { key: "sender_name", label: "Sender name", sample: "Ada Obi" },
    { key: "sender_email", label: "Sender email", sample: "ada@example.com" },
    { key: "sender_account", label: "Sender account", sample: "0123456789" },
    { key: "sender_bank", label: "Sender bank", sample: "First Meridian Bank" },
    { key: "receiver_name", label: "Receiver name", sample: "Bayo Cole" },
    { key: "receiver_email", label: "Receiver email", sample: "bayo@example.com" },
    { key: "receiver_account", label: "Receiver account", sample: "9988776655" },
    { key: "receiver_bank", label: "Receiver bank", sample: "Northgate Trust" },
    { key: "support_link", label: "Support link", sample: "https://cloudie.wuaze.com/support" },
  ],
  security_alerts: [
    { key: "brand_name", label: "Platform brand", sample: "Cloudie" },
    { key: "customer_name", label: "Customer name", sample: "Ada Obi" },
    { key: "alert_type", label: "Alert type", sample: "New sign-in" },
    { key: "device", label: "Device", sample: "Chrome on macOS" },
    { key: "location", label: "Location", sample: "Lagos, Nigeria" },
    { key: "ip_address", label: "IP address", sample: "102.89.34.10" },
    { key: "date", label: "Date & time", sample: "29 Oct 2026, 14:02 UTC" },
    { key: "action_url", label: "Action URL", sample: "https://cloudie.wuaze.com/settings" },
    { key: "support_link", label: "Support link", sample: "https://cloudie.wuaze.com/support" },
  ],
  user_onboarding: [
    { key: "brand_name", label: "Platform brand", sample: "Cloudie" },
    { key: "customer_name", label: "Customer name", sample: "Ada Obi" },
    { key: "account_email", label: "Account email", sample: "ada@example.com" },
    { key: "action_url", label: "Action URL", sample: "https://cloudie.wuaze.com/dashboard" },
    { key: "date", label: "Date & time", sample: "29 Oct 2026, 14:02 UTC" },
    { key: "support_link", label: "Support link", sample: "https://cloudie.wuaze.com/support" },
  ],
  notifications: [
    { key: "brand_name", label: "Platform brand", sample: "Cloudie" },
    { key: "customer_name", label: "Customer name", sample: "Ada Obi" },
    { key: "notice_type", label: "Notice type", sample: "Deposit" },
    { key: "amount", label: "Amount", sample: "0.05" },
    { key: "currency", label: "Asset / currency", sample: "BTC" },
    { key: "transaction_id", label: "Transaction hash", sample: "0x9f2c41a7" },
    { key: "status", label: "Status", sample: "Sent" },
    { key: "message", label: "Message / note", sample: "Incoming on-chain funds" },
    { key: "date", label: "Date & time", sample: "29 Oct 2026, 14:02 UTC" },
    { key: "recipient_email", label: "Recipient email", sample: "ada@example.com" },
    { key: "support_link", label: "Support link", sample: "https://cloudie.wuaze.com/support" },
  ],
};

const VARIABLE_KEYS = Object.fromEntries(
  TEMPLATE_SERVICE_TYPES.map((type) => [
    type.id,
    new Set(TEMPLATE_VARIABLES[type.id].map((variable) => variable.key)),
  ]),
) as Record<TemplateServiceType, Set<string>>;

/** Sample values for an admin preview — never used for a real dispatch. */
export function sampleTemplateVariables(serviceType: TemplateServiceType): Record<string, string> {
  const values: Record<string, string> = {};
  for (const variable of TEMPLATE_VARIABLES[serviceType]) values[variable.key] = variable.sample;
  return values;
}

/* ── Store shapes ────────────────────────────────────────────────────────── */

export type EmailTemplateProduct = {
  id: string;
  title: string;
  serviceType: TemplateServiceType;
  description: string;
  thumbnailUrl: string;
  htmlContent: string;
  priceCredits: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

/** Credits → NGN at the platform's standard ₦15 per credit. */
export const TEMPLATE_CREDIT_NGN = 15;

export function templateSurchargeNgn(priceCredits: number): number {
  const credits = Number.isFinite(priceCredits) ? Math.max(0, priceCredits) : 0;
  return Math.round(credits * TEMPLATE_CREDIT_NGN * 100) / 100;
}

/* ── Limits ──────────────────────────────────────────────────────────────── */

const LIMITS = {
  title: 120,
  description: 400,
  html: 200_000,
  thumbnail: 1_800_000,
  priceCredits: 10_000,
} as const;

/* ── Sanitisation ────────────────────────────────────────────────────────── */

/**
 * Tags that can execute code, load remote documents, or submit data. Everything
 * else — tables, inline styles, `<style>`, images, links — survives, because
 * that is what an email layout is built from.
 */
const BLOCKED_TAGS = [
  "script",
  "iframe",
  "frameset",
  "frame",
  "object",
  "embed",
  "applet",
  "form",
  "input",
  "button",
  "textarea",
  "select",
  "option",
  "base",
  "meta",
  "link",
  "svg",
  "math",
] as const;

/**
 * Decode numeric/named entities in an attribute value before checking its
 * scheme: `java&#115;cript:` is still JavaScript to a browser.
 */
function decodeAttributeValue(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_match: string, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/&#(\d+);?/g, (_match: string, decimal: string) =>
      String.fromCharCode(Number.parseInt(decimal, 10)),
    )
    .replace(/&colon;/gi, ":")
    .replace(/&newline;/gi, "")
    .replace(/&tab;/gi, "");
}

function stripTag(html: string, tag: string, removed: Set<string>): string {
  const paired = new RegExp(`<\\s*${tag}\\b[^>]*>[\\s\\S]*?<\\s*\\/\\s*${tag}\\s*>`, "gi");
  let out = html.replace(paired, () => {
    removed.add(`<${tag}>`);
    return "";
  });
  const standalone = new RegExp(`<\\s*${tag}\\b[^>]*\\/?>`, "gi");
  out = out.replace(standalone, () => {
    removed.add(`<${tag}>`);
    return "";
  });
  return out;
}

export type SanitizedHtml = {
  html: string;
  /** Human-readable list of what was stripped, for an admin warning toast. */
  removed: string[];
};

/**
 * Server-side sanitiser. Strips executable markup while keeping the standard
 * email HTML/CSS structure. It is intentionally deny-list based on the tag
 * level plus attribute-level checks: email layouts need inline `style`, a
 * `<style>` block, tables, images and links, and all of those must survive.
 */
export function sanitizeEmailHtml(input: string): SanitizedHtml {
  const removed = new Set<string>();
  let html = String(input ?? "");

  for (const tag of BLOCKED_TAGS) html = stripTag(html, tag, removed);

  // Inline event handlers: onclick, onload, onerror, …
  html = html.replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, () => {
    removed.add("inline event handler");
    return "";
  });

  // Script-bearing URL schemes in any navigation or resource attribute.
  html = html.replace(
    /((?:href|src|action|formaction|poster|background)\s*=\s*)("([^"]*)"|'([^']*)'|([^\s>]+))/gi,
    (match: string, prefix: string, _quoted: string, doubleQuoted: string, singleQuoted: string, bare: string) => {
      const value = decodeAttributeValue(String(doubleQuoted ?? singleQuoted ?? bare ?? ""))
        .replace(/\s+/g, "");
      if (/^(?:javascript|vbscript):/i.test(value) || /^data:text\/html/i.test(value)) {
        removed.add("script URL");
        return "";
      }
      return match;
    },
  );

  // CSS that executes: expression(), behavior:, @import and javascript: URLs.
  html = html.replace(
    /(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi,
    (_match: string, open: string, css: string, close: string) => {
      let cleaned = css;
      cleaned = cleaned.replace(/@import[^;]*;?/gi, () => {
        removed.add("@import in <style>");
        return "";
      });
      cleaned = cleaned.replace(/expression\s*\(/gi, () => {
        removed.add("CSS expression()");
        return "";
      });
      cleaned = cleaned.replace(/behavior\s*:[^;}]*/gi, () => {
        removed.add("CSS behavior");
        return "";
      });
      cleaned = cleaned.replace(/javascript\s*:/gi, () => {
        removed.add("script URL");
        return "";
      });
      return `${open}${cleaned}${close}`;
    },
  );

  // The same checks, inside a style attribute.
  html = html.replace(/\s+style\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi, (match: string, _quoted: string, dq: string, sq: string, bare: string) => {
    const value = String(dq ?? sq ?? bare ?? "");
    if (/expression\s*\(|behavior\s*:|javascript\s*:/i.test(value)) {
      removed.add("CSS expression()");
      return "";
    }
    return match;
  });

  // Belt and braces: an unclosed <style> block never matched the paired pass
  // above, so expression() is cleared document-wide as a final step.
  html = html.replace(/expression\s*\(/gi, () => {
    removed.add("CSS expression()");
    return "";
  });

  // A stray, unclosed script body is not executable markup, but it has no place
  // in a layout. Remove the opening tag if it survived the paired pass.
  html = html.replace(/<\s*script\b[\s\S]*$/gi, () => {
    removed.add("<script>");
    return "";
  });

  return { html: html.trim(), removed: [...removed] };
}

/* ── Placeholder parsing ─────────────────────────────────────────────────── */

const PLACEHOLDER = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function extractTemplateVariables(html: string): string[] {
  const found = new Set<string>();
  for (const match of String(html ?? "").matchAll(PLACEHOLDER)) {
    if (match[1]) found.add(match[1]);
  }
  return [...found];
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Replace approved placeholders with escaped values. Unknown placeholders are
 * impossible in a stored row (validation rejects them), but an empty string is
 * used anyway so a future schema change cannot leak `{{token}}` to a customer.
 */
export function renderEmailTemplate(
  html: string,
  values: Record<string, string | number | null | undefined>,
): string {
  return String(html ?? "").replace(PLACEHOLDER, (_match, key: string) => {
    const value = values[key];
    if (value === undefined || value === null) return "";
    return escapeHtml(String(value));
  });
}

/* ── Validation ──────────────────────────────────────────────────────────── */

export type EmailTemplateInput = {
  title: string;
  serviceType: TemplateServiceType;
  description?: string;
  thumbnailUrl?: string;
  htmlContent: string;
  priceCredits?: number;
  isActive?: boolean;
};

export type ValidatedTemplate = {
  title: string;
  serviceType: TemplateServiceType;
  description: string;
  thumbnailUrl: string;
  htmlContent: string;
  priceCredits: number;
  isActive: boolean;
  removed: string[];
};

export type TemplateValidation =
  | { ok: true; value: ValidatedTemplate }
  | { ok: false; errors: Record<string, string> };

const HTTP_URL = /^https?:\/\/[^\s]+$/i;
const IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g|gif|webp|svg\+xml);base64,[a-z0-9+/=\s]+$/i;

/**
 * Validate and sanitise one product. Unknown placeholders are a hard error: the
 * template must only reference tags defined for its service type.
 */
export function validateEmailTemplate(raw: unknown): TemplateValidation {
  const errors: Record<string, string> = {};
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const title = typeof input.title === "string" ? input.title.trim() : "";
  if (title.length < 3) errors.title = "Give the template a title of at least 3 characters.";
  else if (title.length > LIMITS.title) errors.title = `Keep the title under ${LIMITS.title} characters.`;

  const serviceType = input.serviceType;
  if (!isTemplateServiceType(serviceType)) {
    errors.serviceType = "Choose one of: " + TEMPLATE_SERVICE_TYPES.map((type) => type.id).join(", ") + ".";
  }

  const description = typeof input.description === "string" ? input.description.trim() : "";
  if (description.length > LIMITS.description) {
    errors.description = `Keep the description under ${LIMITS.description} characters.`;
  }

  const thumbnailUrl = typeof input.thumbnailUrl === "string" ? input.thumbnailUrl.trim() : "";
  if (thumbnailUrl) {
    if (thumbnailUrl.length > LIMITS.thumbnail) {
      errors.thumbnailUrl = "That image is too large — use one under 1.8 MB.";
    } else if (!HTTP_URL.test(thumbnailUrl) && !IMAGE_DATA_URL.test(thumbnailUrl)) {
      errors.thumbnailUrl = "Use an https image URL or upload a PNG, JPG, GIF, WebP or SVG file.";
    }
  }

  const rawHtml = typeof input.htmlContent === "string" ? input.htmlContent : "";
  if (!rawHtml.trim()) errors.htmlContent = "Paste the template HTML.";
  else if (rawHtml.length > LIMITS.html) {
    errors.htmlContent = `HTML templates are limited to ${Math.round(LIMITS.html / 1000)} KB.`;
  }

  let priceCredits = 0;
  if (input.priceCredits !== undefined && input.priceCredits !== null && input.priceCredits !== "") {
    const numeric = typeof input.priceCredits === "number" ? input.priceCredits : Number(input.priceCredits);
    if (!Number.isFinite(numeric) || numeric < 0) {
      errors.priceCredits = "Price must be a positive number of credits (0 = free).";
    } else if (numeric > LIMITS.priceCredits) {
      errors.priceCredits = `Cap the price at ${LIMITS.priceCredits} credits.`;
    } else {
      priceCredits = Math.round(numeric * 100) / 100;
    }
  }

  let isActive = true;
  if (typeof input.isActive === "boolean") isActive = input.isActive;

  const sanitized = sanitizeEmailHtml(rawHtml);
  if (rawHtml.trim() && !sanitized.html.trim()) {
    errors.htmlContent = "That HTML contained only executable markup, so nothing was left to save.";
  }

  if (isTemplateServiceType(serviceType) && sanitized.html.trim()) {
    const allowed = VARIABLE_KEYS[serviceType];
    const unknown = extractTemplateVariables(sanitized.html).filter((key) => !allowed.has(key));
    if (unknown.length > 0) {
      errors.htmlContent =
        `Unknown placeholder${unknown.length === 1 ? "" : "s"} ` +
        unknown.map((key) => `{{${key}}}`).join(", ") +
        ` for ${serviceType}. Use only the approved variables for this service type.`;
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      title,
      serviceType: serviceType as TemplateServiceType,
      description,
      thumbnailUrl,
      htmlContent: sanitized.html,
      priceCredits,
      isActive,
      removed: sanitized.removed,
    },
  };
}

/* ── Context builders (shared by the API and the customer previews) ──────── */

const STATUS_LABELS: Record<string, string> = {
  success: "Success",
  pending: "Pending",
  on_hold: "On hold",
  SENT: "Sent",
  PENDING: "Pending",
  FAILED: "Failed",
};

export function templateStatusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export function templateDate(ms?: number): string {
  const date = typeof ms === "number" && Number.isFinite(ms) ? new Date(ms) : new Date();
  return `${date.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "UTC",
  })} UTC`;
}

function templateAmount(amount: number | string): string {
  const numeric = typeof amount === "number" ? amount : Number(String(amount).replace(/,/g, ""));
  if (!Number.isFinite(numeric)) return "0.00";
  return numeric.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export type BankTemplateParty = {
  fullName: string;
  email: string;
  accountNumber: string;
  bankName: string;
};

export type BankTemplateContext = {
  platformName: string;
  kind: "debit" | "credit";
  payload: {
    transaction: { amount: number | string; currency: string; status: string };
    sender: BankTemplateParty;
    receiver: BankTemplateParty;
    referenceCode?: string;
    transactionId: string;
    remarks?: string;
    supportLink?: string;
    occurredAt?: number;
  };
};

/**
 * Values for one bank notice leg. `party_*` is the recipient of *this* notice
 * (the sender receives the debit notice, the receiver the credit notice), so a
 * layout can address the reader without knowing which leg it is rendering.
 */
export function bankTemplateVariables(context: BankTemplateContext): Record<string, string> {
  const { payload, kind, platformName } = context;
  const party = kind === "debit" ? payload.sender : payload.receiver;
  return {
    brand_name: platformName,
    customer_name: party.fullName,
    notice_type: kind === "debit" ? "Debit notice" : "Credit notice",
    amount: templateAmount(payload.transaction.amount),
    currency: payload.transaction.currency,
    transaction_id: payload.transactionId,
    reference: payload.referenceCode ?? "",
    status: templateStatusLabel(payload.transaction.status),
    date: templateDate(payload.occurredAt),
    description: payload.remarks ?? "",
    party_name: party.fullName,
    party_email: party.email,
    party_account: party.accountNumber,
    party_bank: party.bankName,
    sender_name: payload.sender.fullName,
    sender_email: payload.sender.email,
    sender_account: payload.sender.accountNumber,
    sender_bank: payload.sender.bankName,
    receiver_name: payload.receiver.fullName,
    receiver_email: payload.receiver.email,
    receiver_account: payload.receiver.accountNumber,
    receiver_bank: payload.receiver.bankName,
    support_link: payload.supportLink ?? "",
  };
}

export type TransactionTemplateContext = {
  platformName: string;
  brandName: string;
  recipientEmail: string;
  noticeType: string;
  amount: string | number;
  currency: string;
  transactionId: string;
  status?: string;
  message?: string;
  supportLink?: string;
  occurredAt?: number;
};

export function transactionTemplateVariables(
  context: TransactionTemplateContext,
): Record<string, string> {
  return {
    brand_name: context.brandName || context.platformName,
    customer_name: context.brandName || context.platformName,
    notice_type: context.noticeType,
    amount: templateAmount(context.amount),
    currency: context.currency,
    transaction_id: context.transactionId,
    status: templateStatusLabel(context.status ?? "SENT"),
    message: context.message ?? "",
    date: templateDate(context.occurredAt),
    recipient_email: context.recipientEmail,
    support_link: context.supportLink ?? "",
  };
}

/** Render a stored layout with its service type's sample values (admin preview). */
export function renderTemplateSample(html: string, serviceType: TemplateServiceType): string {
  return renderEmailTemplate(html, sampleTemplateVariables(serviceType));
}
