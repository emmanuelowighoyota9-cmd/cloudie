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

  // Cloudie is dark-only, so the colour scheme is pinned here rather than read
  // from the stored brand config. A configured "light" default would strip the
  // `dark` class and silently strand every `dark:` utility in the app on
  // colours this design system no longer defines.
  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light");
    root.classList.add("dark");
    root.style.colorScheme = "dark";
  }, []);

  useEffect(() => {
    document.title = `${brand.name} · ${brand.tagline}`;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) return;
    // Browser chrome frames a black page, so it takes the background token
    // rather than the accent — an emerald status bar around black content reads
    // as a rendering glitch.
    const background = getComputedStyle(document.documentElement)
      .getPropertyValue("--background")
      .trim();
    meta.setAttribute("content", background || "#000000");
  }, [brand.name, brand.tagline]);

  return null;
}
