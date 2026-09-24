/**
 * SoftBaker document template engine — shared, runtime-neutral.
 *
 * Consumed by BOTH the React frontend (live preview, dynamic forms) and Convex
 * functions (server-side rendering, validation, public sharing). Nothing here
 * touches the DOM, the filesystem, or the network, so it also runs inside
 * Node actions (sharp pipeline) and plain bun tests.
 *
 * SAFETY: this engine never interprets user HTML. Every value is escaped at
 * SVG-build time; image slots only accept `data:` URLs or platform-resolved
 * storage bytes (never arbitrary https URLs — that would give librsvg an SSRF
 * primitive). Templates flagged `sensitivity: "sensitive"` ALWAYS get a forced
 * SPECIMEN / NOT VALID stamp appended last, so layout code cannot cover or
 * remove it.
 */

import { qrToSvgPath } from "./qr";
import { code128Svg } from "./barcode";

// ─── Categories ───────────────────────────────────────────────────────────────

export type CategoryKey =
  | "banking_ui"
  | "tracking"
  | "flight_itinerary"
  | "financial"
  | "certificates"
  | "corporate"
  | "general";

export interface CategoryDef {
  key: CategoryKey;
  label: string;
  description: string;
  /** Sensitive categories render a non-removable stamp. */
  sensitive: boolean;
  enabledByDefault: boolean;
}

export const CATEGORIES: CategoryDef[] = [
  { key: "banking_ui", label: "Banking Websites", description: "Banking dashboards and interface mockups for design, training and QA.", sensitive: true, enabledByDefault: true },
  { key: "tracking", label: "Flight & Package Tracking", description: "Tracking status cards and shipment timelines.", sensitive: false, enabledByDefault: true },
  { key: "flight_itinerary", label: "Flight Itineraries", description: "Travel itineraries with fictional airlines and references.", sensitive: true, enabledByDefault: true },
  { key: "financial", label: "Financial & Payment Verification", description: "Fictional payment receipts and verification statements for testing.", sensitive: true, enabledByDefault: true },
  { key: "certificates", label: "Certificates & Records", description: "Completion certificates and record cards for training and award programmes.", sensitive: true, enabledByDefault: true },
  { key: "corporate", label: "Corporate Documents", description: "Invoices, memos, letters and business paperwork.", sensitive: false, enabledByDefault: true },
  { key: "general", label: "General Templates", description: "Everything else — badges, covers, one-pagers and more.", sensitive: false, enabledByDefault: true },
];

export function categoryDef(key: string): CategoryDef {
  return CATEGORIES.find((c) => c.key === key) ?? CATEGORIES[CATEGORIES.length - 1];
}

export function isSensitiveCategory(key: string): boolean {
  return categoryDef(key).sensitive;
}

// ─── Field schema ─────────────────────────────────────────────────────────────

export const FIELD_TYPES = [
  "text", "textarea", "number", "currency", "date", "time", "datetime",
  "select", "radio", "checkbox", "image", "color", "url", "reference",
  "status", "address", "country",
] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface FieldOption { label: string; value: string }

export interface FieldDef {
  id: string;
  type: FieldType;
  label: string;
  placeholder?: string;
  required?: boolean;
  default?: string | number | boolean;
  options?: FieldOption[];
  /** currency code for `currency` fields, e.g. "USD". */
  currency?: string;
  min?: number;
  max?: number;
  maxLength?: number;
  help?: string;
  /** Hidden from the form but still renderable (defaults applied). */
  hidden?: boolean;
}

export interface TemplateSchema { fields: FieldDef[] }

// ─── Layout ───────────────────────────────────────────────────────────────────

export type LayoutElement =
  | { kind: "text"; id?: string; x: number; y: number; w?: number; size?: number; weight?: 400 | 500 | 600 | 700 | 800; color?: string; align?: "left" | "center" | "right"; family?: "sans" | "serif" | "mono"; italic?: boolean; letterSpacing?: number; lineHeight?: number; uppercase?: boolean; text?: string; bind?: string; maxChars?: number }
  | { kind: "rect"; x: number; y: number; w: number; h: number; fill?: string; rx?: number; stroke?: string; strokeWidth?: number; opacity?: number }
  | { kind: "line"; x1: number; y1: number; x2: number; y2: number; stroke?: string; strokeWidth?: number }
  | { kind: "image"; x: number; y: number; w: number; h: number; bind: string; rx?: number; fit?: "cover" | "contain" }
  | { kind: "qr"; x: number; y: number; size: number; bind: string; color?: string; bg?: string }
  | { kind: "barcode"; x: number; y: number; w?: number; h?: number; bind: string; color?: string }
  | { kind: "badge"; x: number; y: number; w?: number; h?: number; bind: string; size?: number };

