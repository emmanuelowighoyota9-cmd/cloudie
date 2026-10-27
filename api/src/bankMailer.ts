/**
 * Bank Mailer — payload contract, validation, the price, and the two notice
 * templates.
 *
 * One module owns all of it because the preview and the sending path have to
 * agree byte for byte: the form renders `renderBankNotice` in an iframe, and
 * `POST /api/v1/bank-mailer/send` renders the very same function before
 * dispatch. A copy would drift, and a user would review an email that never
 * leaves the platform. The module therefore lives inside `api/` — the API's
 * tsconfig has `rootDir: src`, so this is the one directory both the server
 * and the browser bundle can import.
 *
 * Nothing here touches the network or the database, so it is importable from
 * the browser, from `api/`, and from `bun test`.
 *
 * ── Honest-use note ────────────────────────────────────────────────────────
 * These notices are simulated records composed by the user. They move no money
 * and confirm nothing, so both templates print that fact in the footer — the
 * same stance the rest of Cloudie takes on generated documents.
 */

/* ── Service key ─────────────────────────────────────────────────────────── */

/** Billable service key (see `convex/catalog.ts` / the admin price catalog). */
export const BANK_MAILER_SERVICE = "bank_mailer_send";

/* ── Pricing ─────────────────────────────────────────────────────────────── */

/**
 * Credits charged for one send — one debit notice plus one credit notice.
 *
 * Derived from the platform's standard delivery rate: `email_per_recipient`
 * costs 5 credits and a pair reaches two recipients. The form's cost line and
 * the API both read this constant, so the price a user sees is exactly the
 * price their wallet is charged.
 */
export const BANK_MAILER_CREDITS = 10;

/**
 * NGN charged for one send, at the platform's default 15 ₦ per credit rate
 * (10 credits × ₦15). This is the amount `POST /api/v1/bank-mailer/send`
 * debits from the wallet before dispatching, and refunds if dispatch fails.
 */
export const BANK_MAILER_PRICE_NGN = 150;

/* ── Enums ───────────────────────────────────────────────────────────────── */

export const NOTICE_STATUSES = [
  { id: "success", label: "Success" },
  { id: "pending", label: "Pending" },
  { id: "on_hold", label: "On Hold" },
] as const;

export type NoticeStatus = (typeof NOTICE_STATUSES)[number]["id"];

export const NOTICE_LANGUAGES = [
  { id: "en", label: "English" },
  { id: "fr", label: "Français" },
  { id: "es", label: "Español" },
] as const;

export type NoticeLanguage = (typeof NOTICE_LANGUAGES)[number]["id"];

/* ── Payload ─────────────────────────────────────────────────────────────── */

export type BankParty = {
  fullName: string;
  email: string;
  accountNumber: string;
  bankName: string;
  bankCountry: string;
  bankAddress: string;
  bankPhone?: string;
  bankLogo?: string;
};

export type BankMailerPayload = {
  transaction: {
    amount: number;
    currency: string;
    status: NoticeStatus;
    language: NoticeLanguage;
  };
  sender: BankParty;
  receiver: BankParty;
  referenceCode?: string;
  transactionId: string;
  remarks?: string;
  supportLink?: string;
  warningBanner?: string;
};

export type NoticeKind = "debit" | "credit";

/* ── Limits ──────────────────────────────────────────────────────────────── */

const LIMITS = {
  name: 80,
  email: 160,
  account: 34,
  bank: 90,
  country: 60,
  address: 160,
  phone: 32,
  reference: 40,
  transactionId: 32,
  remarks: 300,
  supportLink: 400,
  warning: 200,
  logo: 2_000_000,
} as const;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const CURRENCY_RE = /^[A-Z]{3}$/;
const ACCOUNT_RE = /^[A-Za-z0-9 -]{4,34}$/;
const TXN_ID_RE = /^[A-Za-z0-9-]{4,32}$/;

/* ── Small helpers ───────────────────────────────────────────────────────── */

