/**
 * Catalog browse — what is for sale, and nothing about how it is served.
 *
 * This is the read behind `/vtu`. It answers exactly one question: which active
 * products can a customer choose between? It deliberately does NOT answer
 * "which provider serves this" or "what does the route look like", because that
 * is the routing table, and the routing table is not the client's business.
 *
 * THE BOUNDARY, spelled out, because two shipped queries look like they break it
 * and do not:
 *
 *   - Server-side routing and cost resolution are allowed to produce a SCALAR.
 *     `api.vtu.getAirtimeOffers` and `api.vtu.previewCost` already call
 *     `routeProduct` and `resolvePointsCost` inside queries, on purpose — an
 *     override on a routing row means a grid that read its price from anywhere
 *     else would advertise one number and charge another.
 *   - What may not cross the wire: a provider name, a provider product or
 *     package code, a priority, a routing row, or a skipped-candidate list.
 *     The price is a number; the route that produced it is not the customer's
 *     or the browser's concern.
 *   - Nothing here may be re-derived on the client. The indicative range below
 *     is computed on the server for that reason, not shipped as arithmetic.
 *
 * Read-only. No writes, no credentials, no adapter.
 */

import { query } from "./_generated/server";
import { v } from "convex/values";
import { VTU_SERVICE_TYPES, type VtuServiceType } from "./vtuSchema/types";
import {
  canonicalProductCode,
  resolvePointsCost,
  routeProduct,
} from "./vtuServiceRouting";
import { readPointRate } from "./pricing";
import {
  AIRTIME_NETWORKS,
  AMOUNT_TOKEN,
  pointsForNaira,
  serviceCodeForProduct,
} from "../lib/vtu";

/**
 * Cost ceiling on one browse subscription.
 *
 * Resolving a price for a product costs a routing read plus a provider read, so
 * pricing N products is O(N) reads and this query re-runs whenever any of those
 * tables changes. Both caps are deliberately small: the seeded catalog holds
 * one product, a real one holds tens, and a hundred-product page is a page
 * nobody scrolls. Products beyond the cap still LIST — only their price is
 * withheld, and the card says so rather than showing a number nobody computed.
 */
const MAX_PRODUCTS_PER_TYPE = 24;
const MAX_PRICED_PER_TYPE = 12;

export interface CatalogProductView {
  productCode: string;
  displayName: string;
  customerIdentifierLabel: string;
  requiresAmount: boolean;
  requiresPackageCode: boolean;
  minAmount: number | null;
  maxAmount: number | null;
  /**
   * An exact, amount-independent price, present ONLY when the single price
   * resolver reported `source: "routing_override"`.
   *
   * That level is the only one that produces one number for the whole product:
   * `resolvePointsCost` returns `pointsCostOverride` without consulting
   * `nairaPrice` at all. A `point_pricing_override` is keyed on the full
   * service code (`airtime.mtn.1000`), so it prices one amount and not a
   * product, and is therefore never surfaced here as "the price".
   */
  fixedPoints: number | null;
  /** Indicative, not authoritative: derived from the catalog's amount bounds
   *  and the platform rate. The purchase panel shows the real figure. */
  indicativeMinPoints: number | null;
  indicativeMaxPoints: number | null;
  /** False when the backend cannot yet take a purchase for this shape. */
  purchasable: boolean;
  /** The network to preselect for an airtime product, else null. Derived here
   *  so the client never parses catalog semantics out of a product code. */
  airtimeNetwork: string | null;
  /** False when the pricing ceiling above was reached for this service type. */
  priceResolved: boolean;
}

export interface CatalogGroupView {
  serviceType: VtuServiceType;
  products: CatalogProductView[];
}

