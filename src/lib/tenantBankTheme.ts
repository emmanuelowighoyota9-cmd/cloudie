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
  tagline: string | null;
  heroHeadline: string | null;
  customerAppStyle: string | null;
  adminConsoleStyle: string | null;
  templateSlug: string | null;
};

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
  };
}
