/**
 * Aggregator configuration and the provider-scoped catalog tables.
 *
 * Everything here is keyed by or names a provider, so it belongs together: the
 * registry resolves a `vtuProviders.name` to an adapter, and the two legacy
 * tables below are per-provider price/offer caches that only mean anything
 * relative to one.
 *
 * The secrets on this table are sealed (AES-256-GCM) and are only ever opened
 * inside a "use node" action — never in the database layer, never in the
 * browser, and never in a query result.
 */

import { v } from "convex/values";
import { defineTable } from "convex/server";
import {
  vtuAuthSchemeValidator,
  vtuProviderStatusValidator,
  vtuServiceTypeValidator,
} from "./types";

export const vtuProviderTables = {
  /**
   * Aggregator configuration, as runtime DATA rather than env vars.
   *
   * `name` is the join key to `adapter.name` — the registry resolves a
   * provider by matching these two, so a row can exist for an adapter that
   * does not exist yet (slice 3 reaches that through the admin UI, and it
   * must fail closed rather than null-deref).
   *
   * `status` is a three-value enum rather than a boolean on purpose: the
   * live Pairgate key is a SANDBOX key, and an operator must be able to tell
   * a sandbox key from a live one at a glance. `active` is derived as
   * `status === "active"` wherever routing needs a yes/no.
   */
  vtuProviders: defineTable({
    /** Matches `adapter.name`. */
    name: v.string(),
    displayName: v.string(),
    status: vtuProviderStatusValidator,
    baseUrl: v.string(),
    /** Sealed with the platform master key. NEVER returned to a client —
     *  admin queries return `hasApiKey: boolean` instead. */
    encryptedApiKey: v.string(),
    /** Sealed independently, so one provider's webhook secret can be
     *  rotated without touching any other. */
    encryptedWebhookSecret: v.optional(v.string()),
    /**
     * Provider-level transaction PIN, for aggregators that require one on
     * every purchase (AidaPay's POST /buy `account_pin`).
     *
     * It is provider CREDENTIAL configuration, not user data: it is the same
     * value for every purchase we make through this provider, so it belongs
     * on the row and is sealed alongside the API key. Null for providers
     * with no equivalent (Pairgate).
     */
    encryptedAccountPin: v.optional(v.string()),
    /** Header the aggregator sends its callback signature in. */
    callbackSignatureHeader: v.optional(v.string()),
    /** How to compose the auth header. Closed enum, never a free string. */
    authScheme: v.optional(vtuAuthSchemeValidator),
    timeoutMs: v.optional(v.number()),
    /** Read-only endpoint the "test connection" button GETs. Data, not
     *  code, so a new adapter needs no health() method. */
    healthPath: v.optional(v.string()),
    /** Header the request authorization is sent in. */
    authHeader: v.optional(v.string()),
    /** Lower runs first. The tie-break when two routes rank equally. */
    priority: v.optional(v.number()),
    lastTestedAt: v.optional(v.number()),
    lastTestOk: v.optional(v.boolean()),
    /** Short code or message. Never derived from a credential. */
    lastTestError: v.optional(v.string()),
    notes: v.optional(v.string()),
    updatedBy: v.optional(v.id("users")),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_name", ["name"])
    .index("by_status_priority", ["status", "priority"]),

  /** Seedable catalog of purchasable products, independent of any live call. */
  vtuCatalog: defineTable({
    provider: v.string(),
    serviceType: vtuServiceTypeValidator,
    /** Provider's own catalog identifier, sent verbatim on purchase. */
    productCode: v.string(),
    name: v.string(),
    /** Face value in naira, used to derive the point cost. */
    priceNgn: v.number(),
    /** Optional override: charge exactly this many points when set. */
    pointsCost: v.optional(v.number()),
    /** Operator / network discriminator (e.g. "mtn", "dstv", "ikeja"). */
    network: v.optional(v.string()),
    description: v.optional(v.string()),
    isActive: v.boolean(),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_service", ["serviceType", "isActive"])
    .index("by_provider_code", ["provider", "productCode"])
    .index("by_network", ["network"]),

  /** Live offers reported by the aggregator, cached against the catalog. */
  vtuProductOffers: defineTable({
    productCode: v.string(),
    provider: v.string(),
    serviceType: vtuServiceTypeValidator,
    name: v.optional(v.string()),
    priceNgn: v.number(),
    network: v.optional(v.string()),
    isAvailable: v.optional(v.boolean()),
    fetchedAt: v.number(),
  })
    .index("by_productCode", ["productCode"])
    .index("by_service", ["serviceType"]),
};
