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
import { consumeRateLimit, resolveCost } from "./vtuInternal";
import { readPointRate } from "./pricing";
import { AIRTIME_NETWORKS, airtimeServiceCode, parseServiceCode } from "../lib/vtu";

/** Fixed airtime amounts. Slice 1 has no catalog browser by design. */
const AIRTIME_AMOUNTS = [100, 200, 500, 1000, 2000, 5000] as const;

/**
 * The airtime grid with live point costs.
 *
 * Resolving the price server-side means the page never displays a number the
 * backend has not agreed to, and the figure stays correct when the rate moves.
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
    }> = [];

    for (const network of AIRTIME_NETWORKS) {
      for (const amountNgn of AIRTIME_AMOUNTS) {
        const serviceCode = airtimeServiceCode(network, amountNgn);
        const overrideRow = await ctx.db
          .query("pointPricing")
          .withIndex("by_serviceCode", (q) => q.eq("serviceCode", serviceCode))
          .first();
        offers.push({
          serviceCode,
          network,
          amountNgn,
          points: overrideRow?.active
            ? overrideRow.pointsCost
            : // Conversion branch — the one exercised while pointPricing has
              // no VTU rows, and the one that moves when the rate does.
              Math.ceil(amountNgn / rate.ngnPerPoint),
          override: overrideRow?.active === true,
        });
      }
    }

    return { ngnPerPoint: rate.ngnPerPoint, offers };
  },
});

/** Single-product price preview, used to re-check cost before submit. */
export const previewCost = query({
  args: { serviceCode: v.string() },
  handler: async (ctx, args) => {
    const parsed = parseServiceCode(args.serviceCode);
    if (!parsed) return null;
    const resolved = await resolveCost(ctx, args.serviceCode, parsed.amountNgn);
    return { ...resolved, nairaPrice: parsed.amountNgn };
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
