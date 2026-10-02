/**
 * Per-product routing — the decision of WHICH provider serves a product.
 *
 * Everything here is a PURE FUNCTION over a database reader. No Convex
 * function, no side effect, no credential. That is deliberate for two reasons:
 *
 *   1. It is unit-testable without a purchase. The interesting behaviour of
 *      routing — a disabled provider being skipped, a priority tie breaking
 *      correctly, NO_ROUTE_AVAILABLE being distinct from PRODUCT_NOT_FOUND —
 *      is all reachable in a test that inserts rows and calls a function.
 *   2. It can be called from a mutation (the purchase path) and from a query
 *      (the admin preview) without either of them becoming the owner of the
 *      rule. The preview shows exactly what the purchase will do, because
 *      it runs the same code rather than a description of it.
 *
 * The caller supplies the reader, so this module is not tied to the Convex
 * runtime and imports nothing from it.
 */

import type { Doc } from "./_generated/dataModel";
import { readPointRate } from "./pricing";
import { AMOUNT_TOKEN, parseServiceCode, resolveVtuPointsCost } from "../lib/vtu";

/**
 * The only database capability these functions need.
 *
 * Narrower than `GenericDatabaseWriter` on purpose: a routing function that
 * could write would be a routing function someone eventually writes from, and
 * a read that mutates is the hardest class of bug to find in a payments path.
 */
type IndexQuery = {
  /** Returns the range rather than the builder, matching Convex's own
   *  `IndexRangeBuilder`, so a real `ctx.db` satisfies this structurally. */
  eq(field: string, value: unknown): any;
};

/**
 * The database capability these functions need.
 *
 * Narrower than the Convex mutation context on purpose: a routing function
 * that COULD write would be a routing function someone eventually writes
 * from. Declared with method shorthand so a real `ctx.db` satisfies it
 * structurally without a cast at every call site.
 */
export type RoutingReader = {
  db: {
    query(table: string): {
      withIndex(
        index: string,
        rangeFn: (q: IndexQuery) => any,
      ): { take(n: number): Promise<Doc<any>[]> };
    };
  };
};

/**
 * The canonical `vtuServiceCatalog.productCode` for a service code.
 *
 * "airtime.mtn.1000" -> "airtime-mtn".
 *
 * The AMOUNT is deliberately dropped. `airtime-mtn` is a product CATEGORY;
 * what a customer pays is a purchase-time input bounded by the catalog row's
 * `minAmount` / `maxAmount`. Encoding the amount in the product code would
 * make the catalog an unbounded list for the one product that has no fixed
 * price, and would give an operator a routing table to maintain per price
 * point.
 *
 * Derived from the PARSED parts rather than by string surgery on the code, so
 * this can never disagree with `parseServiceCode` about what a code means.
 */
export function canonicalProductCode(serviceCode: string): string | null {
  const parsed = parseServiceCode(serviceCode);
  if (!parsed) return null;
  const host = `${parsed.serviceType}-${parsed.network}`;
  // A package product's canonical id carries the plan as well: every data
  // plan and every bouquet is its OWN product, so it can be priced and routed
  // independently. An amount-priced product (airtime, electricity) stops at
  // the host, because its size is a purchase-time input rather than a product.
  return parsed.packageSlug ? `${host}-${parsed.packageSlug}` : host;
}

/**
 * Operator-facing text for each routing failure.
 *
 * A code plus a sentence, never a code alone: "NO_ROUTE_AVAILABLE" tells a
 * developer what happened and tells an operator nothing. These three are
 * genuinely different problems with different fixes — add the product, switch
 * it on, or point a route at a live provider — so they are never collapsed
 * into one generic failure.
 */
export const ROUTE_MESSAGES: Record<RouteErrorCode, string> = {
  PRODUCT_NOT_FOUND:
    "That product is not in the catalog. An administrator needs to add it before it can be bought.",
  PRODUCT_INACTIVE:
    "That product is not currently available. Please try another one.",
  NO_ROUTE_AVAILABLE:
    "No payment provider is currently serving that product. Please try another one.",
};