/**
 * 12-character alphanumeric transaction id, generated when the user leaves the
 * field blank. Uses the platform's CSPRNG where it exists (Convex, browsers)
 * and falls back to `Math.random` in constrained runtimes — this id is a
 * correlation handle, not a secret.
 */
export function generateTransactionId(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = new Uint8Array(12);
  const cryptoObj: Crypto | undefined =
    typeof globalThis !== "undefined" ? (globalThis.crypto as Crypto | undefined) : undefined;
  if (cryptoObj?.getRandomValues) {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

/** `0123456789` → `•••• 6789`. Short values are never echoed in full. */
export function maskAccount(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, "");
  if (digits.length === 0) return "••••";
  if (digits.length <= 4) return `•••• ${digits}`;
  return `•••• ${digits.slice(-4)}`;
}

/**
 * HTML entity map. Built from `\u0026` escapes so the source itself never
 * contains a literal entity — the runtime string is the real `&` etc.
 */
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

/** Only real image URLs reach an `<img src>`: https or an inline data URI. */
function safeImageSrc(value?: string): string | null {
  const v = (value ?? "").trim();
  if (!v || v.length > LIMITS.logo) return null;
  if (/^https:\/\/\S+$/i.test(v) || /^http:\/\/\S+$/i.test(v)) return v;
  if (/^data:image\/(png|jpe?g|gif|webp|svg\+xml);base64,[A-Za-z0-9+/=]+$/i.test(v)) return v;
  return null;
}

/** Outbound links must be plain http(s) — a `javascript:` href in mail is XSS. */
function safeLink(value?: string): string | null {
  const v = (value ?? "").trim();
  if (!v || v.length > LIMITS.supportLink) return null;
  return /^https?:\/\/\S+$/i.test(v) ? v : null;
}

function fill(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (match, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? vars[key] : match,
  );
}

function formatAmount(amount: number, currency: string): string {
  const numeric = Number.isFinite(amount) ? amount : 0;
  const body = numeric.toLocaleString("en-US", { maximumFractionDigits: 2 });
  return `${body} ${currency}`.trim();
}

/* ── Validation ──────────────────────────────────────────────────────────── */

export type ValidationOk = { ok: true; value: BankMailerPayload };
export type ValidationFail = { ok: false; errors: Record<string, string> };
export type ValidationResult = ValidationOk | ValidationFail;

type Raw = Record<string, unknown>;

function asRecord(value: unknown): Raw {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Raw) : {};
}

function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function validateParty(
  raw: unknown,
  path: "sender" | "receiver",
  errors: Record<string, string>,
): BankParty {
  const party = asRecord(raw);
  const pick = (key: string) => str(party[key]);
  const put = (key: string, message: string) => {
    if (!errors[`${path}.${key}`]) errors[`${path}.${key}`] = message;
  };

  const fullName = pick("fullName");
  const email = pick("email");
  const accountNumber = pick("accountNumber");
  const bankName = pick("bankName");
  const bankCountry = pick("bankCountry");
  const bankAddress = pick("bankAddress");
  const bankPhone = pick("bankPhone");
  const bankLogo = pick("bankLogo");

  if (fullName.length < 2) put("fullName", "Enter the full name.");
  else if (fullName.length > LIMITS.name) put("fullName", `Keep it under ${LIMITS.name} characters.`);

  if (!email) put("email", "Enter an email address.");
  else if (!EMAIL_RE.test(email) || email.length > LIMITS.email) put("email", "Enter a valid email address.");

  if (!accountNumber) put("accountNumber", "Enter the account number.");
  else if (!ACCOUNT_RE.test(accountNumber)) put("accountNumber", "4–34 letters, digits, spaces or dashes.");

  if (!bankName) put("bankName", "Enter the bank name.");
  else if (bankName.length > LIMITS.bank) put("bankName", `Keep it under ${LIMITS.bank} characters.`);

  if (!bankCountry) put("bankCountry", "Enter the bank country.");
  else if (bankCountry.length > LIMITS.country) put("bankCountry", `Keep it under ${LIMITS.country} characters.`);

  if (!bankAddress) put("bankAddress", "Enter the bank address.");
  else if (bankAddress.length > LIMITS.address) put("bankAddress", `Keep it under ${LIMITS.address} characters.`);

  if (bankPhone && bankPhone.length > LIMITS.phone) put("bankPhone", `Keep it under ${LIMITS.phone} characters.`);
  if (bankLogo && !safeImageSrc(bankLogo)) put("bankLogo", "Use an image URL or upload an image file.");

  return {
    fullName,
    email: email.toLowerCase(),
    accountNumber,
    bankName,
    bankCountry,
    bankAddress,
    ...(bankPhone ? { bankPhone } : {}),
    ...(bankLogo && safeImageSrc(bankLogo) ? { bankLogo: safeImageSrc(bankLogo)! } : {}),
  };
}