export interface TemplatePage {
  width: number;
  height: number;
  background?: string;
  /**
   * Full-bleed artwork drawn *under* the elements — a `data:` image URL.
   *
   * It is never persisted inside the layout: the template references an artwork
   * file, and the render surfaces inject the resolved data URL per page so a
   * scanned form or letterhead can be traced without bloating the layout JSON.
   */
  backgroundImage?: string;
  elements: LayoutElement[];
}

export interface TemplateConfiguration {
  pages: TemplatePage[];
  renderScale?: number; // raster multiplier, default 2
}

export type DocumentValues = Record<string, unknown>;

// ─── Defaults & limits ────────────────────────────────────────────────────────

export const ENGINE_LIMITS = {
  maxPages: 5,
  maxElementsPerPage: 400,
  maxFields: 60,
  maxPageDim: 4000,
  maxValueLength: 4000,
  maxImageBytesB64: 4_500_000, // ~3.3MB binary as base64
  defaultRenderScale: 2,
  maxRenderScale: 3,
} as const;

const FONT_STACK = {
  sans: "Helvetica, Arial, sans-serif",
  serif: "Georgia, 'Times New Roman', serif",
  mono: "'Courier New', Courier, monospace",
};

const STATUS_COLORS: Record<string, { fill: string; text: string }> = {
  delivered: { fill: "#dcfce7", text: "#166534" },
  completed: { fill: "#dcfce7", text: "#166534" },
  success: { fill: "#dcfce7", text: "#166534" },
  paid: { fill: "#dcfce7", text: "#166534" },
  pending: { fill: "#fef3c7", text: "#92400e" },
  processing: { fill: "#dbeafe", text: "#1e40af" },
  in_transit: { fill: "#dbeafe", text: "#1e40af" },
  intransit: { fill: "#dbeafe", text: "#1e40af" },
  booked: { fill: "#dbeafe", text: "#1e40af" },
  failed: { fill: "#fee2e2", text: "#991b1b" },
  cancelled: { fill: "#fee2e2", text: "#991b1b" },
  expired: { fill: "#fee2e2", text: "#991b1b" },
  draft: { fill: "#f1f5f9", text: "#475569" },
};

// ─── Escaping & sanitization ──────────────────────────────────────────────────

/** Escape a string for safe interpolation into SVG/XML text or attributes. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Strip control characters and cap length — applied before storage. */
export function sanitizeText(value: string, maxLength: number = ENGINE_LIMITS.maxValueLength): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "").slice(0, maxLength);
}

/** Only data: image URLs are ever legal inside generated SVG. */
export function isSafeImageDataUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > ENGINE_LIMITS.maxImageBytesB64) return false;
  return /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(value);
}

export function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch { return false; }
}

// ─── Validation ───────────────────────────────────────────────────────────────

export interface ValidationIssue { field: string; message: string }

const COUNTRY_SEED = ["United States", "United Kingdom", "Canada", "Germany", "France", "Nigeria", "Ghana", "Kenya", "South Africa", "India", "Brazil", "Japan", "Australia", "United Arab Emirates", "Netherlands", "Spain", "Italy", "Mexico", "Singapore", "Kenya"];

