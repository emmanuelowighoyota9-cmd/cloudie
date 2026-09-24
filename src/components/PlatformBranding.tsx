import { useEffect } from "react";
import { brandCssVars } from "@/lib/platformConfig";
import { usePlatformConfig } from "@/hooks/use-platform-config";

/**
 * Applies admin-configured branding at runtime:
 *  - overrides the accent design tokens (light + dark) via a single <style> tag
 *  - keeps the browser/document title in sync with the configured product name
 * Mounted once, above the router, so every surface (public + authenticated) picks
 * up appearance changes live.
 */
export function PlatformBranding() {
  const { brand } = usePlatformConfig();

  useEffect(() => {
    const id = "cloudie-brand-tokens";
    let el = document.getElementById(id) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement("style");
      el.id = id;
      document.head.appendChild(el);
    }
    el.textContent = brandCssVars(brand);
  }, [brand]);

  // Apply the admin-configured default colour scheme for first-time visitors.
  // Deferred to a macrotask so it lands after ThemeProvider's mount effect, and
  // skipped entirely once the visitor has stored their own preference.
  useEffect(() => {
    if (brand.defaultMode === "system") return;
    if (localStorage.getItem("cloudie-theme")) return;
    const timer = window.setTimeout(() => {
      if (localStorage.getItem("cloudie-theme")) return;
      const root = document.documentElement;
      root.classList.remove("light", "dark");
      root.classList.add(brand.defaultMode);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [brand.defaultMode]);

  useEffect(() => {
    document.title = `${brand.name} · ${brand.tagline}`;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", brand.accent);
  }, [brand.name, brand.tagline, brand.accent]);

  return null;
}