/**
 * Full schema check, mirroring the API contract: required fields, formats and
 * enum membership. Returns every error at once so the form can mark all of
 * them instead of making the user resubmit to discover the next problem.
 */
export function validateBankMailerPayload(rawInput: unknown): ValidationResult {
  const raw = asRecord(rawInput);
  const errors: Record<string, string> = {};

  const transaction = asRecord(raw.transaction);
  const amountRaw = transaction.amount;
  const amount =
    typeof amountRaw === "number"
      ? amountRaw
      : typeof amountRaw === "string" && amountRaw.trim() !== ""
        ? Number(amountRaw)
        : NaN;

  if (!Number.isFinite(amount) || amount <= 0) {
    errors["transaction.amount"] = "Enter an amount greater than zero.";
  } else if (amount > 1_000_000_000_000) {
    errors["transaction.amount"] = "That amount is too large.";
  }

  const currency = str(transaction.currency).toUpperCase();
  if (!CURRENCY_RE.test(currency)) errors["transaction.currency"] = "Use a 3-letter SWIFT code (USD, EUR, NGN).";

  const status = str(transaction.status) as NoticeStatus;
  if (!NOTICE_STATUSES.some((s) => s.id === status)) {
    errors["transaction.status"] = "Choose Success, Pending or On Hold.";
  }

  const languageRaw = str(transaction.language);
  const language = (NOTICE_LANGUAGES.some((l) => l.id === languageRaw) ? languageRaw : "en") as NoticeLanguage;

  const sender = validateParty(raw.sender, "sender", errors);
  const receiver = validateParty(raw.receiver, "receiver", errors);

  const referenceCode = str(raw.referenceCode);
  if (referenceCode.length > LIMITS.reference) {
    errors["referenceCode"] = `Keep it under ${LIMITS.reference} characters.`;
  }

  // Blank → generated. Present → must look like a transaction reference.
  let transactionId = str(raw.transactionId);
  if (!transactionId) transactionId = generateTransactionId();
  else if (!TXN_ID_RE.test(transactionId)) {
    errors["transactionId"] = "4–32 letters, digits or dashes (or leave it blank to generate one).";
  }

  const remarks = str(raw.remarks);
  if (remarks.length > LIMITS.remarks) errors["remarks"] = `Keep it under ${LIMITS.remarks} characters.`;

  const supportLink = str(raw.supportLink);
  if (supportLink && !safeLink(supportLink)) {
    errors["supportLink"] = "Use a full http:// or https:// link.";
  }

  const warningBanner = str(raw.warningBanner);
  if (warningBanner.length > LIMITS.warning) {
    errors["warningBanner"] = `Keep it under ${LIMITS.warning} characters.`;
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      transaction: { amount, currency, status, language },
      sender,
      receiver,
      ...(referenceCode ? { referenceCode } : {}),
      transactionId,
      ...(remarks ? { remarks } : {}),
      ...(supportLink ? { supportLink } : {}),
      ...(warningBanner ? { warningBanner } : {}),
    },
  };
}