/**
 * Placeholder an operator writes in `providerProductCode` where the purchase
 * amount belongs.
 *
 * A route is per-PRODUCT, but the amount is a purchase-time input: "airtime-mtn"
 * is one canonical product sold at ₦100, ₦500 and ₦5,000. Without a
 * placeholder, a single static provider code could not produce a different
 * wire value per amount, and the alternative — making the catalog per-amount
 * ("airtime-mtn-1000", "airtime-mtn-5000", …) — turns the catalog into an
 * unbounded list for the one product that has no fixed price.
 *
 * The seeded Pairgate route is `"airtime.mtn.{amount}"`, which composes to
 * exactly the string slice 1 sent, byte for byte.
 *
 * This is a PLATFORM convention, not a provider quirk: every aggregator wants
 * the amount, and none of them want it spelled the same way. What the provider
 * does with it stays inside the adapter.
 *
 * Declared in `../lib/vtu` and re-exported here, so the service-code parser,
 * the catalog's purchase template and this routing rule spell the placeholder
 * from ONE declaration.
 */
export { AMOUNT_TOKEN };

/**
 * Fill `{amount}` into a routed provider product code.
 *
 * A code with no token is returned unchanged, so a provider whose catalog ids
 * are fixed (AidaPay's "mtn-data-1gb-30d") never sees a substitution. An
 * unreplaced `{amount}` is a configuration mistake, so it is thrown on rather
 * than sent to a provider that will 400 on it.
 */
export function composeProviderProductCode(
  providerProductCode: string,
  amountNgn: number | undefined,
): string {
  if (!providerProductCode.includes(AMOUNT_TOKEN)) return providerProductCode;
  if (amountNgn === undefined || !Number.isFinite(amountNgn)) {
    throw new Error(
      "This product needs an amount but the purchase did not supply one. Check the product's 'requires amount' setting in the VTU catalog.",
    );
  }
  return providerProductCode.split(AMOUNT_TOKEN).join(String(amountNgn));
}

export type RouteErrorCode =
  | "PRODUCT_NOT_FOUND"
  | "PRODUCT_INACTIVE"
  | "NO_ROUTE_AVAILABLE";

/** One routing row, joined to the provider it points at. */
export type RouteCandidate = {
  productCode: string;
  provider: string;
  providerProductCode: string;
  providerPackageCode: string | null;
  pointsCostOverride: number | null;
  /** `vtuServiceRouting.priority` — the operator's per-product preference. */
  routePriority: number;
  /** `vtuProviders.priority` — the tie-break when two routes rank equally. */
  providerPriority: number;
  /** The provider's lifecycle status, for the admin's "will never be chosen"
   *  warning. A skipped route is returned, not hidden, so an operator can
   *  see WHY their preferred provider is not winning. */
  providerStatus: "active" | "sandbox" | "disabled" | "missing";
  /** True when this route can actually serve a purchase right now. */
  eligible: boolean;
  /** Why an ineligible route was skipped. Absent on an eligible route. */
  skippedBecause?:
    | "route_inactive"
    | "provider_missing"
    | "provider_sandbox"
    | "provider_disabled";
};

export type RouteResult =
  | {
      ok: true;
      product: Doc<"vtuServiceCatalog">;
      winner: RouteCandidate;
      /** Every active route for the product, ordered. The winner is
       *  `candidates[0]`. Kept in the result so a purchase can record the
       *  alternatives for diagnostics without a second read. */
      candidates: RouteCandidate[];
    }
  | {
      ok: false;
      code: RouteErrorCode;
      /** Routes that existed but were all ineligible, when the failure is
       *  NO_ROUTE_AVAILABLE. Distinguishes "you configured nothing" from
       *  "you configured a sandbox provider". */
      skipped: RouteCandidate[];
    };

