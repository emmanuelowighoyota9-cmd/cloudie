/**
 * Transaction Mail Studio — payload contract, validation, the unit price and the
 * notification templates.
 *
 * One module owns all of it because the live preview and the delivery path must
 * agree byte for byte: the composer renders `renderTransactionMail` into an
 * iframe, and `POST /api/v1/transaction-mailer/send` renders the very same
 * function before dispatch. A copy would drift and a user would review an email
 * that never leaves the platform.
 *
 * ── Why this is a self-test studio, not a mass mailer ─────────────────────
 * The recipient is never part of the payload: the route takes it from the
 * authenticated session, so a send always lands in the account owner's own
 * inbox. Templates are generic notification layouts rendered in the operator's
 * own brand — they carry no third-party logos or names — and every rendered
 * message prints a test-delivery strip and a simulation footer. The point is to
 * check how your transactional email renders in a real client, with a real log
 * of what was sent.
 *
 * Nothing here touches the network or the database, so it is importable from
 * the browser, from `api/`, and from the test runner.
 */

/* ── Service key & pricing ───────────────────────────────────────────────── */

/** Billable service key (see the admin price catalog). */
export const TRANSACTION_MAILER_SERVICE = "transaction_mailer_send";

/** One email reaches a single recipient: half a two-recipient notice pair. */
export const TRANSACTION_MAILER_CREDITS = 5;

/** At the platform's default ₦15 per credit (5 × ₦15). */
export const TRANSACTION_MAILER_PRICE_NGN = 75;

/* ── Enums ───────────────────────────────────────────────────────────────── */

export const NOTICE_TYPES = [
  { id: "deposit", label: "Deposit" },
  { id: "withdrawal", label: "Withdrawal" },
  { id: "transfer", label: "Transfer confirmation" },
  { id: "security", label: "Security alert" },
] as const;

export type NoticeType = (typeof NOTICE_TYPES)[number]["id"];

/** Asset / currency symbols the composer offers. Fiat legs are allowed too. */
export const ASSETS = [
  "BTC",
  "ETH",
  "USDT",
  "USDC",
  "BNB",
  "SOL",
  "XRP",
  "ADA",
  "DOGE",
  "TRX",
  "NGN",
  "USD",
  "EUR",
  "GBP",
] as const;

export type Asset = (typeof ASSETS)[number];

export type TemplateTier = "GLOBAL" | "GOLD" | "PRO" | "PREMIUM";

export type TransactionMailTemplate = {
  key: string;
  name: string;
  tagline: string;
  tier: TemplateTier;
  /** Small accent used by the card badge and the status pill — never a brand logo. */
  accent: string;
  /** Notice type the composer opens with; the user can change it. */
  noticeType: NoticeType;
};

/**
 * The template catalog. Deliberately generic: these describe *kinds of
 * notification*, not other companies. A user's message is always rendered in
 * their own brand (see `MailBrand`), so nothing here impersonates a provider.
 */
export const TRANSACTION_MAIL_TEMPLATES: readonly TransactionMailTemplate[] = [
  {
    key: "crypto_deposit",
    name: "Crypto Deposit",
    tagline: "Incoming on-chain funds, confirmed.",
    tier: "GLOBAL",
    accent: "#10b981",
    noticeType: "deposit",
  },
  {
    key: "crypto_withdrawal",
    name: "Crypto Withdrawal",
    tagline: "Outbound transfer has left the wallet.",
    tier: "GOLD",
    accent: "#f59e0b",
    noticeType: "withdrawal",
  },
  {
    key: "wallet_credit",
    name: "Wallet Credit",
    tagline: "Balance topped up and instantly available.",
    tier: "PRO",
    accent: "#38bdf8",
    noticeType: "deposit",
  },
  {
    key: "card_debit",
    name: "Card Debit",
    tagline: "A card purchase settled on the account.",
    tier: "GLOBAL",
    accent: "#a1a1aa",
    noticeType: "withdrawal",
  },
  {
    key: "bank_transfer",
    name: "Bank Transfer",
    tagline: "The fiat leg of a transfer completed.",
    tier: "PREMIUM",
    accent: "#34d399",
    noticeType: "transfer",
  },
  {
    key: "security_alert",
    name: "Security Alert",
    tagline: "New sign-in or key change on the account.",
    tier: "PRO",
    accent: "#ef4444",
    noticeType: "security",
  },
] as const;

export function findTemplate(key: string): TransactionMailTemplate | undefined {
  return TRANSACTION_MAIL_TEMPLATES.find((template) => template.key === key);
}

/* ── Brand ───────────────────────────────────────────────────────────────── */

/**
 * The operator's own brand, resolved server-side: the account's organization
 * name when set, otherwise the platform brand. The composer cannot type a brand
 * name, so a template cannot be re-labelled as someone else's company.
 */