export function isCountryValue(value: string): boolean {
  if (!value) return true;
  return COUNTRY_SEED.includes(value) || /^[A-Za-z .'-]{2,60}$/.test(value);
}

function optionValues(field: FieldDef): string[] {
  return (field.options ?? []).map((o) => o.value);
}

/** Validate + normalize a single value. Returns the clean value or an issue. */
export function validateField(field: FieldDef, raw: unknown): { ok: true; value: unknown } | { ok: false; issue: ValidationIssue } {
  const fail = (message: string) => ({ ok: false as const, issue: { field: field.id, message } });
  const str = typeof raw === "string" ? sanitizeText(raw, field.maxLength ?? ENGINE_LIMITS.maxValueLength) : "";

  switch (field.type) {
    case "checkbox": {
      return { ok: true, value: raw === true || raw === "true" };
    }
    case "number": {
      if (str.trim() === "") return field.required ? fail(`${field.label} is required`) : { ok: true, value: "" };
      const n = Number(str.replace(/,/g, ""));
      if (!Number.isFinite(n)) return fail(`${field.label} must be a number`);
      if (field.min !== undefined && n < field.min) return fail(`${field.label} must be at least ${field.min}`);
      if (field.max !== undefined && n > field.max) return fail(`${field.label} must be at most ${field.max}`);
      return { ok: true, value: str.trim() };
    }
    case "currency": {
      if (str.trim() === "") return field.required ? fail(`${field.label} is required`) : { ok: true, value: "" };
      const n = Number(str.replace(/[^0-9.\-]/g, ""));
      if (!Number.isFinite(n)) return fail(`${field.label} must be an amount`);
      return { ok: true, value: str.trim() };
    }
    case "date": {
      if (!str) return field.required ? fail(`${field.label} is required`) : { ok: true, value: "" };
      return /^\d{4}-\d{2}-\d{2}$/.test(str) ? { ok: true, value: str } : fail(`${field.label} must be a date (YYYY-MM-DD)`);
    }
    case "time": {
      if (!str) return field.required ? fail(`${field.label} is required`) : { ok: true, value: "" };
      return /^([01]\d|2[0-3]):[0-5]\d$/.test(str) ? { ok: true, value: str } : fail(`${field.label} must be a time (HH:MM)`);
    }
    case "datetime": {
      if (!str) return field.required ? fail(`${field.label} is required`) : { ok: true, value: "" };
      return !Number.isNaN(Date.parse(str)) ? { ok: true, value: str } : fail(`${field.label} must be a date and time`);
    }
    case "select":
    case "radio":
    case "status": {
      if (!str) return field.required ? fail(`${field.label} is required`) : { ok: true, value: "" };
      const allowed = optionValues(field);
      if (field.type === "status" && allowed.length === 0) return { ok: true, value: str.toLowerCase() };
      return allowed.includes(str) ? { ok: true, value: str } : fail(`${field.label} has an invalid option`);
    }
    case "url": {
      if (!str) return field.required ? fail(`${field.label} is required`) : { ok: true, value: "" };
      return isHttpUrl(str) ? { ok: true, value: str } : fail(`${field.label} must be an http(s) URL`);
    }
    case "reference": {
      if (!str) return field.required ? fail(`${field.label} is required`) : { ok: true, value: "" };
      const v = str.toUpperCase().replace(/[^A-Z0-9\-/]/g, "").slice(0, 40);
      return v.length >= 2 ? { ok: true, value: v } : fail(`${field.label} must be at least 2 characters`);
    }
    case "country": {
      if (!str) return field.required ? fail(`${field.label} is required`) : { ok: true, value: "" };
      return isCountryValue(str) ? { ok: true, value: str } : fail(`${field.label} is not a valid country name`);
    }
    case "color": {
      if (!str) return field.required ? fail(`${field.label} is required`) : { ok: true, value: "" };
      return /^#[0-9a-fA-F]{6}$/.test(str) ? { ok: true, value: str.toLowerCase() } : fail(`${field.label} must be a hex color like #1a2b3c`);
    }
    case "image": {
      // Image values are storage file references or data URLs; never URLs.
      if (!str) return field.required ? fail(`${field.label} is required`) : { ok: true, value: "" };
      if (isSafeImageDataUrl(str)) return { ok: true, value: str };
      if (/^[A-Za-z0-9_-]{10,40}$/.test(str)) return { ok: true, value: str }; // storage file id
      return fail(`${field.label} must be an uploaded image`);
    }
    case "textarea":
    case "address":
    case "text":
    default: {
      if (!str.trim()) return field.required ? fail(`${field.label} is required`) : { ok: true, value: "" };
      if (field.maxLength && str.length > field.maxLength) return fail(`${field.label} must be at most ${field.maxLength} characters`);
      return { ok: true, value: str.trim() };
    }
  }
}

/** Validate a full value map against a schema. Unknown keys are dropped. */
export function validateValues(schema: TemplateSchema, values: DocumentValues): { ok: true; values: DocumentValues } | { ok: false; issues: ValidationIssue[] } {
  const issues: ValidationIssue[] = [];
  const clean: DocumentValues = {};
  for (const field of schema.fields) {
    const raw = values[field.id] ?? field.default ?? (field.type === "checkbox" ? false : "");
    const res = validateField(field, raw);
    if (res.ok) clean[field.id] = res.value;
    else issues.push(res.issue);
  }
  return issues.length ? { ok: false, issues } : { ok: true, values: clean };
}

/** Apply schema defaults for a fresh draft. */
export function defaultValues(schema: TemplateSchema): DocumentValues {
  const out: DocumentValues = {};
  for (const f of schema.fields) {
    out[f.id] = f.default !== undefined ? f.default : f.type === "checkbox" ? false : "";
  }
  return out;
}

// ─── Template definition validation (admin-facing) ────────────────────────────

export function isValidFieldId(id: unknown): id is string {
  return typeof id === "string" && /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/.test(id);
}

/** Every element kind the renderer understands. */
export const LAYOUT_ELEMENT_KINDS = [
  "text",
  "rect",
  "line",
  "image",
  "qr",
  "barcode",
  "badge",
] as const;

/** Kinds whose content is meaningless without a field binding. */
const BOUND_ELEMENT_KINDS: readonly string[] = ["image", "qr", "barcode", "badge"];

/** Smallest box each kind can be drawn in and still be legible/usable. */
const MIN_KIND_EXTENT: Record<string, { w: number; h: number }> = {
  text: { w: 0, h: 6 },
  // 1×1 is deliberate: hairline dividers are drawn as 1px filled panels.
  rect: { w: 1, h: 1 },
  line: { w: 1, h: 1 },
  image: { w: 8, h: 8 },
  qr: { w: 32, h: 32 },
  barcode: { w: 48, h: 16 },
  badge: { w: 24, h: 14 },
};

/** Slack allowed at the page edge before a layout is reported as clipped. */
const PAGE_SLACK = 2;

function isNum(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

/**
 * Page-space extent of an element, using the same defaults as the renderer.
 *
 * Auto-width text reports `w: 0` because its width depends on real content at
 * render time — only its anchor point is statically checkable.
 */
function elementExtent(el: LayoutElement): { x: number; y: number; w: number; h: number } | null {
  switch (el.kind) {
    case "rect":
    case "image":
      if (!isNum(el.x) || !isNum(el.y) || !isNum(el.w) || !isNum(el.h)) return null;
      return { x: el.x, y: el.y, w: el.w, h: el.h };
    case "qr":
      if (!isNum(el.x) || !isNum(el.y) || !isNum(el.size)) return null;
      return { x: el.x, y: el.y, w: el.size, h: el.size };
    case "barcode":
      if (!isNum(el.x) || !isNum(el.y)) return null;
      return { x: el.x, y: el.y, w: isNum(el.w) ? el.w : 240, h: isNum(el.h) ? el.h : 60 };
    case "badge": {
      if (!isNum(el.x) || !isNum(el.y)) return null;
      const size = isNum(el.size) ? el.size : 13;
      return { x: el.x, y: el.y, w: isNum(el.w) ? el.w : 90, h: isNum(el.h) ? el.h : size + 16 };
    }
    case "line":
      if (!isNum(el.x1) || !isNum(el.y1) || !isNum(el.x2) || !isNum(el.y2)) return null;
      return {
        x: Math.min(el.x1, el.x2),
        y: Math.min(el.y1, el.y2),
        w: Math.max(Math.abs(el.x2 - el.x1), 1),
        h: Math.max(Math.abs(el.y2 - el.y1), 1),
      };
    case "text": {
      if (!isNum(el.x) || !isNum(el.y)) return null;
      const size = isNum(el.size) ? el.size : 16;
      const lines = Math.max(1, String(el.text ?? "x").split("\n").length);
      const lineHeight = isNum(el.lineHeight) ? el.lineHeight : size * 1.35;
      // Ascenders reach roughly 0.8em above the baseline, not the full em box.
      return {
        x: el.x,
        y: el.y - size * 0.8,
        w: isNum(el.w) ? el.w : 0,
        h: lineHeight * (lines - 1) + size * 1.05,
      };
    }
  }
}

export function validateTemplateDefinition(schema: unknown, configuration: unknown): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const s = schema as TemplateSchema | null;
  const c = configuration as TemplateConfiguration | null;
  if (!s || typeof s !== "object" || !Array.isArray(s.fields)) {
    issues.push({ field: "schema", message: "schema.fields must be an array" });
    return issues;
  }
  if (s.fields.length > ENGINE_LIMITS.maxFields) issues.push({ field: "schema", message: `At most ${ENGINE_LIMITS.maxFields} fields` });
  const seen = new Set<string>();
  for (const f of s.fields) {
    if (!isValidFieldId(f?.id)) issues.push({ field: "schema", message: `Invalid field id: ${String(f?.id)}` });
    else if (seen.has(f.id)) issues.push({ field: "schema", message: `Duplicate field id: ${f.id}` });
    else seen.add(f.id);
    if (!FIELD_TYPES.includes(f?.type)) issues.push({ field: "schema", message: `Unknown field type: ${String(f?.type)} on ${String(f?.id)}` });
    if (!f?.label || typeof f.label !== "string") issues.push({ field: "schema", message: `Field ${String(f?.id)} needs a label` });
    if ((f?.type === "select" || f?.type === "radio") && (!f.options || f.options.length === 0)) issues.push({ field: "schema", message: `Field ${f?.id} needs options` });
  }
  if (!c || typeof c !== "object" || !Array.isArray(c.pages) || c.pages.length === 0) {
    issues.push({ field: "configuration", message: "configuration.pages must be a non-empty array" });
    return issues;
  }
  if (c.pages.length > ENGINE_LIMITS.maxPages) issues.push({ field: "configuration", message: `At most ${ENGINE_LIMITS.maxPages} pages` });
  c.pages.forEach((p, i) => {
    if (!p || !Number.isFinite(p.width) || !Number.isFinite(p.height) || p.width < 100 || p.height < 100 || p.width > ENGINE_LIMITS.maxPageDim || p.height > ENGINE_LIMITS.maxPageDim) {
      issues.push({ field: "configuration", message: `Page ${i + 1} has invalid dimensions` });
      return;
    }
    if (!Array.isArray(p.elements)) {
      issues.push({ field: "configuration", message: `Page ${i + 1} elements must be an array` });
      return;
    }
    if (p.elements.length > ENGINE_LIMITS.maxElementsPerPage) issues.push({ field: "configuration", message: `Page ${i + 1} has too many elements` });
    for (const raw of p.elements) {
      if (!raw || typeof raw !== "object" || typeof (raw as { kind?: unknown }).kind !== "string") {
        issues.push({ field: "configuration", message: `Page ${i + 1} has a malformed element` });
        continue;
      }
      const el = raw as LayoutElement;
      if (!(LAYOUT_ELEMENT_KINDS as readonly string[]).includes(el.kind)) {
        issues.push({ field: "configuration", message: `Page ${i + 1} has an unknown element kind "${String(el.kind)}"` });
        continue;
      }

      const bind = (raw as { bind?: unknown }).bind;
      if (typeof bind === "string" && bind.length > 0 && !seen.has(bind)) {
        // Bindings on image/qr/badge/status must reference real fields; text may
        // bind to any field, otherwise it must exist.
        issues.push({ field: "configuration", message: `Element binds to unknown field "${bind}" on page ${i + 1}` });
      } else if (BOUND_ELEMENT_KINDS.includes(el.kind) && (typeof bind !== "string" || bind.length === 0)) {
        // An unbound image/QR/barcode/badge would render as a permanent
        // placeholder, so reject it rather than ship a broken template.
        issues.push({
          field: "configuration",
          message: `Page ${i + 1}: ${el.kind} element needs a bound field`,
        });
      }

      const extent = elementExtent(el);
      if (!extent) {
        issues.push({ field: "configuration", message: `Page ${i + 1}: ${el.kind} element has invalid geometry` });
        continue;
      }
      const min = MIN_KIND_EXTENT[el.kind];
      if (extent.w < min.w || extent.h < min.h) {
        issues.push({
          field: "configuration",
          message: `Page ${i + 1}: ${el.kind} is too small (min ${min.w}×${min.h})`,
        });
        continue;
      }
      // Anything outside the page is clipped away at export, so an off-page
      // element is a silent loss of content rather than a cosmetic problem.
      if (
        extent.x < -PAGE_SLACK ||
        extent.y < -PAGE_SLACK ||
        extent.x + extent.w > p.width + PAGE_SLACK ||
        extent.y + extent.h > p.height + PAGE_SLACK
      ) {
        issues.push({
          field: "configuration",
          message: `Page ${i + 1}: ${el.kind} is outside the page and would be clipped`,
        });
      }
    }
  });
  return issues;
}

// ─── Formatting helpers ───────────────────────────────────────────────────────

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Deterministic currency formatting (no Intl — identical in Node and browser). */
export function formatCurrency(value: string, code = "USD"): string {
  const n = Number(String(value).replace(/[^0-9.\-]/g, ""));
  if (!Number.isFinite(n)) return String(value || "");
  const sign = n < 0 ? "-" : "";
  const parts = Math.abs(n).toFixed(2).split(".");
  const grouped = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  const symbol = CURRENCY_SYMBOLS[code] ?? (code.length === 3 ? `${code} ` : "");
  return `${sign}${symbol}${grouped}.${parts[1]}`;
}

const CURRENCY_SYMBOLS: Record<string, string> = { USD: "$", EUR: "€", GBP: "£", NGN: "₦", GHS: "₵", KES: "KSh ", ZAR: "R", INR: "₹", JPY: "¥", CAD: "C$", AUD: "A$" };

/** Deterministic date display: "June 23, 2026" from "2026-06-23". */
export function formatDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  const month = MONTHS[Number(m[2]) - 1];
  return `${month} ${Number(m[3])}, ${m[1]}`;
}

