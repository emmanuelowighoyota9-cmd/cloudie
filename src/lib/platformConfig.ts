/**
 * Platform appearance + customer-support configuration.
 *
 * Shared by the Convex backend (reads/writes `adminSettings` rows) and the
 * frontend (brand tokens, support widget, admin editor). Everything here is
 * plain data: safe for both server and browser bundling, no secrets.
 */

export interface BrandConfig {
  /** Product name shown in the app shell, landing page and document titles. */
  name: string;
  /** Short descriptor used in the browser title. */
  tagline: string;
  /** Accent hex applied to --primary / --ring in light mode. */
  accent: string;
  /** Accent hex applied to --primary / --ring in dark mode. */
  accentDark: string;
  /** Footer/copyright note on public pages. */
  footerNote: string;
  /** Optional absolute logo URL (falls back to the built-in Cloud mark). */
  logoUrl: string;
  /** Preferred starting colour scheme for first-time visitors. */
  defaultMode: "light" | "dark" | "system";
}

export interface SupportFaq {
  question: string;
  answer: string;
}

export interface SupportConfig {
  email: string;
  phone: string;
  /** International number without '+' or spaces, e.g. 15551234567. */
  whatsapp: string;
  hours: string;
  /** Absolute https URL to a help centre / knowledge base. */
  helpCenterUrl: string;
  /** Master switch for the in-app support launcher. */
  widgetEnabled: boolean;
  widgetTitle: string;
  widgetMessage: string;
  faqs: SupportFaq[];
}

export const QUICK_ACTION_KINDS = [
  "shipment",
  "points",
  "document",
  "orders",
  "tracking",
  "wallet",
  "marketplace",
  "support",
] as const;

export type QuickActionKind = (typeof QUICK_ACTION_KINDS)[number];

export interface QuickActionConfig {
  kind: QuickActionKind;
  label: string;
}

export interface QuickActionCatalogItem extends QuickActionConfig {
  path: string;
}

export const QUICK_ACTION_CATALOG: QuickActionCatalogItem[] = [
  { kind: "shipment", label: "Shipment", path: "/shipments/new" },
  { kind: "points", label: "Points", path: "/buy-points" },
  { kind: "document", label: "Document", path: "/documents/own/new" },
  { kind: "orders", label: "Orders", path: "/orders" },
  { kind: "tracking", label: "Track", path: "/track" },
  { kind: "wallet", label: "Wallet", path: "/wallet" },
  { kind: "marketplace", label: "Market", path: "/marketplace" },
  { kind: "support", label: "Support", path: "/support" },
];

export const DEFAULT_BRAND: BrandConfig = {
  name: "Cloudie Operations",
  tagline: "Shipment, document & payments workspace",
  // Both modes carry the enterprise emerald. The product ships dark-only, so
  // `accent` and `accentDark` are kept in step rather than drifting apart.
  accent: "#10b981",
  accentDark: "#10b981",
  footerNote: "Move every shipment with confidence.",
  logoUrl: "",
  defaultMode: "dark",
};

export const DEFAULT_QUICK_ACTIONS: QuickActionConfig[] = [
  { kind: "shipment", label: "Shipment" },
  { kind: "points", label: "Points" },
  { kind: "document", label: "Document" },
  { kind: "orders", label: "Orders" },
];

export const DEFAULT_SUPPORT: SupportConfig = {
  email: "support@crestlineexpress.com",
  phone: "+1 (800) 555-0142",
  whatsapp: "",
  hours: "Mon–Fri · 08:00–20:00 UTC",
  helpCenterUrl: "",
  widgetEnabled: true,
  widgetTitle: "Crestline Express Support",
  widgetMessage: "Questions about a shipment, route or delivery update? Our operations desk replies within one business day.",
  faqs: [
    {
      question: "Where do I start a shipment?",
      answer: "Open Shipments → New shipment. Add the sender, receiver and package details; a live tracking number is generated immediately.",
    },
    {
      question: "How do document credits work?",
      answer: "Every render (PNG image or PDF) is charged to your points balance from the unified ledger. Your remaining balance is always visible in the top bar.",
    },
    {
      question: "How do I track a package without an account?",
      answer: "Use the public tracking page at /track and enter the tracking number. No sign-in is required for tracking lookups.",
    },
  ],
};

const MAX_TEXT = 400;
const MAX_URL = 400;

function text(value: unknown, fallback: string, max = MAX_TEXT): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : fallback;
}

function optionalText(value: unknown, max = MAX_TEXT): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function flag(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

/** Only 6-digit hex colours are accepted, so a bad value can never break the theme. */
function hex(value: unknown, fallback: string): string {
  return typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim())
    ? value.trim().toLowerCase()
    : fallback;
}

