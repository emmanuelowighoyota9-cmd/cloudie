/**
 * Cloudie AI Template Classification & Metadata Extractor
 * -------------------------------------------------------
 * Deterministic + AI-assisted classifier for the Cloudie Admin System.
 * Maps every uploaded document template to EXACTLY one of 4 strict categories
 * and extracts structural fields into ingestion-ready JSON.
 *
 * Runtime-neutral: usable in browser, node, and Convex actions.
 */

// ─── Strict 4-category taxonomy ─────────────────────────────────────────────

export const CLOUDIE_CATEGORIES = [
  "Identity & Personal Documents",
  "General & Official Artifacts",
  "Financial & Payment Artifacts",
  "Logistics & Travel",
] as const;

export type CloudieCategory = (typeof CLOUDIE_CATEGORIES)[number];

// ─── Output schema (DB ingestion contract) ──────────────────────────────────

export type CloudieFieldType = "string" | "number" | "date" | "image_url";

export interface CloudieRequiredField {
  field_key: string;
  label: string;
  data_type: CloudieFieldType;
  required: true;
}

export interface CloudieTemplateJson {
  template_title: string;
  category: CloudieCategory;
  subcategory: string;
  description: string;
  required_fields: CloudieRequiredField[];
  is_active: true;
}

export interface ClassifierInput {
  template_title?: string;
  name?: string;
  title?: string;
  description?: string;
  documentType?: string;
  slug?: string;
  rawText?: string;
  placeholders?: string[];
  fields?: Array<{ id?: string; label?: string; type?: string; placeholder?: string }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toCamelCase(value: string): string {
  const trimmed = value.trim().replace(/^[{}]+|[{}]+$/g, "").trim();
  if (!trimmed) return "field";
  // If the token already looks like a valid identifier (no separators), preserve camelCase
  const hasSeparators = /[^a-zA-Z0-9]/.test(trimmed);
  if (!hasSeparators) {
    // single token like fullName, bookingRef, qrValue, transactionId, SSN
    let out = trimmed.charAt(0).toLowerCase() + trimmed.slice(1);
    out = out.replace(/[^a-zA-Z0-9]/g, "");
    out = out.replace(/^[^a-z]+/, "");
    if (!out) out = "field";
    if (out.length > 40) out = out.slice(0, 40);
    // ensure starts with lowercase letter
    out = out.charAt(0).toLowerCase() + out.slice(1);
    return out;
  }
  const cleaned = trimmed.replace(/[{}]/g, " ").replace(/[^a-zA-Z0-9]+/g, " ").trim();
  if (!cleaned) return "field";
  const parts = cleaned.split(/\s+/);
  const first = parts[0].toLowerCase();
  const rest = parts.slice(1).map((p) => p.charAt(0).toUpperCase() + p.slice(1).toLowerCase());
  let out = [first, ...rest].join("");
  out = out.replace(/^[^a-zA-Z]+/, "");
  if (!out) out = "field";
  if (out.length > 40) out = out.slice(0, 40);
  out = out.charAt(0).toLowerCase() + out.slice(1);
  return out;
}

function humanizeLabel(key: string): string {
  const spaced = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return spaced
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function escapeForPrompt(s: string): string {
  return s.replace(/[\\"]/g, "\\$&").slice(0, 4000);
}

// ─── Data-type inference ─────────────────────────────────────────────────────

const DATE_HINTS = [
  "date",
  "dob",
  "birth",
  "expiry",
  "expiration",
  "expire",
  "issued",
  "issue",
  "valid",
  "arrival",
  "departure",
  "depart",
  "arrive",
  "travel",
  "deadline",
  "anniversary",
  "established",
  "registered",
  "death",
];
const NUMBER_HINTS = [
  "amount",
  "price",
  "total",
  "subtotal",
  "fee",
  "tax",
  "cost",
  "balance",
  "payment",
  "paid",
  "due",
  "quantity",
  "qty",
  "weight",
  "number",
  "account",
  "reference",
  "invoice",
  "tracking",
  "zip",
  "postal",
  "phone",
  "ssn",
  "sin",
  "id_number",
];
const IMAGE_HINTS = [
  "photo",
  "image",
  "avatar",
  "picture",
  "portrait",
  "selfie",
  "signature",
  "qr",
  "barcode",
  "logo",
  "thumb",
  "holder_photo",
  "face",
  "fingerprint",
];

export function inferDataType(fieldKey: string, label: string, typeHint?: string): CloudieFieldType {
  const hint = (typeHint ?? "").toLowerCase();
  if (hint === "image" || hint === "image_url") return "image_url";
  if (hint === "date" || hint === "datetime") return "date";
  if (hint === "time") return "date";
  if (hint === "number" || hint === "currency") return "number";
  const hay = `${fieldKey} ${label}`.toLowerCase();
  if (IMAGE_HINTS.some((k) => hay.includes(k))) return "image_url";
  // ssn/sin/passport/license/tracking identifiers stay string even if they contain date-like substrings
  if (hay.includes("ssn") || hay.includes("sin") || hay.includes("passport") || hay.includes("license") || hay.includes("tracking")) {
    // but if explicit date phrase like expiryDate still wins — check strict
    if (!hay.includes("expiry") && !hay.includes("birth") && !hay.includes("issue")) return "string";
  }
  // bookingRef should remain string — "booking" alone is not a date signal
  if (DATE_HINTS.some((k) => hay.includes(k))) {
    // guard: bookingRef / bookingNumber without date/time words should not fire — but we removed booking hint
    return "date";
  }
  // dead code retained for future numeric hints (kept for lint parity)
  void NUMBER_HINTS;
  const strongNumber = ["amount", "price", "total", "subtotal", "fee", "cost", "balance", "tax", "weight", "quantity", "qty", "fare", "shipping"];
  if (strongNumber.some((k) => hay.includes(k))) return "number";
  return "string";
}

// ─── Keyword banks for strict classification ─────────────────────────────────

type ScoredCategory = { cat: CloudieCategory; score: number; reason: string };

const KEYWORDS: Record<CloudieCategory, string[]> = {
  "Identity & Personal Documents": [
    "driver license", "driver's license", "drivers license", "passport", "military id", "military", "refugee", "refugee id",
    "ssn", "sin", "social security", "social insurance", "national id", "national identity", "nid", "voter id",
    "fan id", "office id", "identity card", "id card", "identification", "identity verification", "membership card", "status card",
    "student id", "employee id", "staff id", "residence permit", "citizen card", "birth id"
  ],
  "General & Official Artifacts": [
    "certificate", "nursing", "contract award", "achievement", "completion", "award", "death certificate", "death",
    "letter", "official letter", "correspondence", "concert ticket", "event ticket", "ticket", "holding paper", "mockup",
    "formal record", "proof of completion", "legal declaration", "declaration", "affidavit", "diploma", "degree"
  ],
  "Financial & Payment Artifacts": [
    "invoice", "payment screenshot", "cashapp", "cash app", "paypal", "binance", "stripe", "wise", "revolut",
    "bank transfer", "receipt", "payment receipt", "bank receipt", "wire transfer", "bank check", "cheque", "check",
    "financial", "billing", "monetary", "transaction", "settlement", "payment verification", "money"
  ],
  "Logistics & Travel": [
    "flight", "itinerary", "boarding", "airline", "one-way", "one way", "return", "multi-leg", "multi leg", "layover",
    "consignment", "tracking", "tracking page", "shipping invoice", "shipping label", "delivery", "package", "parcel",
    "transit", "logistics", "shipment", "courier", "freight", "cargo", "container", "airport", "terminal", "gate", "eta"
  ],
};

const SUBCATEGORIES: Record<CloudieCategory, string[]> = {
  "Identity & Personal Documents": [
    "Driver's License",
    "Passport",
    "Military ID",
    "Refugee ID",
    "SSN Card",
    "SIN Card",
    "National ID",
    "Fan ID",
    "Office ID",
    "Student ID",
  ],
  "General & Official Artifacts": [
    "Nursing Certificate",
    "Contract Award Certificate",
    "General Achievement Certificate",
    "Death Certificate",
    "Official Letter",
    "Concert Ticket",
    "Event Ticket",
    "Holding Paper Mockup",
    "Completion Certificate",
  ],
  "Financial & Payment Artifacts": [
    "Invoice",
    "CashApp Screenshot",
    "PayPal Screenshot",
    "Binance Screenshot",
    "Bank Transfer Receipt",
    "Payment Receipt",
    "Bank Check",
    "Settlement Statement",
  ],
  "Logistics & Travel": [
    "Flight Itinerary (One-Way)",
    "Flight Itinerary (Return)",
    "Flight Itinerary (Multi-Leg)",
    "Consignment Tracking Page",
    "Shipping Invoice",
    "Delivery Package Photo",
    "Shipping Label",
    "Transit Manifest",
  ],
};

function scoreCategories(combined: string, documentType?: string): ScoredCategory[] {
  const lower = combined.toLowerCase();
  const type = (documentType ?? "").toLowerCase();

  // bonus from explicit documentType mapping (legacy categories)
  const typeBonus: Record<string, CloudieCategory> = {
    banking_ui: "Financial & Payment Artifacts",
    financial: "Financial & Payment Artifacts",
    corporate: "Financial & Payment Artifacts",
    certificates: "General & Official Artifacts",
    tracking: "Logistics & Travel",
    flight_itinerary: "Logistics & Travel",
    general: "General & Official Artifacts",
  };

  return CLOUDIE_CATEGORIES.map((cat) => {
    let score = 0;
    let hits: string[] = [];
    for (const kw of KEYWORDS[cat]) {
      if (lower.includes(kw)) {
        // longer keywords weigh more
        score += kw.split(" ").length * 3 + 2;
        hits.push(kw);
      }
    }
    if (type && typeBonus[type] === cat) score += 8;
    // tie-breaker: Logistics vs Financial vs Identity vs General priority already by score
    return { cat, score, reason: hits.slice(0, 3).join(", ") };
  }).sort((a, b) => b.score - a.score);
}

function pickSubcategory(category: CloudieCategory, combined: string): string {
  const lower = combined.toLowerCase();
  // special multi-leg detection
  if (category === "Logistics & Travel") {
    if (lower.includes("multi") || lower.includes("multi-leg") || lower.includes("3 legs") || lower.includes("layover")) return "Flight Itinerary (Multi-Leg)";
    if (lower.includes("one-way") || lower.includes("one way")) return "Flight Itinerary (One-Way)";
    if (lower.includes("return") || lower.includes("round trip") || lower.includes("round-trip")) return "Flight Itinerary (Return)";
    if (lower.includes("tracking page") || lower.includes("consignment tracking")) return "Consignment Tracking Page";
    if (lower.includes("shipping invoice")) return "Shipping Invoice";
    if (lower.includes("label")) return "Shipping Label";
    if (lower.includes("package") || lower.includes("delivery")) return "Delivery Package Photo";
    if (lower.includes("flight") || lower.includes("itinerary")) return "Flight Itinerary (One-Way)";
  }
  if (category === "Identity & Personal Documents") {
    if (lower.includes("passport")) return "Passport";
    if (lower.includes("driver")) return "Driver's License";
    if (lower.includes("military")) return "Military ID";
    if (lower.includes("refugee")) return "Refugee ID";
    if (lower.includes("ssn")) return "SSN Card";
    if (lower.includes("sin")) return "SIN Card";
    if (lower.includes("fan id")) return "Fan ID";
    if (lower.includes("office")) return "Office ID";
    if (lower.includes("national")) return "National ID";
  }
  if (category === "Financial & Payment Artifacts") {
    if (lower.includes("cashapp") || lower.includes("cash app")) return "CashApp Screenshot";
    if (lower.includes("paypal")) return "PayPal Screenshot";
    if (lower.includes("binance")) return "Binance Screenshot";
    if (lower.includes("bank check") || lower.includes("cheque") || lower.includes(" check")) return "Bank Check";
    if (lower.includes("transfer")) return "Bank Transfer Receipt";
    if (lower.includes("receipt")) return "Payment Receipt";
    if (lower.includes("invoice")) return "Invoice";
    if (lower.includes("settlement")) return "Settlement Statement";
  }
  if (category === "General & Official Artifacts") {
    if (lower.includes("nursing")) return "Nursing Certificate";
    if (lower.includes("contract award")) return "Contract Award Certificate";
    if (lower.includes("death")) return "Death Certificate";
    if (lower.includes("concert")) return "Concert Ticket";
    if (lower.includes("event ticket") || lower.includes(" ticket")) return "Event Ticket";
    if (lower.includes("holding paper") || lower.includes("mockup")) return "Holding Paper Mockup";
    if (lower.includes("letter")) return "Official Letter";
    if (lower.includes("certificate")) return "General Achievement Certificate";
  }
  // fallback: first in list that vaguely matches
  const list = SUBCATEGORIES[category];
  for (const sub of list) {
    const firstWord = sub.split(" ")[0].toLowerCase();
    if (lower.includes(firstWord)) return sub;
  }
  return list[0];
}

// ─── Placeholder & field extraction ──────────────────────────────────────────

const BRACE_RE = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;

export function extractPlaceholders(text: string): string[] {
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = BRACE_RE.exec(text)) !== null) {
    out.push(m[1]);
  }
  return out;
}

export function extractFields(input: ClassifierInput): CloudieRequiredField[] {
  const seen = new Map<string, CloudieRequiredField>();

  const push = (rawKey: string, labelHint?: string, typeHint?: string) => {
    const key = toCamelCase(rawKey);
    if (seen.has(key)) return;
    const label = labelHint ? humanizeLabel(labelHint) : humanizeLabel(key);
    const data_type = inferDataType(key, label, typeHint);
    seen.set(key, { field_key: key, label, data_type, required: true });
  };

  // 1) explicit placeholders list
  if (input.placeholders) {
    for (const p of input.placeholders) push(p);
  }
  // 2) placeholders inside rawText
  if (input.rawText) {
    for (const p of extractPlaceholders(input.rawText)) push(p);
  }
  // 3) structured fields
  if (input.fields) {
    for (const f of input.fields) {
      const raw = f.id || f.placeholder || f.label || "";
      if (!raw) continue;
      push(raw, f.label, f.type);
    }
  }
  // 4) placeholders inside description/title as well
  const combo = `${input.template_title ?? ""} ${input.name ?? ""} ${input.title ?? ""} ${input.description ?? ""} ${input.rawText ?? ""}`;
  for (const p of extractPlaceholders(combo)) push(p);

  // 5) Heuristic: if no fields found, infer from title/category keywords
  if (seen.size === 0) {
    // provide sensible baseline so JSON never ships empty required_fields
    const titleLower = (input.template_title ?? input.name ?? input.title ?? "").toLowerCase();
    if (titleLower.includes("passport") || titleLower.includes("license") || titleLower.includes("id")) {
      ["fullName", "dateOfBirth", "issueDate", "expiryDate", "idNumber", "photoUrl"].forEach((k) => push(k));
    } else if (titleLower.includes("invoice") || titleLower.includes("payment")) {
      ["invoiceNumber", "issueDate", "dueDate", "amount", "recipientName"].forEach((k) => push(k));
    } else if (titleLower.includes("flight") || titleLower.includes("itinerary")) {
      ["passengerName", "flightNumber", "departureDate", "arrivalDate", "origin", "destination"].forEach((k) => push(k));
    } else {
      ["recipientName", "issueDate", "referenceNumber"].forEach((k) => push(k));
    }
  }

  return Array.from(seen.values()).slice(0, 30);
}

// ─── Main classifier ─────────────────────────────────────────────────────────

export function classifyCategory(input: ClassifierInput): CloudieCategory {
  const combined = [
    input.template_title,
    input.name,
    input.title,
    input.description,
    input.slug,
    input.rawText,
    (input.fields ?? []).map((f) => `${f.id ?? ""} ${f.label ?? ""}`).join(" "),
  ]
    .filter(Boolean)
    .join(" — ");

  if (!combined.trim()) return "General & Official Artifacts";

  const scored = scoreCategories(combined, input.documentType);
  // if top score is 0, use heuristic on documentType or default
  if (scored[0].score === 0) {
    // fallback: map legacy documentType even with zero keyword hits
    const fallback: Record<string, CloudieCategory> = {
      banking_ui: "Financial & Payment Artifacts",
      financial: "Financial & Payment Artifacts",
      corporate: "Financial & Payment Artifacts",
      certificates: "General & Official Artifacts",
      tracking: "Logistics & Travel",
      flight_itinerary: "Logistics & Travel",
    };
    if (input.documentType && fallback[input.documentType]) return fallback[input.documentType];
    return "General & Official Artifacts";
  }
  return scored[0].cat;
}

export function buildDescription(category: CloudieCategory, subcategory: string, title: string, rawDesc?: string): string {
  if (rawDesc && rawDesc.trim().length >= 20 && rawDesc.trim().length <= 240) return rawDesc.trim();
  const tile: Record<CloudieCategory, string> = {
    "Identity & Personal Documents": `Personal identification template for ${subcategory.toLowerCase()} — renders identity verification and membership data into a printable credential.`,
    "General & Official Artifacts": `Formal record template for ${subcategory.toLowerCase()} — renders official correspondence and proof-of-completion layouts.`,
    "Financial & Payment Artifacts": `Financial template for ${subcategory.toLowerCase()} — renders billing, transaction proof and monetary instrument layouts.`,
    "Logistics & Travel": `Travel and shipping template for ${subcategory.toLowerCase()} — renders itineraries, tracking timelines and delivery labels.`,
  };
  const base = tile[category];
  // lightly customize with title
  if (title && !base.toLowerCase().includes(title.toLowerCase().slice(0, 12))) return `${title} — ${base}`;
  return base;
}

export function classifyAndExtract(input: ClassifierInput): CloudieTemplateJson {
  const titleRaw = (input.template_title ?? input.name ?? input.title ?? input.slug ?? "Untitled Template").trim();
  const template_title = titleRaw.slice(0, 80) || "Untitled Template";
  const combinedForSub = [
    titleRaw,
    input.description ?? "",
    input.slug ?? "",
    input.documentType ?? "",
    input.rawText ?? "",
    (input.fields ?? []).map((f) => f.label ?? f.id ?? "").join(" "),
  ].join(" — ");

  const category = classifyCategory(input);
  const subcategory = pickSubcategory(category, combinedForSub);
  const description = buildDescription(category, subcategory, template_title, input.description);
  const required_fields = extractFields({ ...input, template_title });

  return {
    template_title,
    category,
    subcategory,
    description,
    required_fields,
    is_active: true,
  };
}

// ─── AI prompt builders (for vly.ai.completion) ─────────────────────────────

export function buildAiSystemPrompt(): string {
  return [
    "You are the Cloudie Template Classification & Metadata Extractor.",
    "Classify every document template into EXACTLY one of these 4 categories:",
    "1) Identity & Personal Documents — driver's licenses, passports, military/refugee IDs, SSN/SIN, fan/office IDs. Purpose: identity verification, membership or status cards.",
    "2) General & Official Artifacts — certificates (nursing, contract award, general), death certificates, letters, concert/event tickets, holding paper mockups. Purpose: formal records, proof of completion, legal declarations.",
    "3) Financial & Payment Artifacts — invoices, payment screenshots (CashApp, PayPal, Binance), bank transfer receipts, bank checks. Purpose: proof of transaction, billing, wire transfers.",
    "4) Logistics & Travel — flight itineraries (one-way, return, multi-leg), consignment tracking pages, shipping invoices, delivery package photos/labels. Purpose: shipping, transport, travel reservations.",
    "Rules:",
    "- You MUST return ONLY a valid JSON object matching the required schema — no markdown, no explanation, no extra keys.",
    "- field_key must be camelCase, label human-readable Title Case, data_type one of string|number|date|image_url, required always true.",
    "- is_active must be true.",
    "- Infer data_type from field semantics: dates include birth/expiry/issue/travel dates; numbers include amount/total/weight/qty; image_url includes photo/avatar/qr/signature.",
  ].join(" ");
}

export function buildAiUserPrompt(input: ClassifierInput): string {
  const safe = {
    template_title: escapeForPrompt(input.template_title ?? input.name ?? input.title ?? ""),
    description: escapeForPrompt(input.description ?? ""),
    slug: escapeForPrompt(input.slug ?? ""),
    documentType: escapeForPrompt(input.documentType ?? ""),
    rawText: escapeForPrompt(input.rawText ?? ""),
    fields: (input.fields ?? []).slice(0, 20).map((f) => ({
      id: escapeForPrompt(f.id ?? ""),
      label: escapeForPrompt(f.label ?? ""),
      type: escapeForPrompt(f.type ?? ""),
    })),
    placeholders: (input.placeholders ?? []).slice(0, 20).map(escapeForPrompt),
  };
  return [
    "Classify this template and extract fields. Return strictly JSON per schema:",
    `{
  "template_title": "String",
  "category": "Identity & Personal Documents | General & Official Artifacts | Financial & Payment Artifacts | Logistics & Travel",
  "subcategory": "String e.g. Driver's License, Invoice, Flight Itinerary",
  "description": "String brief",
  "required_fields": [{ "field_key": "camelCase", "label": "Human Label", "data_type": "string|number|date|image_url", "required": true }],
  "is_active": true
}`,
    "",
    `Input: ${JSON.stringify(safe, null, 2)}`,
  ].join("\n");
}

export function coerceAndValidateAiJson(raw: string): CloudieTemplateJson | null {
  let parsed: unknown;
  try {
    // strip markdown fences if model wraps
    const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const jsonStr = fenced ? fenced[1] : raw;
    parsed = JSON.parse(jsonStr.trim());
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const o = parsed as Record<string, unknown>;
  if (typeof o.template_title !== "string") return null;
  if (!CLOUDIE_CATEGORIES.includes(o.category as CloudieCategory)) return null;
  if (typeof o.subcategory !== "string") return null;
  if (typeof o.description !== "string") return null;
  if (!Array.isArray(o.required_fields)) return null;
  const fields: CloudieRequiredField[] = [];
  for (const f of o.required_fields as unknown[]) {
    if (!f || typeof f !== "object") return null;
    const r = f as Record<string, unknown>;
    if (typeof r.field_key !== "string" || !/^[a-z][a-zA-Z0-9]*$/.test(r.field_key)) return null;
    if (typeof r.label !== "string") return null;
    if (!["string", "number", "date", "image_url"].includes(r.data_type as string)) return null;
    if (r.required !== true) return null;
    fields.push({ field_key: r.field_key as string, label: r.label as string, data_type: r.data_type as CloudieFieldType, required: true });
  }
  if (fields.length === 0) return null;
  return {
    template_title: String(o.template_title).slice(0, 80),
    category: o.category as CloudieCategory,
    subcategory: String(o.subcategory).slice(0, 60),
    description: String(o.description).slice(0, 300),
    required_fields: fields.slice(0, 30),
    is_active: true,
  };
}

export function fallbackToDeterministic(input: ClassifierInput, aiError?: string): CloudieTemplateJson & { _note?: string } {
  const base = classifyAndExtract(input);
  if (aiError) return { ...base, _note: `deterministic fallback: ${aiError}` } as unknown as CloudieTemplateJson & { _note?: string };
  return base;
}