export function formatTime12(value: string): string {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value);
  if (!m) return value;
  const h = Number(m[1]);
  const ampm = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${ampm}`;
}

/** Format a bound value for display honouring field type. */
export function formatValueForField(field: FieldDef | undefined, value: unknown): string {
  const str = value === true ? "Yes" : value === false ? "No" : value === null || value === undefined ? "" : String(value);
  if (!str) return "";
  if (!field) return str;
  switch (field.type) {
    case "currency": return formatCurrency(str, field.currency ?? "USD");
    case "date": return formatDate(str);
    case "time": return formatTime12(str);
    case "datetime": {
      const d = new Date(str);
      if (Number.isNaN(d.getTime())) return str;
      return `${MONTHS[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()} ${formatTime12(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`)}`;
    }
    case "reference": return str.toUpperCase();
    case "status": return str.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    case "checkbox": return str === "true" || str === "Yes" ? "Yes" : "No";
    default: return str;
  }
}

// ─── SVG rendering ────────────────────────────────────────────────────────────

export interface BuildSvgOptions {
  /** Forced when template is sensitive; layout cannot opt out. */
  sensitive?: boolean;
  /** Resolved data URLs for image fields (server resolves storage → bytes). */
  images?: Record<string, string>;
  /** Stamp wording override (defaults shown below). */
  watermarkText?: string;
}