/** Absolute http(s) URLs only — blocks javascript:/data: from config. */
function url(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = value.trim().slice(0, MAX_URL);
  if (!trimmed) return fallback;
  return /^https?:\/\/[^\s]+$/i.test(trimmed) ? trimmed : fallback;
}

function phoneDigits(value: unknown): string {
  if (typeof value !== "string") return "";
  return value.replace(/[^0-9]/g, "").slice(0, 15);
}

/** Merge an untrusted stored/requested value with the defaults. */
export function sanitizeBrand(input: unknown): BrandConfig {
  const raw = (input ?? {}) as Record<string, unknown>;
  const mode = raw.defaultMode;
  const legacyName = raw.name === "Cloudie" || raw.name === "Cloudie Operations Platform";
  const legacyTagline = raw.tagline === "Operations platform";
  return {
    name: legacyName ? DEFAULT_BRAND.name : text(raw.name, DEFAULT_BRAND.name, 60),
    tagline: legacyTagline ? DEFAULT_BRAND.tagline : text(raw.tagline, DEFAULT_BRAND.tagline, 80),
    accent: hex(raw.accent, DEFAULT_BRAND.accent),
    accentDark: hex(raw.accentDark, DEFAULT_BRAND.accentDark),
    footerNote: text(raw.footerNote, DEFAULT_BRAND.footerNote, 160),
    logoUrl: url(raw.logoUrl, ""),
    defaultMode: mode === "light" || mode === "dark" || mode === "system" ? mode : DEFAULT_BRAND.defaultMode,
  };
}

export function sanitizeQuickActions(input: unknown): QuickActionConfig[] {
  if (!Array.isArray(input)) return DEFAULT_QUICK_ACTIONS;
  const seen = new Set<QuickActionKind>();
  const actions: QuickActionConfig[] = [];

  for (const item of input.slice(0, 4)) {
    const row = (item ?? {}) as Record<string, unknown>;
    if (typeof row.kind !== "string") continue;
    const catalogItem = QUICK_ACTION_CATALOG.find((candidate) => candidate.kind === row.kind);
    if (!catalogItem || seen.has(catalogItem.kind)) continue;
    seen.add(catalogItem.kind);
    actions.push({
      kind: catalogItem.kind,
      label: optionalText(row.label, 24) || catalogItem.label,
    });
  }

  return actions;
}

export function sanitizeSupport(input: unknown): SupportConfig {
  const raw = (input ?? {}) as Record<string, unknown>;
  const faqs = Array.isArray(raw.faqs) ? raw.faqs : [];
  return {
    email: optionalText(raw.email, 160),
    phone: optionalText(raw.phone, 40),
    whatsapp: phoneDigits(raw.whatsapp),
    hours: optionalText(raw.hours, 120),
    helpCenterUrl: url(raw.helpCenterUrl, ""),
    widgetEnabled: flag(raw.widgetEnabled, DEFAULT_SUPPORT.widgetEnabled),
    widgetTitle: raw.widgetTitle === "Cloudie Support"
      ? DEFAULT_SUPPORT.widgetTitle
      : text(raw.widgetTitle, DEFAULT_SUPPORT.widgetTitle, 80),
    widgetMessage: text(raw.widgetMessage, DEFAULT_SUPPORT.widgetMessage, 300),
    faqs: faqs
      .slice(0, 8)
      .map((item) => {
        const row = (item ?? {}) as Record<string, unknown>;
        return { question: optionalText(row.question, 160), answer: optionalText(row.answer, 600) };
      })
      .filter((row) => row.question && row.answer),
  };
}

/** Relative luminance test used to pick a readable foreground for the accent. */
function isLight(hexColor: string): boolean {
  const value = hexColor.replace("#", "");
  const r = parseInt(value.slice(0, 2), 16) / 255;
  const g = parseInt(value.slice(2, 4), 16) / 255;
  const b = parseInt(value.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.62;
}

function accentBlock(accent: string, foreground: string): string {
  return [
    `--primary:${accent}`,
    `--primary-foreground:${foreground}`,
    `--ring:${accent}`,
    `--sidebar-primary:${accent}`,
    `--sidebar-ring:${accent}`,
  ].join(";");
}

/**
 * CSS injected at runtime so an admin-chosen accent wins over the design
 * tokens.
 *
 * Cloudie is a dark-only product: one black surface, one accent. So this emits
 * a single block applied to both `:root` and `.dark` instead of two competing
 * palettes. The accent lives on `accentDark` because every surface an accent
 * is drawn against is a dark one.
 */
export function brandCssVars(brand: BrandConfig): string {
  const accent = brand.accentDark;
  const foreground = isLight(accent) ? "#04120c" : "#ffffff";
  return `:root,.dark{${accentBlock(accent, foreground)}}`;
}

export function supportHasContact(support: SupportConfig): boolean {
  return Boolean(support.email || support.phone || support.whatsapp || support.helpCenterUrl);
}