/* ── Copy ────────────────────────────────────────────────────────────────── */

type Copy = Record<string, string>;

/**
 * Body copy per language. Every string is a template with `{placeholders}` —
 * no markup, no interpolation of raw user content before escaping.
 *
 * Unknown or unsupported languages fall back to English: sending a notice in
 * the wrong language is worse than sending it in the platform default.
 */
const COPY: Record<NoticeLanguage, Copy> = {
  en: {
    debitSubject: "Debit alert: {amount}",
    creditSubject: "Credit alert: {amount}",
    debitHeading: "Debit notification",
    creditHeading: "Credit notification",
    debitLead: "A transfer has been debited from the account below.",
    creditLead: "A transfer has been credited to the account below.",
    amount: "Amount",
    status: "Status",
    reference: "Reference",
    transactionId: "Transaction ID",
    narration: "Narration",
    date: "Date",
    fromLabel: "Debited party",
    toLabel: "Credited party",
    account: "Account number",
    bank: "Bank",
    country: "Country",
    address: "Address",
    phone: "Phone",
    statusSuccess: "Successful",
    statusPending: "Pending",
    statusOnHold: "On hold",
    support: "Contact support",
    disclaimer:
      "Simulated notice generated by {platform}. This is not a bank transfer confirmation — no funds move as a result of this message.",
    generatedBy: "Generated by {platform} · Bank Mailer",
  },
  fr: {
    debitSubject: "Alerte de débit : {amount}",
    creditSubject: "Alerte de crédit : {amount}",
    debitHeading: "Notification de débit",
    creditHeading: "Notification de crédit",
    debitLead: "Un virement a été débité du compte ci-dessous.",
    creditLead: "Un virement a été crédité sur le compte ci-dessous.",
    amount: "Montant",
    status: "Statut",
    reference: "Référence",
    transactionId: "ID de transaction",
    narration: "Motif",
    date: "Date",
    fromLabel: "Partie débitée",
    toLabel: "Partie créditée",
    account: "Numéro de compte",
    bank: "Banque",
    country: "Pays",
    address: "Adresse",
    phone: "Téléphone",
    statusSuccess: "Réussi",
    statusPending: "En attente",
    statusOnHold: "En attente de validation",
    support: "Contacter le support",
    disclaimer:
      "Avis simulé généré par {platform}. Ceci n'est pas une confirmation de virement — aucun fonds n'est déplacé par ce message.",
    generatedBy: "Généré par {platform} · Bank Mailer",
  },
  es: {
    debitSubject: "Alerta de débito: {amount}",
    creditSubject: "Alerta de crédito: {amount}",
    debitHeading: "Notificación de débito",
    creditHeading: "Notificación de crédito",
    debitLead: "Se ha debitado una transferencia de la cuenta indicada abajo.",
    creditLead: "Se ha acreditado una transferencia en la cuenta indicada abajo.",
    amount: "Importe",
    status: "Estado",
    reference: "Referencia",
    transactionId: "ID de transacción",
    narration: "Concepto",
    date: "Fecha",
    fromLabel: "Parte debida",
    toLabel: "Parte acreditada",
    account: "Número de cuenta",
    bank: "Banco",
    country: "País",
    address: "Dirección",
    phone: "Teléfono",
    statusSuccess: "Realizada",
    statusPending: "Pendiente",
    statusOnHold: "En espera",
    support: "Contactar soporte",
    disclaimer:
      "Aviso simulado generado por {platform}. Esto no es una confirmación de transferencia bancaria: no se mueve ningún fondo con este mensaje.",
    generatedBy: "Generado por {platform} · Bank Mailer",
  },
};

export function copyFor(language: string): Copy {
  return COPY[language as NoticeLanguage] ?? COPY.en;
}

function statusLabel(copy: Copy, status: NoticeStatus): string {
  if (status === "pending") return copy.statusPending;
  if (status === "on_hold") return copy.statusOnHold;
  return copy.statusSuccess;
}

