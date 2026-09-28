/**
 * VTU public surface — read-only.
 *
 * Purchases do not live here. A public mutation reads the caller from the auth
 * context, but the action that drives a purchase calls its mutations with an
 * explicit `userId`, so the money path is internal (`vtuInternal.ts`). What is
 * public is everything the page subscribes to.
 */

import { query } from "./_generated/server";
import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { consumeRateLimit } from "./vtuInternal";
import { readPointRate } from "./pricing";
import {
  canonicalProductCode,
  resolvePointsCost,
  routeProduct,
} from "./vtuServiceRouting";
import { AIRTIME_NETWORKS, airtimeServiceCode, parseServiceCode } from "../lib/vtu";

/** Fixed airtime amounts. Slice 1 has no catalog browser by design. */
const AIRTIME_AMOUNTS = [100, 200, 500, 1000, 2000, 5000] as const;

/**
 * The airtime grid with live point costs.
 *
 * Resolving the price server-side means the page never displays a number the
 * backend has not agreed to, and the figure stays correct when the rate moves.
 *
 * THE OFFER GRID RUNS THE SAME ROUTING AND THE SAME COST FUNCTION THE PURCHASE
 * DOES. That is not tidiness, it is correctness: an operator can set a
 * `pointsCostOverride` on a routing row, and if this grid read the price from
 * anywhere else it would advertise one number and charge another. A customer
 * picking the amount the grid quoted is the exact case where a drift between
 * display and charge turns into a complaint.
 *
 * A network whose product cannot be routed is omitted entirely. Showing an
 * offer that the purchase path will refuse with NO_ROUTE_AVAILABLE would be
 * advertising something that does not exist.
 */
export const getAirtimeOffers = query({
  args: {},
  handler: async (ctx) => {
    const rate = await readPointRate(ctx);
    const offers: Array<{
      serviceCode: string;
      network: string;
      amountNgn: number;
      points: number;
      override: boolean;
      /** Which price level produced this number, for the admin's benefit. */
      costSource: string;
    }> = [];

    for (const network of AIRTIME_NETWORKS) {
      // Route once per network, not once per (network, amount): all six
      // amounts of one network are the same product going to the same
      // provider, and routing is a per-product decision.
      const route = await routeProduct(ctx, `airtime-${network}`);
      if (!route.ok) continue;

      for (const amountNgn of AIRTIME_AMOUNTS) {
        const serviceCode = airtimeServiceCode(network, amountNgn);
        const cost = await resolvePointsCost(ctx, {
          productCode: route.winner.productCode,
          serviceCode,
          provider: route.winner.provider,
          nairaPrice: amountNgn,
        });
        offers.push({
          serviceCode,
          network,
          amountNgn,
          points: cost.points,
          override: cost.override,
          costSource: cost.source,
        });
      }
    }

    return { ngnPerPoint: rate.ngnPerPoint, offers };
  },
});

/**
 * Single-product price preview, used to re-check cost before submit.
 *
 * Routes for the same reason the offer grid does: a preview that quotes the
 * pre-routing price is worse than no preview, because it looks authoritative.
 * Returns null when the product cannot be served, so the caller cannot render
 * a cost for something that will be refused.
 */
export const previewCost = query({
  args: { serviceCode: v.string() },
  handler: async (ctx, args) => {
    const parsed = parseServiceCode(args.serviceCode);
    if (!parsed) return null;

    const productCode = canonicalProductCode(args.serviceCode);
    if (!productCode) return null;

    const route = await routeProduct(ctx, productCode);
    if (!route.ok) return null;

    const cost = await resolvePointsCost(ctx, {
      productCode: route.winner.productCode,
      serviceCode: args.serviceCode,
      provider: route.winner.provider,
      nairaPrice: parsed.amountNgn,
    });

    return {
      points: cost.points,
      ngnPerPoint: cost.ngnPerPoint,
      override: cost.override,
      costSource: cost.source,
      provider: route.winner.provider,
      nairaPrice: parsed.amountNgn,
    };
  },
});

/** A customer's own VTU history. */
export const listMyTransactions = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const rows = await ctx.db
      .query("vtuTransactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .take(args.limit ?? 10);
    return rows.map((t) => ({
      _id: t._id,
      status: t.status,
      serviceCode: t.serviceCode,
      pointsDebited: t.pointsDebited,
      createdAt: t.createdAt,
    }));
  },
});

export { consumeRateLimit };