const DEFAULT_WATERMARK = "SPECIMEN · NOT VALID";
const WATERMARK_NOTICE = "SPECIMEN COPY — NOT A REAL DOCUMENT, CREDENTIAL OR FINANCIAL RECORD";

function renderTextElement(el: Extract<LayoutElement, { kind: "text" }>, values: DocumentValues, schema: TemplateSchema): string {
  const field = schema.fields.find((f) => f.id === el.bind);
  let content = el.text ?? "";
  if (el.bind) content = formatValueForField(field, values[el.bind] ?? "");
  if (!content) return "";
  if (el.maxChars && content.length > el.maxChars) content = `${content.slice(0, Math.max(0, el.maxChars - 1))}…`;
  if (el.uppercase) content = content.toUpperCase();
  const size = el.size ?? 16;
  const family = FONT_STACK[el.family ?? "sans"];
  const weight = el.weight ?? 400;
  const anchor = el.align === "center" ? "middle" : el.align === "right" ? "end" : "start";
  const x = el.align === "center" ? el.x + (el.w ?? 0) / 2 : el.align === "right" ? el.x + (el.w ?? 0) : el.x;
  const attrs = [
    `x="${x}"`, `y="${el.y}"`,
    el.w ? `textLength="${el.w}" lengthAdjust="spacingAndGlyphs"` : "",
    `font-family="${escapeXml(family)}"`, `font-size="${size}"`,
    `font-weight="${weight}"`, `fill="${escapeXml(el.color ?? "#0f172a")}"`,
    `text-anchor="${anchor}"`,
    el.italic ? `font-style="italic"` : "",
    el.letterSpacing ? `letter-spacing="${el.letterSpacing}"` : "",
  ].filter(Boolean).join(" ");
  const lineHeight = el.lineHeight ?? size * 1.35;
  const lines = content.split("\n");
  const tspans = lines
    .map((line, i) => `<tspan x="${x}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join("");
  return `<text ${attrs} xml:space="preserve">${tspans}</text>`;
}

function renderBadge(el: Extract<LayoutElement, { kind: "badge" }>, values: DocumentValues, schema: TemplateSchema): string {
  const field = schema.fields.find((f) => f.id === el.bind);
  const raw = String(values[el.bind] ?? "").toLowerCase();
  if (!raw) return "";
  const colors = STATUS_COLORS[raw] ?? { fill: "#e2e8f0", text: "#334155" };
  const label = formatValueForField(field, raw);
  const size = el.size ?? 13;
  const w = el.w ?? Math.max(70, label.length * size * 0.68 + 24);
  const h = el.h ?? size + 16;
  return [
    `<rect x="${el.x}" y="${el.y}" width="${w}" height="${h}" rx="${h / 2}" fill="${colors.fill}"/>`,
    `<text x="${el.x + w / 2}" y="${el.y + h / 2 + size * 0.36}" font-family="${escapeXml(FONT_STACK.sans)}" font-size="${size}" font-weight="700" fill="${colors.text}" text-anchor="middle">${escapeXml(label)}</text>`,
  ].join("");
}

function renderImage(el: Extract<LayoutElement, { kind: "image" }>, options: BuildSvgOptions): string {
  const src = options.images?.[el.bind] ?? "";
  if (!isSafeImageDataUrl(src)) {
    return [
      `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" rx="${el.rx ?? 0}" fill="#e2e8f0"/>`,
      `<text x="${el.x + el.w / 2}" y="${el.y + el.h / 2 + 5}" font-family="${escapeXml(FONT_STACK.sans)}" font-size="13" fill="#64748b" text-anchor="middle">Image</text>`,
    ].join("");
  }
  // preserveAspectRatio implements cover/contain without clip paths for contain;
  // cover uses a clipPath referenced by id scoped to the element index.
  const clipId = `clip${Math.round(el.x)}_${Math.round(el.y)}_${el.w}`;
  const par = (el.fit ?? "cover") === "contain" ? "xMidYMid meet" : "xMidYMid slice";
  if (par === "xMidYMid meet") {
    return `<image x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" href="${src}" preserveAspectRatio="${par}"${el.rx ? ` clip-path="url(#${clipId})"` : ""}/>` + (el.rx ? `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" rx="${el.rx}" fill="none" stroke="rgba(15,23,42,0.08)"/>` : "");
  }
  return [
    el.rx ? `<clipPath id="${clipId}"><rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" rx="${el.rx}"/></clipPath>` : "",
    `<image x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" href="${src}" preserveAspectRatio="${par}" clip-path="url(#${clipId})"/>`,
  ].join("");
}