export type MailBrand = {
  name: string;
  accent: string;
  logo?: string;
};

/* ── Payload ─────────────────────────────────────────────────────────────── */

export type TransactionMailPayload = {
  templateKey: string;
  noticeType: NoticeType;
  /** Amount as typed by the user, e.g. "0.05". Kept as a string: no float drift. */
  amount: string;
  /** Asset symbol, e.g. "BTC". Stored as `currency` in mail_logs. */
  currency: string;
  walletAddress?: string;
  txHash: string;
  /** Epoch milliseconds for the transaction time shown in the message. */
  occurredAt: number;
  note?: string;
};

/* ── Limits ──────────────────────────────────────────────────────────────── */

const LIMITS = {
  amount: 20,
  address: 120,
  txHash: 80,
  note: 200,
} as const;

const AMOUNT_RE = /^\d{1,15}(\.\d{1,8})?$/;
const ADDRESS_RE = /^[A-Za-z0-9:._ -]{6,120}$/;
const TX_HASH_RE = /^[A-Za-z0-9-]{6,80}$/;

/* ── Helpers ─────────────────────────────────────────────────────────────── */

/** HTML entity map built from escapes, so the source never holds a literal entity. */
const HTML_ENTITIES: Record<string, string> = {
  "&": "\u0026amp;",
  "<": "\u0026lt;",
  ">": "\u0026gt;",
  "\"": "\u0026quot;",
  "'": "\u0026#39;",
};