export const listCatalog = query({
  args: {},
  handler: async (ctx) => {
    const rate = await readPointRate(ctx);
    const groups: CatalogGroupView[] = [];

    for (const serviceType of VTU_SERVICE_TYPES) {
      const rows = await ctx.db
        .query("vtuServiceCatalog")
        .withIndex("by_serviceType_active", (q) =>
          q.eq("serviceType", serviceType).eq("active", true),
        )
        .take(MAX_PRODUCTS_PER_TYPE);

      if (rows.length === 0) continue;

      const products: CatalogProductView[] = [];
      let priced = 0;

      for (const product of rows) {
        const network =
          product.serviceType === "airtime"
            ? ((AIRTIME_NETWORKS as readonly string[]).find(
                (n) => product.productCode === `airtime-${n}`,
              ) ?? null)
            : null;

        const route = await routeProduct(ctx, product.productCode);

        // Purchasable means three things, and the third is the one that keeps
        // a card honest: a route can serve it, its shape is fully configured,
        // AND the address a customer would use maps back to this very row.
        // That last check catches a hand-made product whose code cannot
        // round-trip — an airtime row on a network the parser rejects, say —
        // and refuses it here rather than after the customer has clicked.
        const template = serviceCodeForProduct(product);
        const probe = template?.replace(AMOUNT_TOKEN, "100") ?? null;
        const addressResolves =
          probe !== null && canonicalProductCode(probe) === product.productCode;
        const fixedPrice = typeof product.priceNgn === "number" && product.priceNgn > 0;
        const shapeOk = product.requiresAmount
          ? typeof product.minAmount === "number" &&
            typeof product.maxAmount === "number" &&
            product.minAmount > 0 &&
            product.maxAmount >= product.minAmount
          : fixedPrice;
        const purchasable = route.ok && addressResolves && shapeOk;

        let fixedPoints: number | null = null;
        let priceResolved = false;

        if (route.ok && priced < MAX_PRICED_PER_TYPE) {
          priced += 1;
          priceResolved = true;
          // `serviceCode` is INERT on this call. Its only consumer inside
          // `resolvePointsCost` is the `pointPricing` lookup, and a per-service
          // code override is not a product price, so the number it produces is
          // discarded below. The routing-override branch — the one we do use —
          // never reads it. Passing the product code keeps the "one price
          // resolver" rule intact instead of duplicating its precedence here.
          const cost = await resolvePointsCost(ctx, {
            productCode: product.productCode,
            serviceCode: product.productCode,
            provider: route.winner.provider,
            // For an amount-priced product this is the conversion branch's
            // floor (a bound-less row must not throw) and the number it
            // produces is discarded. For a fixed-price product it is the real
            // price, and the row below keeps the result.
            nairaPrice: product.requiresAmount
              ? Math.max(product.minAmount ?? 1, 1)
              : product.priceNgn ?? 1,
          });
          if (cost.source === "routing_override") fixedPoints = cost.points;
          // A fixed price converts EXACTLY: the naira number is not a customer
          // input, so what the catalog shows is what the checkout charges.
          else if (!product.requiresAmount && fixedPrice) fixedPoints = cost.points;
        }

        // The indicative range is only meaningful when the product actually
        // varies by amount AND declares both bounds.
        const min = product.minAmount;
        const max = product.maxAmount;
        const canRange =
          product.requiresAmount === true &&
          typeof min === "number" &&
          typeof max === "number" &&
          min >= 1 &&
          max >= min;
        const indicativeMinPoints = canRange ? pointsForNaira(min, rate.ngnPerPoint) : null;
        const indicativeMaxPoints = canRange ? pointsForNaira(max, rate.ngnPerPoint) : null;

        products.push({
          productCode: product.productCode,
          displayName: product.displayName,
          customerIdentifierLabel: product.customerIdentifierLabel,
          requiresAmount: product.requiresAmount,
          requiresPackageCode: product.requiresPackageCode,
          minAmount: typeof min === "number" ? min : null,
          maxAmount: typeof max === "number" ? max : null,
          fixedPoints,
          indicativeMinPoints,
          indicativeMaxPoints,
          purchasable,
          airtimeNetwork: network,
          priceResolved,
        });
      }

      groups.push({ serviceType, products });
    }

    return { ngnPerPoint: rate.ngnPerPoint, groups };
  },
});

/** Everything a purchase page needs for ONE product. */
export interface PurchaseDetailView {
  productCode: string;
  displayName: string;
  serviceType: VtuServiceType;
  customerIdentifierLabel: string;
  requiresAmount: boolean;
  minAmount: number | null;
  maxAmount: number | null;
  /** Points per naira, so an amount the customer types can be priced through
   *  `api.vtu.previewCost` without a second configuration read. */
  ngnPerPoint: number;
  /** Exact points for a fixed-price product; null for an amount-priced one,
   *  whose price follows whatever the customer types. */
  fixedPoints: number | null;
  /**
   * The code to buy with. `{amount}` is the placeholder for the customer's own
   * number, and its spelling is sent as `amountToken` rather than assumed by
   * the client.
   */
  serviceCodeTemplate: string;
  amountToken: string;
  /** The provider's naira price, for fixed-price products. */
  priceNgn: number | null;
  /** False when no provider can serve it right now — the page refuses before
   *  collecting a number rather than after. */
  providerAvailable: boolean;
}

/**
 * One product's purchase details.
 *
 * PUBLIC, and deliberately: a customer must be able to see what something
 * costs before buying it. It discloses no provider — the route is read to
 * resolve a price and a feasibility flag, and only scalars leave this
 * function.
 *
 * The numbers come from the SAME resolver the purchase runs, so the page shows
 * what the server will charge rather than a second opinion about it. Null when
 * the product does not exist, is inactive, or cannot be addressed at all.
 */
export const getPurchaseDetail = query({
  args: { productCode: v.string() },
  handler: async (ctx, args): Promise<PurchaseDetailView | null> => {
    const product = await ctx.db
      .query("vtuServiceCatalog")
      .withIndex("by_productCode", (q) => q.eq("productCode", args.productCode))
      .unique();
    if (!product || product.active !== true) return null;

    const template = serviceCodeForProduct(product);
    if (!template) return null;

    const route = await routeProduct(ctx, product.productCode);
    const rate = await readPointRate(ctx);
    const fixedPrice = typeof product.priceNgn === "number" && product.priceNgn > 0;

    let fixedPoints: number | null = null;
    if (route.ok) {
      const cost = await resolvePointsCost(ctx, {
        productCode: product.productCode,
        serviceCode: product.productCode,
        provider: route.winner.provider,
        nairaPrice: product.requiresAmount
          ? Math.max(product.minAmount ?? 1, 1)
          : product.priceNgn ?? 1,
      });
      if (cost.source === "routing_override") fixedPoints = cost.points;
      else if (!product.requiresAmount && fixedPrice) fixedPoints = cost.points;
    }

    return {
      productCode: product.productCode,
      displayName: product.displayName,
      serviceType: product.serviceType,
      customerIdentifierLabel: product.customerIdentifierLabel,
      requiresAmount: product.requiresAmount,
      minAmount: typeof product.minAmount === "number" ? product.minAmount : null,
      maxAmount: typeof product.maxAmount === "number" ? product.maxAmount : null,
      ngnPerPoint: rate.ngnPerPoint,
      fixedPoints,
      serviceCodeTemplate: template,
      amountToken: AMOUNT_TOKEN,
      priceNgn: typeof product.priceNgn === "number" ? product.priceNgn : null,
      providerAvailable: route.ok,
    };
  },
});
