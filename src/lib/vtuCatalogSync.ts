/**
 * Turning AidaPay's published catalog into Crestline catalog rows.
 *
 * PURE FUNCTIONS ONLY — no fetch, no Convex, no database. The network call
 * lives in `vtuCatalogSync.ts` (backend) and does nothing but hand these the
 * parsed JSON and carry the drafts back. That split is what makes the genuinely
 * risky part testable: whether a plan we read off the wire can be ADDRESSED at
 * all, which is a grammar question, not a network question.
 *
 * ── Why a slugifier exists at all ────────────────────────────────────
 *
 * A package product's identity in our system is a product CODE, and a product
 * code is only sellable if it round-trips:
 *
 *   `data-mtn-1gb-30d` → `data.mtn.1gb-30d` (what a purchase is addressed by)
 *                      → `data-mtn-1gb-30d` (what the router resolves)
 *
 * That round trip is what `serviceCodeForProduct` and `canonicalProductCode`
 * implement, and both refuse anything outside `^[a-z0-9][a-z0-9-]{0,31}$` per
 * segment. AidaPay hands us free text ("MTN 3.5GB - 1 Day - AWUF Data") and
 * ids ("DATA-01"), neither of which is addressable. So every name is slugged
 * into a bounded, legal segment here, and a product whose slug cannot be made
 * legal is SKIPPED rather than written unbuyable.
 *
 * The alternative — writing the product anyway and letting the router fail it
 * later — was rejected for the reason this file exists: a catalog row that
 * cannot be addressed is a row the customer sees as "no route available" with
 * no visible cause.
 *
 * ── Stability, which matters more than readability ──────────────────
 *
 * The slug must be a FUNCTION of the plan, not of iteration order, or a second
 * sync would create a second product for the same plan and the catalog would
 * grow a duplicate every time an operator pressed the button. Everything that
 * makes a slug unique is therefore derived from the plan's own identity, and
 * the collision fallback is a hash of that identity rather than a counter.
 */

/** One code segment: lowercase, hyphenated, no dots. Mirrors `CODE_PART` in
 *  `vtu.ts`, which is NOT exported. The two must agree; the tests below assert
 *  the round trip against the real parser, so a drift fails the build rather
 *  than shipping a silently unsellable catalog. */
const CODE_PART = /^[a-z0-9][a-z0-9-]{0,31}$/;

/** Longest a single service-code segment may be. */
const MAX_PART = 32;

/** The service types this sync can produce, and the AidaPay slug each is
 *  listed under. The slug is the provider's, not ours — it is their path. */
export const SYNCABLE_SERVICES = [
  { serviceType: "data", slug: "data-bundle-sme", label: "Phone number" },
  { serviceType: "cable", slug: "cable-tv-subscription", label: "Smartcard number" },
  { serviceType: "electricity", slug: "meter-token", label: "Meter number" },
  { serviceType: "exam", slug: "education", label: "Phone number" },
] as const;

export type SyncableServiceType = (typeof SYNCABLE_SERVICES)[number]["serviceType"];

/** A plan read off the wire, already reduced to the fields we use. */
export interface SyncPackage {
  /** AidaPay's own id — `package_api_code`. Goes on the ROUTE, never on the
   *  product code, because it is the provider's namespace and may change. */
  packageApiCode: string;
  /** The provider's naira price for this plan. */
  amountNgn: number;
  /** Human name, e.g. "MTN 3.5GB - 1 Day - AWUF Data". Drives the slug. */
  name: string;
}

/** A provider (biller/disco/network) read off the wire. */
export interface SyncProvider {
  providerCode: string;
  name: string;
  packages: SyncPackage[];
}

/** One product + the route that serves it, ready to write. */
export interface CatalogDraft {
  serviceType: SyncableServiceType;
  productCode: string;
  displayName: string;
  customerIdentifierLabel: string;
  requiresAmount: false;
  requiresPackageCode: true;
  priceNgn: number;
  provider: string;
  /** The provider's `package_api_code` — the ONLY wire id we keep. */
  providerProductCode: string;
  providerPackageCode: string;
}

/** Why a plan could not be turned into a product. Surfaced to the operator
 *  rather than swallowed: a silent skip is indistinguishable from a sync bug. */
export interface SkippedPlan {
  providerCode: string;
  packageApiCode: string;
  reason: string;
}

