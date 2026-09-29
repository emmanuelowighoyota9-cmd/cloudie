/**
 * VTU public surface — read-only.
 *
 * Purchases do not live here. A public mutation reads the caller from the auth
 * context, but the action that drives a purchase calls its mutations with an
 * explicit `userId`, so the money path is internal (`vtuInternal.ts`). What is
 * public is everything the page subscribes to.
 */

import { query, type QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import { paginationOptsValidator } from "convex/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import type { Doc, Id } from "./_generated/dataModel";
import { consumeRateLimit } from "./vtuInternal";
import { readPointRate } from "./pricing";
import {
  canonicalProductCode,
  resolvePointsCost,
  routeProduct,
} from "./vtuServiceRouting";
import {
  AIRTIME_NETWORKS,
  airtimeServiceCode,
  parseServiceCode,
  vtuServiceCodeLabel,
} from "../lib/vtu";

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

/** One history row, exactly as the customer's browser is allowed to see it. */
export interface VtuHistoryItem {
  _id: Id<"vtuTransactions">;
  status: string;
  serviceCode: string;
  /** What the service is CALLED — the catalog name where one still exists. */
  serviceLabel: string;
  /** The first segment of the service code, so the client picks an icon
   *  without parsing an internal code string itself. */
  serviceType: string;
  /** Stored masked; see the query below. */
  customerIdentifier: string;
  nairaPrice: number;
  ngnPerPoint: number;
  pointsDebited: number;
  /** The route, snapshotted at purchase. Null on pre-slice-3 rows. */
  routedProvider: string | null;
  routedProviderProductCode: string | null;
  providerReference: string | null;
  reversalReason: string | null;
  unresolvedReason: string | null;
  resolvedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

/**
 * Display names for the distinct products on ONE page.
 *
 * Deduped on purpose. A page of fifteen transactions is typically one to three
 * distinct products, and a catalog read per ROW would be the N+1 pattern this
 * codebase forbids. The reads are concurrent because they do not depend on each
 * other.
 *
 * A product that has been deleted simply has no entry, and the caller falls
 * back to a label derived from the row's own service code.
 */
async function resolveCatalogLabels(
  ctx: QueryCtx,
  rows: Doc<"vtuTransactions">[],
): Promise<Map<string, string>> {
  const codes = new Set<string>();
  for (const row of rows) {
    const code = canonicalProductCode(row.serviceCode);
    if (code) codes.add(code);
  }

  const found = await Promise.all(
    [...codes].map(async (productCode) => {
      const product = await ctx.db
        .query("vtuServiceCatalog")
        .withIndex("by_productCode", (q) => q.eq("productCode", productCode))
        .unique();
      return product ? ([productCode, product.displayName] as const) : null;
    }),
  );

  const labels = new Map<string, string>();
  for (const entry of found) if (entry) labels.set(entry[0], entry[1]);
  return labels;
}

/** Copied field by field so a future internal column cannot leak by accident. */
function toHistoryItem(
  tx: Doc<"vtuTransactions">,
  labels: Map<string, string>,
): VtuHistoryItem {
  const productCode = canonicalProductCode(tx.serviceCode);
  return {
    _id: tx._id,
    status: tx.status,
    serviceCode: tx.serviceCode,
    serviceLabel:
      (productCode ? labels.get(productCode) : undefined) ??
      vtuServiceCodeLabel(tx.serviceCode),
    serviceType: tx.serviceCode.split(".")[0] ?? "",
    customerIdentifier: tx.customerIdentifier,
    nairaPrice: tx.nairaPrice,
    ngnPerPoint: tx.ngnPerPoint,
    pointsDebited: tx.pointsDebited,
    routedProvider: tx.routedProvider ?? null,
    routedProviderProductCode: tx.routedProviderProductCode ?? null,
    providerReference: tx.providerReference ?? null,
    reversalReason: tx.reversalReason ?? null,
    unresolvedReason: tx.unresolvedReason ?? null,
    resolvedAt: tx.resolvedAt ?? null,
    createdAt: tx.createdAt,
    updatedAt: tx.updatedAt,
  };
}

/**
 * The name to show for ONE service code.
 *
 * Prefers the catalog's `displayName`, because that is the name the customer
 * saw when they bought. Falls back to a label derived from the service code
 * itself, because a transaction outlives the product it was sold from and a
 * deleted catalog row must not leave a receipt reading `airtime.mtn.1000`.
 *
 * Deliberately NOT built on `resolveCatalogLabels` below: that one exists to
 * price a PAGE of rows with one read per distinct product, and this exists to
 * name a single row. Sharing them would mean either a batch of one or a loop of
 * un-deduped reads, and both are worse than four duplicated lines.
 */
export async function resolveServiceLabel(
  ctx: QueryCtx,
  serviceCode: string,
): Promise<string> {
  const productCode = canonicalProductCode(serviceCode);
  if (productCode) {
    const product = await ctx.db
      .query("vtuServiceCatalog")
      .withIndex("by_productCode", (q) => q.eq("productCode", productCode))
      .unique();
    if (product) return product.displayName;
  }
  return vtuServiceCodeLabel(serviceCode);
}

/**
 * A customer's own VTU history, newest first, cursor-paginated.
 *
 * PAGINATED, NOT `take(n)`. A customer's VTU rows grow without bound, and a
 * `take(limit)` that quietly stops at the limit is indistinguishable from a
 * complete history — the page would look finished while dropping the older
 * half. A cursor makes "there is more" a fact the UI can state and act on.
 *
 * Indexed on `by_user` — `["userId", "createdAt"]` — so `order("desc")` walks
 * the caller's own rows newest-first without scanning the table, and nothing
 * here `.filter()`s a large dataset.
 *
 * The identifier comes back ALREADY MASKED because it is STORED masked:
 * `beginPurchase` runs `maskIdentifier` before the insert, so the digits were
 * never written down in the first place. There is no un-masked copy in the
 * database for a read path to forget to hide.
 */
export const listMyHistory = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    // Signed out: an EMPTY, finished page rather than a throw. This route sits
    // behind auth, so the only way here is a session expiring mid-page, and an
    // error would replace the customer's history with a crash screen.
    if (!userId) {
      return { page: [] as VtuHistoryItem[], isDone: true, continueCursor: "" };
    }

    const result = await ctx.db
      .query("vtuTransactions")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .paginate(args.paginationOpts);

    const labels = await resolveCatalogLabels(ctx, result.page);

    return {
      page: result.page.map((tx) => toHistoryItem(tx, labels)),
      isDone: result.isDone,
      continueCursor: result.continueCursor,
    };
  },
});

export { consumeRateLimit };
