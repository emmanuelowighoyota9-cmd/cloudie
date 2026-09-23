/**
 * Tenant banking design kit.
 *
 * Banking templates provisioned from the super-admin console write a full design
 * kit onto `tenantSites.branding` (palette, theme mode, surface, radius, copy).
 * The tenant's customer app and admin console read it through this helper so a
 * template choice is visible everywhere without per-tenant styling code.
 */

import type { CSSProperties } from "react";

export type TenantBranding = {
  logo?: string;
  primaryColor?: string;
  accentColor?: string;
  themeMode?: string;
  surfaceColor?: string;
  radius?: string;
  tagline?: string;
  heroHeadline?: string;
  customerAppStyle?: string;
  adminConsoleStyle?: string;
  templateSlug?: string;
} | null | undefined;

export type BankTheme = {
  mode: "light" | "dark";
  isDark: boolean;
  primary: string;
  accent: string;
  radius: string;
  surface: string;
  panel: string;
  panelMuted: string;
  border: string;
  text: string;
  muted: string;
  accentSoft: string;
  /** Wells and inputs that must sit slightly off the panel colour. */
  inputBg: string;
  /** Row / cell hover tint. */
  hoverBg: string;
  /** Divider inside a panel. */
  divider: string;
  /** Secondary surface used for striped rows and quiet blocks. */
  subtle: string;
  tagline: string | null;
  heroHeadline: string | null;
  customerAppStyle: string | null;
  adminConsoleStyle: string | null;
  templateSlug: string | null;
};

export type BankTone = "success" | "warning" | "danger" | "info" | "neutral";

/** Semantic status colours that stay legible on both light and dark kits. */
export function bankTone(theme: BankTheme, tone: BankTone): { bg: string; fg: string; border: string } {
  const dark = theme.isDark;
  const map: Record<BankTone, { l: [string, string, string]; d: [string, string, string] }> = {
    success: { l: ["#ECFDF5", "#047857", "#A7F3D0"], d: ["rgba(16,185,129,0.14)", "#6EE7B7", "rgba(16,185,129,0.35)"] },
    warning: { l: ["#FFFBEB", "#B45309", "#FDE68A"], d: ["rgba(245,158,11,0.14)", "#FCD34D", "rgba(245,158,11,0.35)"] },
    danger: { l: ["#FEF2F2", "#B91C1C", "#FECACA"], d: ["rgba(239,68,68,0.14)", "#FCA5A5", "rgba(239,68,68,0.35)"] },
    info: { l: ["#EFF6FF", "#1D4ED8", "#BFDBFE"], d: ["rgba(59,130,246,0.14)", "#93C5FD", "rgba(59,130,246,0.35)"] },
    neutral: { l: ["#F1F5F9", "#475569", "#E2E8F0"], d: ["rgba(255,255,255,0.07)", theme.text, "rgba(255,255,255,0.18)"] },
  };
  const [bg, fg, border] = (dark ? map[tone].d : map[tone].l) as [string, string, string];
  return { bg, fg, border };
}

const DEFAULTS = {
  primary: "#003087",
  accent: "#0050a0",
  radius: "0.75rem",
};

function withAlpha(hex: string, alpha: string): string {
  const value = hex?.trim() ?? "";
  if (!/^#([0-9a-f]{6})$/i.test(value)) return `rgba(15,23,42,0.06)`;
  return `${value}${alpha}`;
}

export function bankTheme(branding: TenantBranding): BankTheme {
  const isDark = branding?.themeMode === "dark";
  const primary = branding?.primaryColor || DEFAULTS.primary;
  const accent = branding?.accentColor || DEFAULTS.accent;
  return {
    mode: isDark ? "dark" : "light",
    isDark,
    primary,
    accent,
    radius: branding?.radius || DEFAULTS.radius,
    surface: branding?.surfaceColor || (isDark ? "#0B1220" : "#F8FAFC"),
    panel: isDark ? "#131E31" : "#FFFFFF",
    panelMuted: isDark ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.03)",
    border: isDark ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.10)",
    text: isDark ? "#E8EEF9" : "#0F172A",
    muted: isDark ? "rgba(232,238,249,0.64)" : "#64748B",
    accentSoft: withAlpha(accent, "1F"),
    inputBg: isDark ? "rgba(255,255,255,0.06)" : "#FFFFFF",
    hoverBg: isDark ? "rgba(255,255,255,0.05)" : "rgba(15,23,42,0.03)",
    divider: isDark ? "rgba(255,255,255,0.08)" : "rgba(15,23,42,0.06)",
    subtle: isDark ? "rgba(255,255,255,0.03)" : "#F8FAFC",
    tagline: branding?.tagline ?? null,
    heroHeadline: branding?.heroHeadline ?? null,
    customerAppStyle: branding?.customerAppStyle ?? null,
    adminConsoleStyle: branding?.adminConsoleStyle ?? null,
    templateSlug: branding?.templateSlug ?? null,
  };
}

/** Convenience: CSS custom properties for a themed subtree. */
export function bankThemeVars(theme: BankTheme): CSSProperties {
  return {
    ["--bank-primary" as string]: theme.primary,
    ["--bank-accent" as string]: theme.accent,
    ["--bank-surface" as string]: theme.surface,
    ["--bank-panel" as string]: theme.panel,
    ["--bank-border" as string]: theme.border,
    ["--bank-text" as string]: theme.text,
    ["--bank-radius" as string]: theme.radius,
    ["--bank-input" as string]: theme.inputBg,
    ["--bank-hover" as string]: theme.hoverBg,
    ["--bank-divider" as string]: theme.divider,
  };
}
