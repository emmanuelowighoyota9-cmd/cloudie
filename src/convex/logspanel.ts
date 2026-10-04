"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";

const BASE_URL = "https://logspanel.com/api/v1";

/**
 * These return shapes are written out rather than inferred, and that is load
 * bearing.
 *
 * Every handler below reaches into the public API (`api.…`) or the internal API
 * (`internal.…`). Both are declared in `_generated/api.d.ts` as a filter over
 * this file's own exports, so inferring a handler's return type from an
 * `api`/`internal` call asks TypeScript to know the thing it is in the middle of
 * computing — a circle. TypeScript reports that circle on the handler as
 * TS7022/TS7023, and, because `skipLibCheck` is on, the same circle quietly
 * types the generated `api` as `any`. A single `any` there erases the type of
 * every `useQuery(api.…)` result in the app, which is exactly the cascade the
 * production build was failing on. Annotating the return type breaks the circle
 * at its cheapest link; the rest of the app keeps its real types.
 */
type CatalogSyncResult = {
  created: number;
  updated: number;
  received: number;
  seen: string[];
};

type PurchaseResult =
  | { orderId: Id<"marketplaceOrders">; reused: true; status: string }
  | {
      orderId: Id<"marketplaceOrders">;
      providerOrderId: string | null;
      status: string;
      items: unknown;
    };

type OrderRefreshResult = {
  orderId: Id<"marketplaceOrders">;
  status: string;
  items: unknown;
};

async function requestLogspanel(path: string, init?: RequestInit) {
  const key = process.env.LOGSPANEL_API_KEY;
  if (!key) throw new Error("LOGSPANEL_NOT_CONFIGURED");
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const message = typeof body?.message === "string" ? body.message : "Logspanel request failed";
    throw new Error(`LOGSPANEL_${response.status}: ${message}`);
  }
  return body;
}

export const syncCatalog = action({
  args: {},
  handler: async (ctx): Promise<CatalogSyncResult> => {
    const adminId = await getAuthUserId(ctx);
    if (!adminId) throw new Error("UNAUTHORIZED");
    const me = await ctx.runQuery(api.users.currentUser);
    if (me?.role !== "admin" || me.isSuspended) throw new Error("FORBIDDEN");

    const settings = await ctx.runQuery(api.marketplace.getLogspanelAdminStatus);
    if (!settings.configured) throw new Error("LOGSPANEL_NOT_CONFIGURED");

    const products: any[] = [];
    for (let page = 1; page <= 50; page++) {
      const body = await requestLogspanel(`/logs/products?per_page=100&page=${page}`);
      const rows = Array.isArray(body?.data) ? body.data : [];
      products.push(...rows);
      if (!body?.links?.next || rows.length === 0) break;
    }

    const billing = await ctx.runQuery(api.pricing.getBillingConfig);
    return await ctx.runMutation(internal.marketplace.syncLogspanelProducts, {
      products,
      markupPercent: settings.markupPercent,
      ngnPerPoint: billing.ngnPerPoint,
      adminId,
    });
  },
});

export const purchase = action({
  args: {
    productId: v.id("marketplaceProducts"),
    quantity: v.number(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args): Promise<PurchaseResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHORIZED");
    const enabled = await ctx.runQuery(api.marketplace.isLogspanelEnabled);
    if (!enabled) throw new Error("LOGSPANEL_DISABLED");
    if (args.quantity < 1 || args.quantity > 100 || !Number.isInteger(args.quantity)) {
      throw new Error("INVALID_QUANTITY");
    }

    const prepared = await ctx.runMutation(internal.marketplace.prepareLogspanelOrder, {
      userId,
      productId: args.productId,
      quantity: args.quantity,
      idempotencyKey: args.idempotencyKey,
    });

    if (prepared.reused) {
      return { orderId: prepared.orderId, reused: true, status: "already_submitted" };
    }

    let body: any;
    try {
      const product = await ctx.runQuery(api.marketplace.getProduct, { id: args.productId });
      if (!product?.providerProductRef) throw new Error("LOGSPANEL_PRODUCT_UNAVAILABLE");

      body = await requestLogspanel("/logs/orders", {
        method: "POST",
        body: JSON.stringify({
          product_ref: product.providerProductRef,
          quantity: args.quantity,
          idempotency_key: args.idempotencyKey,
        }),
      });
    } catch (error) {
      await ctx.runMutation(internal.marketplace.finalizeLogspanelOrder, {
        orderId: prepared.orderId,
        status: "cancelled",
        providerStatus: "failed",
        providerResponse: { error: error instanceof Error ? error.message : "Provider failure" },
      });
      throw error;
    }

    const data = body?.data ?? {};
    const status = data.status === "pending" ? "pending" : "completed";
    const finalizeArgs = {
      orderId: prepared.orderId,
      status,
      providerOrderId: typeof data.order_id === "string" ? data.order_id : undefined,
      providerStatus: typeof data.status === "string" ? data.status : undefined,
      providerResponse: data,
      fulfilledItems: data.items,
    } as const;

    try {
      await ctx.runMutation(internal.marketplace.finalizeLogspanelOrder, finalizeArgs);
    } catch {
      // The provider purchase succeeded. Do not refund automatically; keep the
      // local order pending so an operator/retry can reconcile the provider ID.
      try {
        await ctx.runMutation(internal.marketplace.finalizeLogspanelOrder, finalizeArgs);
      } catch {
        throw new Error("LOGSPANEL_LOCAL_RECONCILIATION_REQUIRED");
      }
    }

    return {
      orderId: prepared.orderId,
      providerOrderId: data.order_id ?? null,
      status: data.status ?? status,
      items: data.items ?? [],
    };
  },
});

export const refreshOrder = action({
  args: { orderId: v.id("marketplaceOrders") },
  handler: async (ctx, args): Promise<OrderRefreshResult> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHORIZED");
    const order = await ctx.runQuery(api.marketplace.getMyOrder, { orderId: args.orderId });
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (order.provider !== "logspanel" || !order.providerOrderId) throw new Error("NOT_A_LOGSPANEL_ORDER");

    const body = await requestLogspanel("/logs/orders/" + encodeURIComponent(order.providerOrderId));
    const data = body?.data ?? {};
    const status = data.status === "completed" ? "completed" : data.status === "pending" ? "pending" : "cancelled";

    await ctx.runMutation(internal.marketplace.finalizeLogspanelOrder, {
      orderId: args.orderId,
      status,
      providerOrderId: order.providerOrderId,
      providerStatus: typeof data.status === "string" ? data.status : undefined,
      providerResponse: data,
      fulfilledItems: data.items,
    });

    return {
      orderId: args.orderId,
      status: data.status ?? status,
      items: data.items ?? [],
    };
  },
});