/**
 * Decide which provider serves a canonical product.
 *
 * The algorithm, in order:
 *
 *   a. Look up `vtuServiceCatalog` by `productCode`. Missing → PRODUCT_NOT_FOUND.
 *      Inactive → PRODUCT_INACTIVE (a distinct code, so an operator can tell
 *      "no such product" from "you turned this one off").
 *   b. Read every ACTIVE route for that productCode.
 *   c. Join each to its `vtuProviders` row and mark eligibility. Only
 *      `status === "active"` is eligible: a sandbox key must not take live
 *      customer money, and a disabled provider is off by definition. A route
 *      whose provider row is missing is skipped rather than crashing, because
 *      a route may legitimately be configured before its provider is.
 *   d. Order by (route.priority ASC, then provider.priority ASC, then
 *      provider name ASC). The name is a final tie-break so the winner is
 *      DETERMINISTIC — two rows with equal priorities must not resolve
 *      differently on two runs of the same data.
 *   e. First eligible row wins. None → NO_ROUTE_AVAILABLE.
 *
 * NO_ROUTE_AVAILABLE is a real error, not a fallback trigger. There is
 * deliberately no "default provider": silently sending a purchase somewhere
 * the operator did not choose is worse than refusing it, and a refusal costs
 * the customer nothing because no points have been debited at this point.
 */
export async function routeProduct(
  ctx: RoutingReader,
  productCode: string,
): Promise<RouteResult> {
  const product = await ctx.db
    .query("vtuServiceCatalog")
    .withIndex("by_productCode", (q) => q.eq("productCode", productCode))
    .take(1)
    .then((rows) => rows[0] ?? null);

  if (!product) return { ok: false, code: "PRODUCT_NOT_FOUND", skipped: [] };
  if (product.active !== true) {
    return { ok: false, code: "PRODUCT_INACTIVE", skipped: [] };
  }

  const rows = await ctx.db
    .query("vtuServiceRouting")
    .withIndex("by_productCode_active", (q) =>
      q.eq("productCode", productCode).eq("active", true),
    )
    .take(50);

  const candidates: RouteCandidate[] = [];
  for (const row of rows) {
    const provider =
      (await ctx.db
        .query("vtuProviders")
        .withIndex("by_name", (q) => q.eq("name", row.provider))
        .take(1)
        .then((r) => r[0] ?? null)) ?? null;

    const status = (provider?.status ?? "missing") as RouteCandidate["providerStatus"];
    const eligible = status === "active";
    candidates.push({
      productCode: row.productCode,
      provider: row.provider,
      providerProductCode: row.providerProductCode,
      providerPackageCode: row.providerPackageCode ?? null,
      pointsCostOverride: row.pointsCostOverride ?? null,
      routePriority: row.priority,
      // A provider with no explicit priority sits mid-pack, not first.
      providerPriority: provider?.priority ?? 100,
      providerStatus: status,
      eligible,
      ...(eligible
        ? {}
        : {
            skippedBecause:
              provider == null
                ? ("provider_missing" as const)
                : status === "sandbox"
                  ? ("provider_sandbox" as const)
                  : ("provider_disabled" as const),
          }),
    });
  }

  candidates.sort(
    (a, b) =>
      a.routePriority - b.routePriority ||
      a.providerPriority - b.providerPriority ||
      a.provider.localeCompare(b.provider),
  );

  const winner = candidates.find((c) => c.eligible);
  if (!winner) return { ok: false, code: "NO_ROUTE_AVAILABLE", skipped: candidates };

  return { ok: true, product, winner, candidates };
}

export type CostSource = "routing_override" | "point_pricing_override" | "default_conversion";

