/**
 * Crestline document brief parser.
 *
 * Turns a plain-language brief into a validated field set for one of the
 * platform's legitimate business document templates. It is intentionally
 * deterministic: no model call, no network, no hidden state — so it runs
 * identically in the browser and in tests.
 *
 * Policy: this parser only maps onto business paperwork issued by an
 * organisation. Requests for identity documents, government credentials,
 * payment confirmations, bank instruments, or other artifacts that could be
 * mistaken for authentic are rejected rather than generated.
 */

import { sanitizeText, type FieldDef, type FieldType } from "./docTemplateEngine";

export type BriefTransform = "text" | "reference" | "date" | "amount" | "number";

export interface BriefFieldRule {
  id: string;
  label: string;
  /** Only required fields are reported as missing when absent. */
  required?: boolean;
  /** First capture group wins; the whole match is used when there is none. */
  patterns: RegExp[];
  transform?: BriefTransform;
  hint?: string;
}

export interface BriefIntent {
  key: string;
  label: string;
  templateSlug: string;
  description: string;
  /** Lower-cased terms that indicate this document type. */
  keywords: string[];
  fields: BriefFieldRule[];
}

// ─── Supported intents ────────────────────────────────────────────────────────

export const BRIEF_INTENTS: BriefIntent[] = [
  {
    key: "shipment_tracking",
    label: "Shipment tracking card",
    templateSlug: "shipment-tracking-card",
    description: "Courier status card with milestones, tracking number and scannable codes.",
    keywords: ["shipment", "shipping", "consignment", "tracking", "track", "parcel", "package", "dispatch", "courier", "freight", "delivery"],
    fields: [
      {
        id: "trackingNumber",
        label: "Tracking number",
        required: true,
        transform: "reference",
        patterns: [/\b(?:tracking|tracking\s*(?:no|number|id)|awb|consignment)\s*[:#-]?\s*([A-Z0-9][A-Z0-9-]{4,24})\b/i, /\b([A-Z]{2,4}-\d{4,10}(?:-[A-Z0-9]{1,6})?)\b/],
      },
      { id: "carrier", label: "Carrier", patterns: [/\b(?:carrier|courier|via|with)\s*[:#-]?\s*([A-Za-z][A-Za-z0-9&.' -]{2,32})/i] },
      { id: "originCity", label: "Origin city", patterns: [/\bfrom\s+([A-Za-z][A-Za-z .'-]{2,22})/i, /\borigin\s*[:#-]?\s*([A-Za-z][A-Za-z .'-]{2,22})/i] },
      { id: "destinationCity", label: "Destination city", patterns: [/\bto\s+([A-Za-z][A-Za-z .'-]{2,22})/i, /\bdestination\s*[:#-]?\s*([A-Za-z][A-Za-z .'-]{2,22})/i] },
      { id: "senderName", label: "Sender", patterns: [/\bsender\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,34})/i, /\bshipper\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,34})/i] },
      { id: "recipientName", label: "Recipient", patterns: [/\brecipient\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,34})/i, /\bconsignee\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,34})/i] },
      { id: "weight", label: "Weight (kg)", transform: "number", patterns: [/\b([0-9]+(?:[.,][0-9]+)?)\s*(?:kg|kgs|kilograms)\b/i] },
      { id: "etaDate", label: "Estimated delivery", transform: "date", patterns: [/\b(?:eta|estimated delivery|delivery date|arrives?)\s*(?:on|by|:)?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[A-Za-z]+ [0-9]{1,2},? [0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i] },
    ],
  },
  {
    key: "commercial_invoice",
    label: "Commercial invoice",
    templateSlug: "commercial-invoice",
    description: "Line-item invoice with seller, buyer, tax, shipping and payment terms.",
    keywords: ["invoice", "bill", "billing", "commercial invoice", "order", "purchase order", "receivable", "statement"],
    fields: [
      {
        id: "invoiceNumber",
        label: "Invoice number",
        required: true,
        transform: "reference",
        patterns: [/\b(?:invoice|inv)\s*(?:no|number|#|:)\s*([A-Z0-9][A-Z0-9-]{3,24})\b/i, /\b(INV-[0-9]{4,}-[A-Z0-9]{2,8})\b/],
      },
      { id: "sellerName", label: "Seller", patterns: [/\b(?:seller|vendor|from|issued by|supplier)\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,40})/i] },
      { id: "buyerName", label: "Buyer", patterns: [/\b(?:buyer|client|customer|bill to|billed to|purchaser)\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,40})/i] },
      { id: "invoiceDate", label: "Invoice date", transform: "date", patterns: [/\b(?:invoice date|issued|date)\s*(?:on|:)?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[A-Za-z]+ [0-9]{1,2},? [0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i] },
      { id: "dueDate", label: "Due date", transform: "date", patterns: [/\b(?:due|payment due|due date|net)\s*(?:on|by|:)?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[A-Za-z]+ [0-9]{1,2},? [0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i] },
      { id: "total", label: "Total due", transform: "amount", patterns: [/\b(?:total|amount due|grand total|balance)\s*(?:due|:)?\s*(?:[A-Z]{3}\s*)?[$€£₦]?\s*([0-9][0-9,]*\.[0-9]{2})/i, /([0-9][0-9,]*\.[0-9]{2})\s*(?:total|due)/i] },
      { id: "currencyCode", label: "Currency", patterns: [/\b(USD|EUR|GBP|NGN|CAD|AUD|KES|GHS|ZAR|INR)\b/] },
      { id: "paymentTerms", label: "Payment terms", patterns: [/\b(net\s*[0-9]{1,3}(?:\s*days)?)\b/i, /\bpayment terms\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,40})/i] },
    ],
  },
  {
    key: "operations_brief",
    label: "Operations brief",
    templateSlug: "operations-brief",
    description: "Internal one-page brief with owner, audience, summary and next step.",
    keywords: ["brief", "memo", "summary", "report", "one-pager", "status update", "operations", "internal note"],
    fields: [
      { id: "briefTitle", label: "Brief title", required: true, patterns: [/\b(?:title|subject|re)\s*[:#-]\s*([A-Za-z0-9&.,'()/ -]{3,48})/i, /^([A-Za-z0-9&.,'()/ -]{4,48})$/m] },
      { id: "owner", label: "Owner", patterns: [/\b(?:owner|author|prepared by|from)\s*[:#-]?\s*([A-Za-z][A-Za-z .'-]{2,32})/i] },
      { id: "audience", label: "Audience", patterns: [/\b(?:audience|for|to)\s*[:#-]?\s*([A-Za-z0-9&.,' -]{2,32})/i] },
      { id: "dueDate", label: "Review date", transform: "date", patterns: [/\b(?:review|due|by|deadline)\s*(?:on|by|:)?\s*([0-9]{4}-[0-9]{2}-[0-9]{2}|[A-Za-z]+ [0-9]{1,2},? [0-9]{4}|[0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4})/i] },
      { id: "summary", label: "Executive summary", patterns: [/\b(?:summary|overview|context)\s*[:#-]\s*([\s\S]{20,220})/i] },
    ],
  },
];

// ─── Refused categories ───────────────────────────────────────────────────────

interface RefusedCategory {
  term: string;
  label: string;
  pattern: RegExp;
}

const REFUSED: RefusedCategory[] = [
  { term: "passport", label: "passports", pattern: /\bpassport(s)?\b/i },
  { term: "driver license", label: "driver's licences", pattern: /\bdriver'?s?\s*licen[cs]es?\b/i },
  { term: "national id", label: "national ID cards", pattern: /\bnational\s+id\b|\bnational\s+identity\b/i },
  { term: "id card", label: "identity cards", pattern: /\bid\s*card(s)?\b|\bmilitary\s+id\b|\bemployee\s+id\b|\bfan\s+id\b|\brefugee\s+id\b/i },
  { term: "ssn", label: "social security cards", pattern: /\bssn\b|social\s+security\s+(card|number)/i },
  { term: "sin", label: "social insurance cards", pattern: /\bsin\b|social\s+insurance\s+(card|number)/i },
  { term: "death certificate", label: "death certificates", pattern: /\bdeath\s+certificate(s)?\b|\bvital\s+records?\b/i },
  { term: "bank check", label: "bank cheques", pattern: /\bbank\s+check(s)?\b|\bcheque(s)?\b|\bcashier'?s?\s+check\b/i },
  { term: "payment screenshot", label: "payment confirmations", pattern: /\bpayment\s+(screenshot|confirmation|receipt)\b|\btransfer\s+receipt\b|\bwire\s+receipt\b|\bcash\s*app\b|\bpaypal\b|\bbinance\b|\bgcash\b|\bvenmo\b|\bzelle\b/i },
  { term: "routing number", label: "bank routing or account numbers", pattern: /\brouting\s+(number|no)\b|\baccount\s+number\b/i },
  { term: "certificate", label: "credential or award certificates", pattern: /\b(certificate|diploma|credential)\b/i },
];

export interface BriefRefusal {
  status: "blocked";
  reason: string;
  matched: string;
}

export interface BriefUnsupported {
  status: "unsupported";
  reason: string;
  suggestions: string[];
}

export interface BriefEmpty {
  status: "empty";
}

export interface BriefMatch {
  status: "matched";
  intent: BriefIntent;
  values: Record<string, string>;
  missing: { id: string; label: string }[];
  recognized: { id: string; label: string; value: string }[];
}

export type BriefResult = BriefMatch | BriefRefusal | BriefUnsupported | BriefEmpty;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toIsoDate(raw: string): string {
  const value = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "";
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${parsed.getFullYear()}-${month}-${day}`;
}

function ruleFieldType(rule: BriefFieldRule): FieldType {
  switch (rule.transform) {
    case "date": return "date";
    case "amount": return "currency";
    case "number": return "number";
    case "reference": return "reference";
    default: return "text";
  }
}

function applyTransform(value: string, transform: BriefTransform | undefined): string {
  const trimmed = value.trim();
  switch (transform) {
    case "reference":
      return trimmed.toUpperCase().replace(/[^A-Z0-9\-/ ]/g, "").slice(0, 40);
    case "date":
      return toIsoDate(trimmed);
    case "amount":
      return trimmed.replace(/[^0-9.,]/g, "").replace(/,/g, "").slice(0, 20);
    case "number":
      return trimmed.replace(/[^0-9.]/g, "").slice(0, 20);
    default:
      return sanitizeText(trimmed, 240);
  }
}

function extractRule(rule: BriefFieldRule, text: string): string {
  for (const pattern of rule.patterns) {
    const match = pattern.exec(text);
    if (!match) continue;
    const raw = (match[1] ?? match[0] ?? "").trim();
    if (!raw) continue;
    const value = applyTransform(raw, rule.transform);
    if (value) return value;
  }
  return "";
}

function scoreIntent(intent: BriefIntent, text: string): number {
  const haystack = text.toLowerCase();
  return intent.keywords.reduce((score, keyword) => (haystack.includes(keyword) ? score + keyword.length : score), 0);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/** Find the refused category a brief mentions, if any. */
export function refusedCategory(text: string): RefusedCategory | null {
  return REFUSED.find((entry) => entry.pattern.test(text)) ?? null;
}

/** Parse a plain-language brief into a supported business document request. */
export function parseDocumentBrief(input: string): BriefResult {
  const text = input.trim().replace(/\s+/g, " ");
  if (!text) return { status: "empty" };

  const refused = refusedCategory(text);
  if (refused) {
    return {
      status: "blocked",
      matched: refused.term,
      reason: `Crestline does not generate ${refused.label}. Requests for identity documents, government credentials, payment confirmations, bank instruments or credential certificates are declined. Use the template library for legitimate business paperwork.`,
    };
  }

  const ranked = BRIEF_INTENTS.map((intent) => ({ intent, score: scoreIntent(intent, text) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0];
  if (!best || best.score === 0) {
    return {
      status: "unsupported",
      reason:
        "Could not match this brief to a supported Crestline document. Supported types are shipment tracking, commercial invoice and operations brief.",
      suggestions: BRIEF_INTENTS.map((intent) => intent.label),
    };
  }

  const values: Record<string, string> = {};
  const recognized: BriefMatch["recognized"] = [];
  const missing: BriefMatch["missing"] = [];

  for (const rule of best.intent.fields) {
    const value = extractRule(rule, text);
    if (value) {
      values[rule.id] = value;
      recognized.push({ id: rule.id, label: rule.label, value });
    } else if (rule.required) {
      missing.push({ id: rule.id, label: rule.label });
    }
  }

  return { status: "matched", intent: best.intent, values, missing, recognized };
}

export interface BriefStructuredOutput {
  documentType: string;
  template: string;
  templateSlug: string;
  values: Record<string, string>;
  missingFields: string[];
  fieldSchema: Pick<FieldDef, "id" | "label" | "type">[];
}

/**
 * Structured output in the shape the Crestline document engine consumes:
 * canonical field ids plus the extracted values, ready to drop into the builder.
 */
export function buildStructuredOutput(
  result: BriefMatch,
  schema?: { fields: FieldDef[] },
): BriefStructuredOutput {
  const known = new Set(result.intent.fields.map((rule) => rule.id));
  const used = (schema?.fields ?? []).filter((field) => known.has(field.id));
  const fieldSchema =
    used.length > 0
      ? used.map((field) => ({ id: field.id, label: field.label, type: field.type }))
      : result.intent.fields.map((rule) => ({
          id: rule.id,
          label: rule.label,
          type: ruleFieldType(rule),
        }));
  const values: Record<string, string> = {};
  for (const field of fieldSchema) {
    const value = result.values[field.id];
    if (value) values[field.id] = value;
  }
  return {
    documentType: result.intent.key,
    template: result.intent.label,
    templateSlug: result.intent.templateSlug,
    values,
    missingFields: result.missing.map((entry) => entry.label),
    fieldSchema,
  };
}