function statusColour(status: NoticeStatus): string {
  if (status === "pending") return "#b45309";
  if (status === "on_hold") return "#1d4ed8";
  return "#15803d";
}

function statusTint(status: NoticeStatus): string {
  if (status === "pending") return "#fef3c7";
  if (status === "on_hold") return "#dbeafe";
  return "#dcfce7";
}

/* ── Template ────────────────────────────────────────────────────────────── */

export type RenderedNotice = { subject: string; html: string; text: string };

function logoMarkup(party: BankParty): string {
  const src = safeImageSrc(party.bankLogo);
  if (!src) return "";
  return `<img src="${escapeHtml(src)}" alt="${escapeHtml(party.bankName)}" width="72" height="72" style="display:block;width:72px;height:72px;border-radius:14px;object-fit:contain;background:#ffffff;border:1px solid #e2e8f0;" />`;
}

function partyBlock(copy: Copy, label: string, party: BankParty, masked: boolean): string {
  const rows: [string, string][] = [
    [copy.account, masked ? maskAccount(party.accountNumber) : party.accountNumber],
    [copy.bank, party.bankName],
    [copy.country, party.bankCountry],
    [copy.address, party.bankAddress],
  ];
  if (party.bankPhone) rows.push([copy.phone, party.bankPhone]);

  return `
        <div style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;background:#f8fafc;">
          <p style="margin:0 0 10px;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#64748b;font-weight:700;">${escapeHtml(label)}</p>
          <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#0f172a;">${escapeHtml(party.fullName)}</p>
          <p style="margin:0 0 12px;font-size:13px;color:#475569;">${escapeHtml(party.bankName)} · ${escapeHtml(party.bankCountry)}</p>
          <table style="width:100%;border-collapse:collapse;font-size:13px;">${rows
            .map(
              ([k, v]) =>
                `<tr><td style="padding:4px 0;color:#64748b;">${escapeHtml(k)}</td><td style="padding:4px 0;text-align:right;color:#0f172a;font-weight:600;">${escapeHtml(v)}</td></tr>`,
            )
            .join("")}</table>
        </div>`;
}

/**
 * Render one notice into a complete, self-contained email document.
 *
 * The same output is what the preview iframe shows, so what a user reviews is
 * byte-identical to what is delivered. Every dynamic value is escaped here;
 * the sending path re-validates the payload with `validateBankMailerPayload`
 * before this function ever runs.
 */