export type ResolvedPointsCost = {
  points: number;
  ngnPerPoint: number;
  /** Which of the three levels produced this number. Frozen onto the
   *  transaction so a later history view reports what was charged rather
   *  than re-deriving it against today's configuration. */
  source: CostSource;
  /** True when either override applied. Kept for the existing UI that
   *  labels an overridden price. */
  override: boolean;
};

/**
 * Resolve what a product costs in points, for one specific route.
 *
 * Precedence, most specific first:
 *
 *   1. `vtuServiceRouting.pointsCostOverride` for (productCode, provider).
 *   2. `pointPricing.pointsCost` for the service code, when `active === true`.
 *   3. The default conversion: ceil(nairaPrice / nngPerPoint).
 *
 * The ordering is specificity, not preference. Level 1 is the only one that
 * knows which PROVIDER is selling, so it is the only one that can express
 * "AidaPay is cheaper for this data package, price it differently".
 * Level 2 is a product-level override with no provider dimension. Level 3 is
 * the fallback and is the only one that moves when the exchange rate does.
 *
 * A trap worth naming: `pointPricing` carries TWO activity flags. `active` is
 * the VTU override switch and is the ONLY one consulted here. `isActive`
 * belongs to the document engine's per-service price overrides and means
 * nothing for VTU. Gating on the wrong one silently disables every override.
 *
 * `serviceCode` is a parameter rather than derived from `productCode` because
 * the `pointPricing` rows slice 1 created are keyed on the full service code
 * ("airtime.mtn.1000"). Re-deriving it here would duplicate `parseServiceCode`
 * and risk the two disagreeing about what a code means.
 */
export async function resolvePointsCost(
  ctx: RoutingReader,
  args: {
    productCode: string;
    serviceCode: string;
    /** The provider the route selected. `null` skips level 1 entirely. */
    provider: string | null;
    nairaPrice: number;
  },
): Promise<ResolvedPointsCost> {
  if (args.provider != null) {
    const route = await ctx.db
      .query("vtuServiceRouting")
      .withIndex("by_productCode_provider", (q) =>
        q.eq("productCode", args.productCode).eq("provider", args.provider),
      )
      .take(1)
      .then((rows) => rows[0] ?? null);

    if (route && route.active === true && typeof route.pointsCostOverride === "number") {
      const rate = await readPointRate(ctx as any);
      return {
        points: route.pointsCostOverride,
        ngnPerPoint: rate.ngnPerPoint,
        source: "routing_override",
        override: true,
      };
    }
  }

  const pricingRow = await ctx.db
    .query("pointPricing")
    .withIndex("by_serviceCode", (q) => q.eq("serviceCode", args.serviceCode))
    .take(1)
    .then((rows) => rows[0] ?? null);

  const rate = await readPointRate(ctx as any);
  // `active` is the VTU switch. `isActive` is the document engine's field and
  // is deliberately not consulted.
  const overrideActive = pricingRow?.active === true;
  const overridePoints =
    overrideActive && typeof pricingRow?.pointsCost === "number"
      ? pricingRow.pointsCost
      : undefined;

  return {
    points: resolveVtuPointsCost(args.nairaPrice, rate.ngnPerPoint, overridePoints),
    ngnPerPoint: rate.ngnPerPoint,
    source: overridePoints !== undefined ? "point_pricing_override" : "default_conversion",
    override: overrideActive,
  };
}

/**
 * The provider that actually served a transaction.
 *
 * Reads the SNAPSHOT, never the routing table. The routing table is mutable
 * and a transaction is not: an operator re-pointing a product between dispatch
 * and settlement must not change where an in-flight purchase settles.
 *
 * `routedProvider == null` means a pre-slice-3 row, which by construction only
 * ever went to Pairgate. This is the single place that knows that, so the
 * webhook handler can stay ignorant of slice history.
 */
export function effectiveProvider(tx: {
  routedProvider?: string | null;
  provider?: string | null;
}): string {
  return tx.routedProvider ?? tx.provider ?? "pairgate";
}
