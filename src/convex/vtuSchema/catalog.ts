/**
 * The canonical product catalog and its routing table.
 *
 * Split from `schema.ts` so a reader looking for "which provider serves this
 * product" finds one small file instead of a 60 KB schema, and so slice 4 can
 * add a provider-shaped column to the routing table without editing a file
 * that also contains email, tracking, banking and document tables.
 *
 * Exported as an OBJECT rather than as a `defineSchema` of its own: Convex has
 * exactly one schema, and spreading the pieces into it is what keeps
 * `dataModel` generated from a single declaration.
 */

import { v } from "convex/values";
import { defineTable } from "convex/server";
import { vtuServiceTypeValidator } from "./types";

export const vtuCatalogTables = {
  /**
   * The canonical list of buyable things.
   *
   * A row is a CATEGORY ("airtime-mtn"), NOT a purchasable instance. The
   * amount a customer pays is a purchase-time input bounded by
   * `minAmount` / `maxAmount`, because airtime is sold in whatever value
   * the customer chooses and encoding the amount into the code would turn
   * this table into an infinite list.
   *
   * Those bounds are ENFORCED, not documentation: `beginPurchase` checks the
   * purchase amount against this row, and the migration seeds exactly the
   * 100–100,000 that `parseServiceCode` already enforced in code.
   */
  vtuServiceCatalog: defineTable({
    /**
     * METADATA, not identity.
     *
     * `productCode` alone identifies a product; this column exists so the
     * catalog can be filtered and browsed by service type, and so an
     * adapter can be asked "what do you sell for data?" without parsing
     * strings. Deliberately NOT part of any uniqueness constraint.
     */
    serviceType: vtuServiceTypeValidator,
    /**
     * Canonical id: `<serviceType>-<rest>`, lowercased and hyphenated —
     * "airtime-mtn", "data-mtn-1gb-30d", "cable-dstv-compact".
     *
     * GLOBALLY UNIQUE across all service types, not unique per serviceType.
     * Namespacing by prefix rather than by a table column means a lookup is
     * a single indexed row instead of a list every caller must
     * disambiguate — and routing, the price override, and the transaction
     * snapshot all key off this one value. A collision across service types
     * would turn every one of those lookups into a list query, which is a
     * cheap thing to avoid now and an expensive thing to undo at hundreds
     * of products.
     *
     * Convex declares no uniqueness constraint; the create mutation
     * check-then-inserts inside a serializable transaction, which is what
     * actually makes it unique.
     */
    productCode: v.string(),
    displayName: v.string(),
    /** "Phone number" | "Smartcard number" | "Meter number" — what the
     *  customer is asked for. Data, not code, so adding a service type
     *  never needs a deploy. */
    customerIdentifierLabel: v.string(),
    /** Airtime: true (customer picks an amount). Data/cable: false. */
    requiresAmount: v.boolean(),
    /** Data/cable: true (customer picks a size/bouquet). Airtime: false. */
    requiresPackageCode: v.boolean(),
    minAmount: v.optional(v.number()),
    maxAmount: v.optional(v.number()),
    /**
     * What the provider charges for ONE of these, in naira, when the price is
     * FIXED.
     *
     * Only fixed-package products carry it — a data plan, a cable bouquet —
     * because their price is the provider's and the customer never chooses it.
     * An amount-priced product (airtime, electricity) leaves this absent: its
     * naira price IS the amount the customer typed, so a value here would be
     * dead weight that could drift from `minAmount`/`maxAmount`.
     *
     * This is the naira the ledger's rate snapshot is built from, so it is the
     * one number that decides what the customer is charged in points. The
     * catalog sync fills it from the provider's own package list.
     */
    priceNgn: v.optional(v.number()),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    // Catalog browsing: every product of one type that an operator can sell.
    .index("by_serviceType_active", ["serviceType", "active"])
    // Routing lookup. Globally unique, so this returns at most one row.
    .index("by_productCode", ["productCode"]),

  /**
   * The mapping from a canonical product to a provider and to THAT
   * provider's product code.
   *
   * One row per (canonical product, provider) pair. This is the table that
   * makes routing a decision rather than a constant: MTN airtime and MTN
   * data can point at different providers, and a single canonical product
   * can be served by two providers with one preferred.
   */
  vtuServiceRouting: defineTable({
    /** Joins to `vtuServiceCatalog.productCode`. */
    productCode: v.string(),
    /** Matches `vtuProviders.name` — the registry key. Not an FK: a route
     *  may legitimately exist for a provider row that is missing, and
     *  routing must skip it rather than null-deref. */
    provider: v.string(),
    /** The code THIS provider expects: "airtime.mtn.{amount}" for Pairgate,
     *  "mtn-airtime" for AidaPay. Canonical and provider codes are
     *  deliberately different namespaces; this column is the only
     *  translation between them, and `{amount}` is filled with the purchase
     *  amount by `composeProviderProductCode`. */
    providerProductCode: v.string(),
    /** A package identifier when it differs from `providerProductCode` —
     *  data plans, cable bouquets, exam packages. */
    providerPackageCode: v.optional(v.string()),
    /** Charge exactly this many points through this route. Most specific
     *  price override there is (see `resolvePointsCost`). */
    pointsCostOverride: v.optional(v.number()),
    /** Lower runs first. Ties break on `vtuProviders.priority`. */
    priority: v.number(),
    active: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    // Purchase-time lookup: active routes for one product.
    .index("by_productCode_active", ["productCode", "active"])
    // Uniqueness by check-then-insert, and the admin edit path.
    .index("by_productCode_provider", ["productCode", "provider"]),
};
