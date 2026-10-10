/**
 * Tenant host resolver — client side.
 * Extracts tenant subdomain for *.g0ki.com wildcard routing.
 * Used by TenantGate and customer portal to resolve tenant context
 * before rendering tenant-scoped UI.
 */

export function getHost(): string {
  if (typeof window === "undefined") return "";
  return window.location.host.toLowerCase();
}

/**
 * Hosts that serve the app itself (the apex domain), never a tenant subdomain.
 *
 * `cloudieexpress.duckdns.org` is this app's own production domain; the other
 * entries are platform hosts. Without this guard the generic branch at the
 * bottom of `extractSubdomain` reports a tenant for an apex host — the first
 * label of `cloudieexpress.duckdns.org` would resolve as tenant "cloudieexpress",
 * which is a different product surface (banking portals) than the app shell.
 * Tenant sites stay on `<tenant>.g0ki.com` and the `/site/<id>` path form.
 */
export const APP_APEX_HOSTS = [
  "cloudieexpress.duckdns.org",
  "g0ki.com",
  "vly.sh",
  "vercel.app",
  "convex.site",
  "convex.cloud",
] as const;

function isAppApexHost(host: string): boolean {
  return (APP_APEX_HOSTS as readonly string[]).includes(host);
}

export function extractSubdomain(host = getHost()): string | null {
  const h = host.split(":")[0] ?? host;
  if (isAppApexHost(h)) return null;
  const suffixes = [".g0ki.com", ".vercel.app", ".convex.site", ".convex.cloud", ".vly.sh"];
  for (const sfx of suffixes) {
    if (h.endsWith(sfx)) {
      const prefix = h.slice(0, -sfx.length);
      const label = prefix.split(".")[0]?.trim();
      if (label && label !== "www" && label.length >= 2) return label.toLowerCase();
      return null;
    }
  }
  const parts = h.split(".");
  if (parts.length >= 2 && h !== "localhost") {
    const first = parts[0]?.trim();
    if (first && first !== "www" && first.length >= 2) return first.toLowerCase();
  }
  return null;
}

export function tenantUrl(subdomain: string, path = "/banking"): string {
  if (typeof window === "undefined") return `/site/${subdomain}${path}`;
  const host = window.location.host;
  // If we are already on a wildcard host, navigate within host.
  // Otherwise use the path-based fallback /site/:id.
  if (host.endsWith(".g0ki.com")) return `${path}`;
  return `/site/${subdomain}${path}`;
}

export function formatTenantDomain(subdomain: string): string {
  return `${subdomain}.g0ki.com`;
}