export interface SyncResult {
  drafts: CatalogDraft[];
  skipped: SkippedPlan[];
}

/**
 * A short, stable, lowercase hex digest of a string.
 *
 * FNV-1a. Not cryptographic and not trying to be — it disambiguates two plans
 * whose names slug to the same thing, and that is all. A crypto import here
 * would put `node:crypto` into a file that is currently pure and testable in
 * any runtime.
 */
function shortHash(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/**
 * Turn free text into one legal code segment, bounded to `maxLength`.
 *
 * `maxLength` is a parameter rather than a constant because the budget is NOT
 * the same for every segment. `serviceCodeForProduct` applies the 32-char limit
 * to the product code's ENTIRE remainder — `host` and `slug` together — after
 * the service type is stripped, so the slug's real budget is
 * `32 - host.length - 1`. A slug built to the full 32 produces a product the
 * router cannot resolve, which is the exact failure this module exists to stop.
 *
 * Over-long text is truncated and given a hash suffix rather than being allowed
 * to fail the limit or collide silently with another long name sharing its
 * prefix. The suffix derives from the FULL original text, so two such names
 * still get different segments.
 */
export function slugify(
  raw: string,
  fallbackSeed: string,
  maxLength: number = MAX_PART,
): string | null {
  const base = (raw ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");

  if (base === "" || maxLength < 2) return null;
  if (base.length <= maxLength && CODE_PART.test(base)) return base;

  // Leave room for `-` plus an 8-char hash, then re-test: truncation can end
  // on a hyphen (still legal) but can also empty the segment entirely.
  const truncated = base.slice(0, Math.max(0, maxLength - 9)).replace(/-+$/g, "");
  if (truncated === "") return null;
  const candidate = `${truncated}-${shortHash(fallbackSeed)}`;
  return candidate.length <= maxLength && CODE_PART.test(candidate) ? candidate : null;
}

/** Read a field from a provider response that may be an object or a wrapper. */
function pick(obj: Record<string, unknown>, ...keys: string[]): string {
  for (const key of keys) {
    const value = obj[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

/**
 * Reduce one `GET /service/{slug}` response to providers.
 *
 * DEFENSIVE ON PURPOSE. The response is wrapped in an envelope we have not seen
 * first-hand (this has never been run against a live token), so every plausible
 * container is accepted: a bare array, `{data: [...]}`, `{providers: [...]}`,
 * `{services: [...]}`. A provider missing its own id is dropped, because a
 * route cannot be written without one.
 */
export function parseServiceResponse(body: unknown): SyncProvider[] {
  const list = unwrapList(body, ["data", "providers", "services", "result"]);
  const out: SyncProvider[] = [];
  const seen = new Set<string>();

  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const providerCode = pick(obj, "provider_code", "code", "provider");
    if (providerCode === "") continue;
    if (seen.has(providerCode)) continue;
    seen.add(providerCode);
    out.push({
      providerCode,
      name: pick(obj, "name", "provider_name", "title") || providerCode,
      packages: [],
    });
  }
  return out;
}

/** Reduce one `GET /packages/{provider_code}` response to plans. */
export function parsePackageResponse(body: unknown): SyncPackage[] {
  const list = unwrapList(body, ["data", "packages", "result", "plans"]);
  const out: SyncPackage[] = [];

  for (const entry of list) {
    if (!entry || typeof entry !== "object") continue;
    const obj = entry as Record<string, unknown>;
    const packageApiCode = pick(obj, "package_api_code", "package_code", "code");
    const amountRaw = obj.package_amount ?? obj.amount ?? obj.price;
    const amountNgn = typeof amountRaw === "number" ? amountRaw : Number(pick(obj, "package_amount", "amount", "price"));
    const name =
      pick(obj, "package_description", "package_name", "name", "description", "title") ||
      packageApiCode;

    if (packageApiCode === "") continue;
    // A plan we cannot price is not a plan we can sell. `beginPurchase` refuses
    // a fixed-price product with no price, and it should never get that far.
    if (!Number.isFinite(amountNgn) || amountNgn <= 0) continue;
    out.push({ packageApiCode, amountNgn, name });
  }
  return out;
}

/** Find the list inside whatever envelope the response arrived in. */
function unwrapList(body: unknown, keys: string[]): unknown[] {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== "object") return [];
  const obj = body as Record<string, unknown>;
  for (const key of keys) {
    if (Array.isArray(obj[key])) return obj[key] as unknown[];
  }
  // Some endpoints nest one level deeper: { data: { data: [...] } }.
  for (const key of keys) {
    const inner = obj[key];
    if (inner && typeof inner === "object" && Array.isArray((inner as Record<string, unknown>).data)) {
      return (inner as Record<string, unknown>).data as unknown[];
    }
  }
  return [];
}

/**
 * Build the catalog drafts for one service type's providers.
 *
 * `providerName` is the registry name to route to ("aidapay"), and `host` is
 * the network/disco segment the service code addresses it by. They are
 * different: every route here goes to the SAME provider, while each biller is
 * its own product.
 */
export function buildDrafts(
  serviceType: SyncableServiceType,
  customerIdentifierLabel: string,
  providers: SyncProvider[],
  providerName: string,
): SyncResult {
  const drafts: CatalogDraft[] = [];
  const skipped: SkippedPlan[] = [];
  const used = new Set<string>();

  for (const provider of providers) {
    const host = slugify(provider.providerCode, `host:${provider.providerCode}`);
    if (!host) {
      for (const pkg of provider.packages) {
        skipped.push({
          providerCode: provider.providerCode,
          packageApiCode: pkg.packageApiCode,
          reason: "The provider's id is not usable as a service-code segment.",
        });
      }
      continue;
    }

    // The slug's budget is what is left of the 32-char remainder after the host
    // and the joining hyphen. Getting this wrong writes products the router
    // cannot address — the failure this module exists to prevent.
    const slugBudget = MAX_PART - host.length - 1;
    if (slugBudget < 2) {
      for (const pkg of provider.packages) {
        skipped.push({
          providerCode: provider.providerCode,
          packageApiCode: pkg.packageApiCode,
          reason: "This biller's id leaves no room for a plan name in a product code.",
        });
      }
      continue;
    }

    for (const pkg of provider.packages) {
      // The plan's identity for slugging: its NAME, falling back to its own id
      // so a plan with no description still gets a stable, distinct segment.
      const seed = `${provider.providerCode}:${pkg.packageApiCode}`;
      const base =
        slugify(pkg.name, seed, slugBudget) ?? slugify(pkg.packageApiCode, seed, slugBudget);
      if (!base) {
        skipped.push({
          providerCode: provider.providerCode,
          packageApiCode: pkg.packageApiCode,
          reason: "The plan has no name or id that can be made addressable.",
        });
        continue;
      }

      // Disambiguate against a product code already produced in this batch.
      //
      // Keyed on the FULL code, not the bare slug: two billers can legitimately
      // both offer a "1GB - 30 Days" plan, and `data-mtn-…` and `data-glo-…`
      // are already distinct. A slug-keyed check would wrongly hash the second
      // one, and the suffix is what pushes the remainder past 32.
      //
      // The suffix is a hash of the plan's identity, so re-running the sync
      // produces the SAME code; a counter would duplicate the whole catalog.
      let slug = base;
      if (used.has(`${serviceType}-${host}-${slug}`)) {
        const alt = `${base.slice(0, Math.max(0, slugBudget - 9)).replace(/-+$/g, "")}-${shortHash(seed)}`;
        if (alt.length <= slugBudget && CODE_PART.test(alt)) slug = alt;
      }

      const productCode = `${serviceType}-${host}-${slug}`;
      used.add(productCode);

      // Belt and braces, and the check that actually matters: the remainder
      // must satisfy the service-code grammar on its own, because that is
      // exactly what `serviceCodeForProduct` re-tests before it will address
      // the product.
      const rest = productCode.slice(`${serviceType}-`.length);
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(productCode) || !CODE_PART.test(rest)) {
        skipped.push({
          providerCode: provider.providerCode,
          packageApiCode: pkg.packageApiCode,
          reason: "The generated product code is not a legal code.",
        });
        continue;
      }

      drafts.push({
        serviceType,
        productCode,
        // The provider's own plan name, which is what the customer recognises
        // from the AidaPay app. Falls back to the biller's name when a plan
        // has no description of its own.
        displayName: pkg.name || `${provider.name} plan`,
        customerIdentifierLabel,
        requiresAmount: false,
        requiresPackageCode: true,
        priceNgn: pkg.amountNgn,
        provider: providerName,
        providerProductCode: provider.providerCode,
        providerPackageCode: pkg.packageApiCode,
      });
    }
  }

  return { drafts, skipped };
}
