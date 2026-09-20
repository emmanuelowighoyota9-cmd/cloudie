/**
 * Classifies the `:siteId` / `:tenant` route param used by the banking portal.
 *
 * Convex document ids are long opaque strings; tenant subdomains are short slugs.
 * Both routes (`/site/:siteId/banking` and `/:tenant/banking`) funnel through this
 * so a slug is never handed to Convex as an id (which would fail arg validation) and
 * an id is never looked up as a subdomain.
 */
export const CONVEX_ID_MIN_LENGTH = 20;

export type TenantParamKind = "id" | "subdomain" | "empty";

/** Convex document ids are long, lowercase, and contain no separators. */
const CONVEX_ID_SHAPE = /^[a-z0-9]+$/;

export function classifyTenantParam(raw: string | undefined | null): TenantParamKind {
  const value = (raw ?? "").trim();
  if (!value) return "empty";
  // Tenant slugs frequently exceed 20 characters (e.g. "crestline-capitalfive"),
  // so length alone is not enough — require the Convex id shape too.
  if (value.length >= CONVEX_ID_MIN_LENGTH && CONVEX_ID_SHAPE.test(value)) return "id";
  return "subdomain";
}