function renderQr(el: Extract<LayoutElement, { kind: "qr" }>, values: DocumentValues): string {
  const value = String(values[el.bind] ?? "");
  if (!value) return "";
  const { size: modules, path } = qrToSvgPath(value.slice(0, 400));
  const m = el.size / modules;
  const bg = el.bg ?? "#ffffff";
  const fg = el.color ?? "#0f172a";
  return [
    `<rect x="${el.x}" y="${el.y}" width="${el.size}" height="${el.size}" fill="${bg}"/>`,
    `<g transform="translate(${el.x} ${el.y}) scale(${m})"><path d="${path}" fill="${fg}"/></g>`,
  ].join("");
}

function renderBarcode(el: Extract<LayoutElement, { kind: "barcode" }>, values: DocumentValues): string {
  const value = String(values[el.bind] ?? "");
  if (!value) return "";
  try {
    const h = el.h ?? 60;
    const targetW = el.w ?? 240;
    const { width, height, bars } = code128Svg(value.toUpperCase().slice(0, 60), { moduleWidth: 2, height: h });
    const scale = targetW / width;
    const fg = el.color ?? "#0f172a";
    const rects = bars.map((b) => `<rect x="${(el.x + b.x * scale).toFixed(2)}" y="${el.y}" width="${Math.max(0.6, b.width * scale).toFixed(2)}" height="${height}" fill="${fg}"/>`).join("");
    return rects;
  } catch {
    return "";
  }
}