export function renderBankNotice(args: {
  kind: NoticeKind;
  payload: BankMailerPayload;
  platformName: string;
  sentAt?: Date;
}): RenderedNotice {
  const { kind, payload, platformName } = args;
  const sentAt = args.sentAt ?? new Date();
  const copy = copyFor(payload.transaction.language);

  const debit = kind === "debit";
  const party = debit ? payload.sender : payload.receiver;
  const counterparty = debit ? payload.receiver : payload.sender;

  const amount = formatAmount(payload.transaction.amount, payload.transaction.currency);
  const vars = {
    amount,
    currency: payload.transaction.currency,
    platform: platformName,
    bank: party.bankName,
  };

  const heading = debit ? copy.debitHeading : copy.creditHeading;
  const lead = debit ? copy.debitLead : copy.creditLead;
  const subject = fill(debit ? copy.debitSubject : copy.creditSubject, vars);

  const banner = payload.warningBanner
    ? `<div style="margin:0 0 20px;padding:12px 16px;border-radius:10px;background:#fef2f2;border:1px solid #fecaca;color:#991b1b;font-size:13px;font-weight:600;line-height:1.5;">${escapeHtml(payload.warningBanner)}</div>`
    : "";

  const detailRows: [string, string][] = [
    [copy.amount, amount],
    [copy.status, statusLabel(copy, payload.transaction.status)],
    [copy.date, sentAt.toISOString().replace("T", " ").slice(0, 16) + " UTC"],
    [copy.transactionId, payload.transactionId],
  ];
  if (payload.referenceCode) detailRows.splice(2, 0, [copy.reference, payload.referenceCode]);
  if (payload.remarks) detailRows.push([copy.narration, payload.remarks]);

  const support = payload.supportLink
    ? `<table cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0;"><tr><td align="center" bgcolor="#0f172a" style="border-radius:999px;">
            <a href="${escapeHtml(payload.supportLink)}" style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:999px;">${escapeHtml(copy.support)}</a>
          </td></tr></table>`
    : "";

  const html = `<!doctype html>
<html lang="${escapeHtml(payload.transaction.language)}">
<head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:24px;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0f172a;">
  <div style="max-width:600px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
    ${banner}
    <div style="padding:22px 24px;border-bottom:1px solid #e2e8f0;">
      <table cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>
        <td valign="middle">${logoMarkup(party)}</td>
        <td valign="middle" style="padding-left:14px;">
          <p style="margin:0;font-size:15px;font-weight:700;color:#0f172a;">${escapeHtml(party.bankName)}</p>
          <p style="margin:2px 0 0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#64748b;">${escapeHtml(heading)}</p>
        </td>
      </tr></table>
    </div>

    <div style="padding:24px;">
      <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#334155;">${escapeHtml(lead)}</p>

      <div style="padding:20px;border-radius:14px;background:#f8fafc;border:1px solid #e2e8f0;text-align:center;">
        <p style="margin:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#64748b;font-weight:700;">${escapeHtml(copy.amount)}</p>
        <p style="margin:8px 0 12px;font-size:30px;font-weight:800;letter-spacing:-0.02em;color:#0f172a;">${escapeHtml(amount)}</p>
        <span style="display:inline-block;padding:5px 14px;border-radius:999px;font-size:12px;font-weight:700;color:${statusColour(
          payload.transaction.status,
        )};background:${statusTint(payload.transaction.status)};">${escapeHtml(statusLabel(copy, payload.transaction.status))}</span>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:13px;margin:18px 0;">${detailRows
        .map(
          ([k, v]) =>
            `<tr><td style="padding:7px 0;color:#64748b;border-bottom:1px solid #f1f5f9;">${escapeHtml(k)}</td><td style="padding:7px 0;text-align:right;font-weight:600;color:#0f172a;border-bottom:1px solid #f1f5f9;">${escapeHtml(v)}</td></tr>`,
        )
        .join("")}</table>

      ${partyBlock(copy, debit ? copy.fromLabel : copy.toLabel, party, debit)}
      <div style="height:12px;"></div>
      ${partyBlock(copy, debit ? copy.toLabel : copy.fromLabel, counterparty, !debit)}

      ${support}
    </div>

    <div style="padding:16px 24px;border-top:1px solid #e2e8f0;background:#f8fafc;">
      <p style="margin:0;font-size:11px;line-height:1.6;color:#64748b;">${escapeHtml(fill(copy.disclaimer, vars))}</p>
      <p style="margin:8px 0 0;font-size:11px;color:#94a3b8;">${escapeHtml(fill(copy.generatedBy, vars))}</p>
    </div>
  </div>
</body>
</html>`;

  const text = [
    subject,
    "",
    lead,
    `${copy.amount}: ${amount}`,
    `${copy.status}: ${statusLabel(copy, payload.transaction.status)}`,
    `${copy.transactionId}: ${payload.transactionId}`,
    payload.referenceCode ? `${copy.reference}: ${payload.referenceCode}` : null,
    payload.remarks ? `${copy.narration}: ${payload.remarks}` : null,
    "",
    `${copy.fromLabel}: ${payload.sender.fullName} · ${payload.sender.bankName} · ${maskAccount(payload.sender.accountNumber)}`,
    `${copy.toLabel}: ${payload.receiver.fullName} · ${payload.receiver.bankName} · ${payload.receiver.accountNumber}`,
    "",
    fill(copy.disclaimer, vars),
  ]
    .filter((line) => line !== null)
    .join("\n");

  return { subject, html, text };
}