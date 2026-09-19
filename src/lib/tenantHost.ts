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

export function extractSubdomain(host = getHost()): string | null {
  const h = host.split(":")[0] ?? host;
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