/** Forced stamp block — appended AFTER layout elements so nothing covers it. */
function renderWatermark(page: TemplatePage, text: string): string {
  const cx = page.width / 2;
  const cy = page.height / 2;
  const noticeY = page.height - 26;
  return [
    `<g opacity="0.16" transform="rotate(-28 ${cx} ${cy})" pointer-events="none">`,
    `<text x="${cx}" y="${cy}" font-family="${escapeXml(FONT_STACK.sans)}" font-size="${Math.max(46, page.width / 11)}" font-weight="800" fill="#dc2626" text-anchor="middle" letter-spacing="6">${escapeXml(text)}</text>`,
    `</g>`,
    `<rect x="0" y="${noticeY - 16}" width="${page.width}" height="42" fill="#dc2626" opacity="0.92"/>`,
    `<text x="${cx}" y="${noticeY + 11}" font-family="${escapeXml(FONT_STACK.sans)}" font-size="13" font-weight="700" fill="#ffffff" text-anchor="middle" letter-spacing="1.5">${escapeXml(WATERMARK_NOTICE)}</text>`,
  ].join("");
}

/** Render one page to an SVG string. */
export function buildPageSvg(
  page: TemplatePage,
  schema: TemplateSchema,
  values: DocumentValues,
  options: BuildSvgOptions = {},
  scale = 1,
): string {
  const width = Math.round(page.width * scale);
  const height = Math.round(page.height * scale);
  const body = page.elements
    .map((el) => {
      switch (el.kind) {
        case "text": return renderTextElement(el, values, schema);
        case "rect":
          return `<rect x="${el.x}" y="${el.y}" width="${el.w}" height="${el.h}" rx="${el.rx ?? 0}" fill="${el.fill ?? "#f1f5f9"}"${el.stroke ? ` stroke="${escapeXml(el.stroke)}" stroke-width="${el.strokeWidth ?? 1}"` : ""}${el.opacity !== undefined ? ` opacity="${el.opacity}"` : ""}/>`;
        case "line":
          return `<line x1="${el.x1}" y1="${el.y1}" x2="${el.x2}" y2="${el.y2}" stroke="${escapeXml(el.stroke ?? "#cbd5e1")}" stroke-width="${el.strokeWidth ?? 1}"/>`;
        case "image": return renderImage(el, options);
        case "qr": return renderQr(el, values);
        case "barcode": return renderBarcode(el, values);
        case "badge": return renderBadge(el, values, schema);
        default: return "";
      }
    })
    .join("");
  const watermark = options.sensitive ? renderWatermark(page, options.watermarkText ?? DEFAULT_WATERMARK) : "";
  const bg = page.background ?? "#ffffff";
  // Artwork underlay: only a validated `data:` image URL ever reaches the SVG.
  const underlay =
    page.backgroundImage && isSafeImageDataUrl(page.backgroundImage)
      ? `<image x="0" y="0" width="${page.width}" height="${page.height}" href="${page.backgroundImage}" preserveAspectRatio="xMidYMid slice"/>`
      : "";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${page.width} ${page.height}">`,
    `<rect width="100%" height="100%" fill="${escapeXml(bg)}"/>`,
    underlay,
    body,
    watermark,
    `</svg>`,
  ].join("");
}