export function escapeHtml(value: string): string {
  return String(value ?? "").replace(/[&<>"']/g, (char) => HTML_ENTITIES[char] ?? char);
}

function randomBytes(length: number): Uint8Array {
  const bytes = new Uint8Array(length);
  const cryptoObj: Crypto | undefined =
    typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (cryptoObj?.getRandomValues) cryptoObj.getRandomValues(bytes);
  else for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  return bytes;
}

/** 32-byte hex reference, generated when the user leaves the field blank. */
export function generateTxHash(): string {
  return Array.from(randomBytes(32), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * Deterministic UTC formatting. `toLocaleString` differs between Node and the
 * browser, and a preview that disagrees with the delivered email by one hour is
 * exactly the drift this module exists to prevent.
 */
export function formatDateTimeUtc(ms: number): string {
  const date = new Date(ms);
  if (Number.isNaN(date.getTime())) return "—";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getUTCDate()} ${MONTHS[date.getUTCMonth()]} ${date.getUTCFullYear()}, ${pad(
    date.getUTCHours(),
  )}:${pad(date.getUTCMinutes())} UTC`;
}

/** `1234abcd…9f21` — a hash is long enough to make a useful inline label. */
export function shortHash(hash: string): string {
  const value = String(hash ?? "");
  if (value.length <= 16) return value;
  return `${value.slice(0, 8)}…${value.slice(-6)}`;
}

function formatAmount(amount: string, currency: string): string {
  return `${amount} ${currency}`.trim();
}

/* ── Validation ──────────────────────────────────────────────────────────── */

export type ValidationOk = { ok: true; value: TransactionMailPayload };
export type ValidationFail = { ok: false; errors: Record<string, string> };
export type ValidationResult = ValidationOk | ValidationFail;

type Raw = Record<string, unknown>;

function asRecord(value: unknown): Raw {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * Full schema check: required fields, formats, enum membership. Every failure is
 * returned at once so the form marks all of them instead of making the user
 * resubmit to discover the next problem.
 */
export function validateTransactionMailPayload(rawInput: unknown): ValidationResult {
  const raw = asRecord(rawInput);
  const errors: Record<string, string> = {};

  const templateKey = str(raw.templateKey);
  if (!findTemplate(templateKey)) errors.templateKey = "Choose a template.";

  const noticeTypeRaw = str(raw.noticeType);
  const noticeType = (NOTICE_TYPES.some((type) => type.id === noticeTypeRaw)
    ? noticeTypeRaw
    : "deposit") as NoticeType;
  if (!NOTICE_TYPES.some((type) => type.id === noticeTypeRaw)) {
    errors.noticeType = "Choose a transaction type.";
  }

  const amount = str(raw.amount).replace(/,/g, "");
  if (!amount) errors.amount = "Enter an amount.";
  else if (!AMOUNT_RE.test(amount)) errors.amount = "Digits with up to 8 decimals (e.g. 0.05).";
  else if (Number(amount) <= 0) errors.amount = "Enter an amount greater than zero.";
  else if (amount.length > LIMITS.amount) errors.amount = "That amount is too large.";

  const currency = str(raw.currency).toUpperCase();
  if (!ASSETS.includes(currency as Asset)) {
    errors.currency = "Choose an asset from the list.";
  }

  const walletAddress = str(raw.walletAddress);
  if (walletAddress && !ADDRESS_RE.test(walletAddress)) {
    errors.walletAddress = "6–120 letters, digits, spaces, dots, dashes or colons.";
  }

  let txHash = str(raw.txHash);
  if (!txHash) txHash = generateTxHash();
  else if (!TX_HASH_RE.test(txHash)) {
    errors.txHash = "6–80 letters, digits or dashes (or leave blank to generate one).";
  }

  const occurredAtRaw = raw.occurredAt;
  const occurredAt =
    typeof occurredAtRaw === "number"
      ? occurredAtRaw
      : typeof occurredAtRaw === "string" && occurredAtRaw.trim() !== ""
        ? Number(occurredAtRaw)
        : Date.now();
  if (!Number.isFinite(occurredAt)) errors.occurredAt = "Enter a valid date and time.";
  else if (occurredAt < Date.UTC(2020, 0, 1)) errors.occurredAt = "That date is too far in the past.";
  else if (occurredAt > Date.now() + 86_400_000) errors.occurredAt = "That date is in the future.";

  const note = str(raw.note);
  if (note.length > LIMITS.note) errors.note = `Keep it under ${LIMITS.note} characters.`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      templateKey,
      noticeType,
      amount,
      currency,
      ...(walletAddress ? { walletAddress } : {}),
      txHash,
      occurredAt,
      ...(note ? { note } : {}),
    },
  };
}

/* ── Copy ────────────────────────────────────────────────────────────────── */

type Copy = {
  heading: string;
  lead: string;
  amountLabel: string;
  status: string;
  rows: { amount: string; asset: string; wallet: string; hash: string; when: string; note: string };
};

const COPY: Record<NoticeType, Copy> = {
  deposit: {
    heading: "Deposit received",
    lead: "Funds have landed in the account below and are available for use.",
    amountLabel: "Amount received",
    status: "Simulated · credited",
    rows: {
      amount: "Amount",
      asset: "Asset",
      wallet: "Wallet",
      hash: "Transaction hash",
      when: "Recorded",
      note: "Note",
    },
  },
  withdrawal: {
    heading: "Withdrawal sent",
    lead: "An outbound transfer has left the account below.",
    amountLabel: "Amount sent",
    status: "Simulated · debited",
    rows: {
      amount: "Amount",
      asset: "Asset",
      wallet: "Destination wallet",
      hash: "Transaction hash",
      when: "Recorded",
      note: "Note",
    },
  },
  transfer: {
    heading: "Transfer confirmed",
    lead: "The transfer between the wallets below has completed.",
    amountLabel: "Amount transferred",
    status: "Simulated · settled",
    rows: {
      amount: "Amount",
      asset: "Asset",
      wallet: "Counterparty wallet",
      hash: "Transaction hash",
      when: "Recorded",
      note: "Note",
    },
  },
  security: {
    heading: "Security notice",
    lead: "A sign-in or key change was recorded on the account below.",
    amountLabel: "Reference amount",
    status: "Simulated · reviewed",
    rows: {
      amount: "Reference amount",
      asset: "Asset",
      wallet: "Session wallet",
      hash: "Event reference",
      when: "Recorded",
      note: "Note",
    },
  },
};

/** Hex colours only: the accent reaches inline styles, so nothing else may pass. */
function safeAccent(value: string | undefined): string {
  const accent = (value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#10b981";
}

function safeImageSrc(value: string | undefined): string | null {
  const v = (value ?? "").trim();
  if (!v || v.length > 2_000_000) return null;
  if (/^https?:\/\/\S+$/i.test(v)) return v;
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(v)) return v;
  return null;
}

/* ── Rendering ───────────────────────────────────────────────────────────── */

export type RenderedMail = { subject: string; html: string; text: string };

/**
 * Render one notification. Every interpolated value is escaped; the only raw
 * markup in the output is this template itself, which is why the same function
 * is safe to show in a sandboxed iframe and safe to hand to the mail provider.
 */
export function renderTransactionMail(input: {
  payload: TransactionMailPayload;
  brand: MailBrand;
  platformName: string;
}): RenderedMail {
  const { payload, brand, platformName } = input;
  const template = findTemplate(payload.templateKey) ?? TRANSACTION_MAIL_TEMPLATES[0];
  const copy = COPY[payload.noticeType] ?? COPY.deposit;
  const accent = safeAccent(brand.accent);
  const brandName = (brand.name || platformName || "Cloudie").slice(0, 80);
  const logo = safeImageSrc(brand.logo);

  const amount = formatAmount(payload.amount, payload.currency);
  const when = formatDateTimeUtc(payload.occurredAt);
  const subject = `${template.name} (test) — ${amount}`;

  const detailRows: Array<[string, string]> = [
    [copy.rows.amount, amount],
    [copy.rows.asset, payload.currency],
    ...(payload.walletAddress ? ([[copy.rows.wallet, payload.walletAddress]] as Array<[string, string]>) : []),
    [copy.rows.hash, payload.txHash],
    [copy.rows.when, when],
    ...(payload.note ? ([[copy.rows.note, payload.note]] as Array<[string, string]>) : []),
  ];

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">Test delivery from ${escapeHtml(
    platformName,
  )} — ${escapeHtml(copy.heading)} for ${escapeHtml(amount)}.</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;padding:28px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:100%;background:#ffffff;border-radius:16px;border:1px solid #e4e4e7;overflow:hidden;">
          <tr>
            <td style="background:#0b0b0b;padding:22px 28px;border-bottom:3px solid ${accent};">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="vertical-align:middle;">
                    ${
                      logo
                        ? `<img src="${escapeHtml(logo)}" alt="${escapeHtml(
                            brandName,
                          )}" height="26" style="display:block;height:26px;max-width:150px;">`
                        : `<span style="font-size:15px;font-weight:700;letter-spacing:-0.01em;color:#ffffff;">${escapeHtml(
                            brandName,
                          )}</span>`
                    }
                  </td>
                  <td align="right" style="vertical-align:middle;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#a1a1aa;font-weight:700;">
                    ${escapeHtml(template.name)}
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="background:#fef7e6;padding:10px 28px;font-size:11px;line-height:1.5;color:#8a5a00;font-weight:600;letter-spacing:.02em;">
              Test delivery — this simulated notice was sent to the account owner's own inbox and confirms nothing.
            </td>
          </tr>
          <tr>
            <td style="padding:30px 28px 8px;">
              <p style="margin:0 0 8px;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#71717a;font-weight:700;">${escapeHtml(
                template.name,
              )}</p>
              <h1 style="margin:0 0 10px;font-size:23px;line-height:1.25;letter-spacing:-0.02em;color:#0b0b0b;font-weight:700;">${escapeHtml(
                copy.heading,
              )}</h1>
              <p style="margin:0;font-size:14px;line-height:1.65;color:#52525b;">${escapeHtml(copy.lead)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fafafa;border:1px solid #e4e4e7;border-radius:14px;">
                <tr>
                  <td align="center" style="padding:22px 18px;">
                    <p style="margin:0;font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:#71717a;font-weight:700;">${escapeHtml(
                      copy.amountLabel,
                    )}</p>
                    <p style="margin:8px 0 12px;font-size:32px;line-height:1.1;letter-spacing:-0.03em;color:#0b0b0b;font-weight:800;">${escapeHtml(
                      amount,
                    )}</p>
                    <span style="display:inline-block;padding:5px 13px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.02em;color:${
                      accent === "#10b981" ? "#065f46" : "#3f3f46"
                    };background:${accent}1a;">${escapeHtml(copy.status)}</span>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 24px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:13px;">
                ${detailRows
                  .map(
                    ([label, value]) =>
                      `<tr><td style="padding:9px 0;border-bottom:1px solid #f4f4f5;color:#71717a;">${escapeHtml(
                        label,
                      )}</td><td style="padding:9px 0;border-bottom:1px solid #f4f4f5;text-align:right;color:#18181b;font-weight:600;word-break:break-all;">${escapeHtml(
                        value,
                      )}</td></tr>`,
                  )
                  .join("")}
              </table>
            </td>
          </tr>
          <tr>
            <td style="padding:0 28px 28px;">
              <p style="margin:0;font-size:13px;line-height:1.65;color:#52525b;">
                Questions about this notice? Reply to this message — it reaches the ${escapeHtml(
                  brandName,
                )} team directly.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#fafafa;border-top:1px solid #e4e4e7;padding:18px 28px;">
              <p style="margin:0;font-size:11px;line-height:1.7;color:#71717a;">
                Simulation generated with ${escapeHtml(platformName)}. This message is a design preview delivered to the
                account owner only: it records no transfer, moves no funds and confirms no transaction.
              </p>
              <p style="margin:8px 0 0;font-size:11px;line-height:1.7;color:#a1a1aa;">
                ${escapeHtml(brandName)} · sent from the ${escapeHtml(platformName)} template studio
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    subject,
    "",
    `${brandName} — ${copy.heading}`,
    copy.lead,
    "",
    `${copy.amountLabel}: ${amount}`,
    ...detailRows.slice(1).map(([label, value]) => `${label}: ${value}`),
    "",
    "Test delivery: this simulated notice was sent to the account owner's own inbox and confirms nothing.",
    `Simulation generated with ${platformName}. It records no transfer, moves no funds and confirms no transaction.`,
  ].join("\n");

  return { subject, html, text };
}
