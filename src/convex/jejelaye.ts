"use node";

import { getAuthUserId } from "@convex-dev/auth/server";
import { action } from "./_generated/server";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

const BASE_URL = "https://jejelayegct.com.ng/api/v1";

type NumberProduct = {
  productKey: string;
  serviceName: string;
  countryCode: string;
  countryName: string;
  serverKey: string;
  publicServiceKey: string;
  numberType: string;
  price: number;
  currency: string;
  available: number | null;
  variationId?: string;
  areaCodes: string[];
};

const str = (...xs: unknown[]) =>
  xs.find((x): x is string => typeof x === "string" && x.trim().length > 0)?.trim() ?? "";
const num = (...xs: unknown[]) => {
  for (const x of xs) { const n = Number(x); if (Number.isFinite(n)) return n; }
  return 0;
};
const arr = (x: unknown) => Array.isArray(x) ? x : [];

async function request(path: string, init?: RequestInit) {
  const key = process.env.JEJELAYE_API_KEY;
  if (!key) throw new Error("JEJELAYE_NOT_CONFIGURED");
  const response = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: { Accept: "application/json", Authorization: `Bearer ${key}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`JEJELAYE_${response.status}: ${str(body?.message) || "Request failed"}`);
  return body;
}

function catalogProducts(body: unknown): NumberProduct[] {
  const out: NumberProduct[] = [];
  const seen = new Set<string>();

  function walk(node: unknown, ctx: { serverKey: string; countryCode: string; countryName: string }) {
    if (Array.isArray(node)) { node.forEach((x) => walk(x, ctx)); return; }
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    const next = {
      serverKey: str(o.server_key, o.serverKey, ctx.serverKey),
      countryCode: str(o.country_code, o.countryCode, ctx.countryCode).toUpperCase(),
      countryName: str(o.country_name, o.countryName, ctx.countryName),
    };
    const serviceKey = str(o.public_service_key, o.publicServiceKey, o.service_key, o.serviceKey, o.service_code);
    const serviceName = str(o.service_name, o.serviceName, o.display_name, o.displayName, o.label, o.name);

    if (serviceKey && serviceName) {
      const variations = arr(o.variations);
      for (const raw of (variations.length ? variations : [null])) {
        const v0 = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
        const variationId = str(v0.variation_id, v0.variationId, v0.id) || undefined;
        const price = num(v0.selling_price, v0.sellingPrice, v0.price, o.selling_price, o.sellingPrice, o.price);
        const rawAvailable = v0.available ?? v0.stock ?? o.available ?? o.stock ?? o.available_quantity;
        const available = rawAvailable == null ? null : num(rawAvailable);
        const numberType = str(v0.number_type, v0.numberType, o.number_type, o.numberType, "regular");
        const areaCodes = arr(v0.area_codes ?? o.area_codes).map(String).map((x) => x.trim()).filter(Boolean);
        const productKey = [next.serverKey, serviceKey, variationId ?? "", numberType].join(":");
        if (price > 0 && !seen.has(productKey)) {
          seen.add(productKey);
          out.push({
            productKey, serviceName,
            countryCode: next.countryCode || "USA",
            countryName: next.countryName || "United States",
            serverKey: next.serverKey, publicServiceKey: serviceKey, numberType,
            price, currency: str(v0.currency, o.currency, "NGN"),
            available, variationId, areaCodes,
          });
        }
      }
    }

    for (const [key, value] of Object.entries(o)) {
      if (key === "variations" || key === "metadata") continue;
      if (Array.isArray(value) || (value && typeof value === "object")) walk(value, next);
    }
  }

  const root = body && typeof body === "object" && "data" in (body as Record<string, unknown>)
    ? (body as Record<string, unknown>).data : body;
  walk(root, { serverKey: "", countryCode: "USA", countryName: "United States" });
  return out;
}

export const listNumberProducts = action({
  args: { category: v.optional(v.string()) },
  returns: v.array(v.object({
  productKey: v.string(),
  serviceName: v.string(),
  countryCode: v.string(),
  countryName: v.string(),
  serverKey: v.string(),
  publicServiceKey: v.string(),
  numberType: v.string(),
  price: v.number(),
  currency: v.string(),
  available: v.union(v.number(), v.null()),
  variationId: v.optional(v.string()),
  areaCodes: v.array(v.string()),
})),
  handler: async (ctx, args): Promise<NumberProduct[]> => {
    // Signed-in only: this is a proxy onto Jejelaye's paid catalog API, reached
    // from the authenticated marketplace. Open, it was a public endpoint that
    // spent the platform's provider quota on anyone's behalf.
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHORIZED");

    const category = args.category?.trim().toLowerCase() || "usa";
    return catalogProducts(await request(`/virtual-numbers/catalog?category=${encodeURIComponent(category)}`));
  },
});

// The handler return type is annotated rather than inferred. `_generated/api`
// imports this module, so an inferred return type that flows back through
// `ctx.runMutation(internal.*)` is a cycle TypeScript reports as TS7022/TS7023 —
// which degrades the whole generated `api` object to `any` for every caller.
export const purchaseNumber = action({
  args: {
    productKey: v.string(), category: v.string(), serverKey: v.string(),
    publicServiceKey: v.string(), numberType: v.string(),
    variationId: v.optional(v.string()), areaCodes: v.optional(v.string()),
    carrier: v.optional(v.string()), idempotencyKey: v.string(),
  },
  returns: v.object({
    orderId: v.id("marketplaceOrders"),
    status: v.string(),
    session: v.optional(v.any()),
  }),
  handler: async (ctx, args): Promise<{ orderId: Id<"marketplaceOrders">; status: string; session?: unknown }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHORIZED");
    const products = catalogProducts(await request(
      `/virtual-numbers/catalog?category=${encodeURIComponent(args.category)}&server_key=${encodeURIComponent(args.serverKey)}`,
    ));
    const product = products.find((p) => p.productKey === args.productKey);
    if (!product) throw new Error("JEJELAYE_NUMBER_PRODUCT_UNAVAILABLE");

    const prepared = await ctx.runMutation(internal.marketplace.prepareJejelayeNumberOrder, {
      userId, productKey: product.productKey,
      productName: `${product.serviceName} - ${product.countryCode}`,
      totalNgn: product.price, idempotencyKey: args.idempotencyKey, providerMetadata: product,
    });
    if (prepared.reused) return { orderId: prepared.orderId, status: "already_submitted", session: prepared.providerResponse ?? null };

    const payload: Record<string, unknown> = {
      category: args.category, server_key: args.serverKey,
      public_service_key: args.publicServiceKey, number_type: args.numberType,
    };
    if (args.variationId) payload.variation_id = args.variationId;
    if (args.areaCodes?.trim()) payload.area_codes = args.areaCodes.trim();
    if (args.carrier?.trim()) payload.carrier = args.carrier.trim();

    let body: any;
    try {
      body = await request("/virtual-numbers/purchase", {
        method: "POST",
        body: JSON.stringify(payload),
      });
    } catch (error) {
      await ctx.runMutation(internal.marketplace.finalizeJejelayeNumberOrder, {
        orderId: prepared.orderId,
        status: "cancelled",
        providerStatus: "failed",
        providerResponse: { error: error instanceof Error ? error.message : "JejeLaye purchase failed" },
      });
      throw error;
    }

    const session = body?.session ?? body?.data ?? body;
    const status = str(session?.status, body?.status, "waiting_for_otp");
    const reference = str(session?.reference, session?.order_reference, session?.order_id, body?.reference) || undefined;
    try {
      await ctx.runMutation(internal.marketplace.finalizeJejelayeNumberOrder, {
        orderId: prepared.orderId,
        status: status === "refunded" ? "cancelled" : "pending",
        providerOrderId: reference,
        providerStatus: status,
        providerResponse: session,
        fulfilledItems: session,
      });
    } catch {
      throw new Error("JEJELAYE_LOCAL_RECONCILIATION_REQUIRED");
    }

    return { orderId: prepared.orderId, status, session };
  },
});

export const refreshNumberSession = action({
  args: { orderId: v.id("marketplaceOrders") },
  returns: v.object({
    orderId: v.id("marketplaceOrders"),
    status: v.string(),
    session: v.optional(v.any()),
  }),
  handler: async (ctx, args): Promise<{ orderId: Id<"marketplaceOrders">; status: string; session?: unknown }> => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("UNAUTHORIZED");
    const order = await ctx.runQuery(api.marketplace.getMyOrder, { orderId: args.orderId });
    if (!order || order.buyerId !== userId || order.provider !== "jejelaye") throw new Error("ORDER_NOT_FOUND");
    if (!order.providerOrderId) throw new Error("JEJELAYE_SESSION_REFERENCE_MISSING");

    const body = await request("/virtual-numbers/sessions");
    const rows = Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : [];
    const session = rows.find((row: any) => String(row?.reference ?? row?.order_reference ?? row?.order_id ?? "") === order.providerOrderId);
    if (!session) return { orderId: args.orderId, status: order.providerStatus ?? "pending", session: null };

    const status = str(session.status, "pending");
    const finalStatus = status === "otp_received" ? "completed" : status === "refunded" ? "cancelled" : "pending";
    await ctx.runMutation(internal.marketplace.finalizeJejelayeNumberOrder, {
      orderId: args.orderId, status: finalStatus, providerOrderId: order.providerOrderId,
      providerStatus: status, providerResponse: session, fulfilledItems: session,
    });
    return { orderId: args.orderId, status, session };
  },
});