/** Render every page of a template configuration. */
export function buildDocumentSvgs(
  configuration: TemplateConfiguration,
  schema: TemplateSchema,
  values: DocumentValues,
  options: BuildSvgOptions = {},
): string[] {
  const scale = Math.min(Math.max(configuration.renderScale ?? ENGINE_LIMITS.defaultRenderScale, 1), ENGINE_LIMITS.maxRenderScale);
  return configuration.pages.map((p) => buildPageSvg(p, schema, values, options, scale));
}

/** Single-page convenience used by live preview (scale 1). */
export function buildPreviewSvg(
  configuration: TemplateConfiguration,
  schema: TemplateSchema,
  values: DocumentValues,
  options: BuildSvgOptions = {},
): string {
  const page = configuration.pages[0];
  if (!page) return "";
  return buildPageSvg(page, schema, values, options, 1);
}

/** Stable SVG → data URL for <img> preview and canvas rasterization. */
export function svgToDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

// ─── Share slugs ──────────────────────────────────────────────────────────────

const SLUG_ALPHABET = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous

/** Unguessable share slug: 24 chars ≈ 131 bits from crypto RNG. */
export function generateShareSlug(): string {
  const bytes = new Uint8Array(24);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += SLUG_ALPHABET[b % SLUG_ALPHABET.length];
  return out;
}

export function isValidShareSlug(slug: unknown): slug is string {
  return typeof slug === "string" && slug.length === 24 && [...slug].every((c) => SLUG_ALPHABET.includes(c));
}

// ─── Credits ──────────────────────────────────────────────────────────────────

export interface CreditSettings {
  imageCost: number;
  pdfCost: number;
}

export const DEFAULT_CREDIT_SETTINGS: CreditSettings = { imageCost: 20, pdfCost: 40 };

/**
 * Final charge = max(platform base for the format, premium template cost).
 * Platform base comes from admin settings / pointPricing overrides (resolved
 * server-side); `requiredCredits` lets a premium template charge more.
 */
export function resolveRenderCost(base: number, templateRequiredCredits: number | undefined, fallback: number): number {
  const platformBase = Number.isFinite(base) && base >= 0 ? base : fallback;
  const premium = templateRequiredCredits && templateRequiredCredits > 0 ? templateRequiredCredits : 0;
  return Math.max(platformBase, premium);
}

/** Idempotency key for a render debit — retries with the same attempt never double-charge. */
export function renderIdempotencyKey(documentId: string, format: "image" | "pdf", attemptId: string): string {
  return `docrender:${format}:${documentId}:${attemptId}`;
}

export function refundIdempotencyKey(attemptId: string): string {
  return `docrender-refund:${attemptId}`;
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────

export const DOC_STATUSES = [
  "draft", "ready", "rendering", "completed", "shared",
  "failed", "revoked", "expired", "archived",
] as const;
export type DocStatus = (typeof DOC_STATUSES)[number];

export function shareState(doc: { isPublic?: boolean; status?: string; expiresAt?: number; revokedAt?: number }, now = Date.now()): "private" | "active" | "expired" | "revoked" {
  if (doc.revokedAt) return "revoked";
  if (!doc.isPublic) return "private";
  if (doc.expiresAt && doc.expiresAt < now) return "expired";
  return "active";
}
