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

export const DEFAULT_BRAND: BrandConfig = {
  name: "Cloudie",
  tagline: "Operations platform",
  accent: "#087f73",
  accentDark: "#53d0bf",
  footerNote: "Built for modern operations.",
  logoUrl: "",
  defaultMode: "system",
};

export const DEFAULT_SUPPORT: SupportConfig = {
  email: "support@cloudie.app",
  phone: "+1 (800) 555-0142",
  whatsapp: "",
  hours: "Mon–Fri · 08:00–20:00 UTC",
  helpCenterUrl: "",
  widgetEnabled: true,
  widgetTitle: "Cloudie Support",
  widgetMessage: "Questions about a shipment, document or points balance? Our operations desk replies within one business day.",
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
  return {
    name: text(raw.name, DEFAULT_BRAND.name, 60),
    tagline: text(raw.tagline, DEFAULT_BRAND.tagline, 80),
    accent: hex(raw.accent, DEFAULT_BRAND.accent),
    accentDark: hex(raw.accentDark, DEFAULT_BRAND.accentDark),
    footerNote: text(raw.footerNote, DEFAULT_BRAND.footerNote, 160),
    logoUrl: url(raw.logoUrl, ""),
    defaultMode: mode === "light" || mode === "dark" || mode === "system" ? mode : DEFAULT_BRAND.defaultMode,
  };
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
    widgetTitle: text(raw.widgetTitle, DEFAULT_SUPPORT.widgetTitle, 80),
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

/** CSS injected at runtime so admin-chosen accents win over the design tokens. */
export function brandCssVars(brand: BrandConfig): string {
  const lightFg = isLight(brand.accent) ? "#0b1f1d" : "#f3fffc";
  const darkFg = isLight(brand.accentDark) ? "#08211e" : "#052521";
  return [
    `:root{${accentBlock(brand.accent, lightFg)}}`,
    `.dark{${accentBlock(brand.accentDark, darkFg)}}`,
  ].join("\n");
}

export function supportHasContact(support: SupportConfig): boolean {
  return Boolean(support.email || support.phone || support.whatsapp || support.helpCenterUrl);
}
