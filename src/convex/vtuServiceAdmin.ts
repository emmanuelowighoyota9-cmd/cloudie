/**
 * Admin management for the VTU service catalog and its routing table.
 *
 * Same rule as `vtuProviderAdmin.ts`: every function re-verifies the admin
 * role SERVER-SIDE via `requireAdmin`, whatever the client believes. The
 * `RequireAdmin` component is a convenience layer, not the boundary.
 *
 * The other rule is specific to this file: the ROUTING ALGORITHM IS NOT
 * REIMPLEMENTED HERE. `previewRoute` calls `routeProduct` — the same pure
 * function the purchase mutation calls — so the thing an operator verifies
 * before saving is the thing that will actually happen afterwards. A
 * "simulation" that reimplemented the rules would drift from them on the first
 * change and would be worse than no preview at all.
 */

import { mutation, query } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { auditLog, requireAdmin } from "./adminApi";
import { VTU_SERVICE_TYPES } from "./schema";
import { resolvePointsCost, routeProduct } from "./vtuServiceRouting";

const serviceTypeValidator = v.union(
  ...VTU_SERVICE_TYPES.map((s) => v.literal(s)),
);

// ─── Reads ─────────────────────────────────────────────────────────

/**
 * Every catalog product with its active-route count.
 *
 * The count is what makes the "buyers will get NO_ROUTE_AVAILABLE" warning
 * possible without the operator cross-referencing two tables by eye.
 */
export const listProducts = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);

    const products = await ctx.db
      .query("vtuServiceCatalog")
      .withIndex("by_serviceType_active")
      .take(200);
    const routes = await ctx.db.query("vtuServiceRouting").take(500);

    const counts = new Map<string, number>();
    for (const r of routes) {
      if (r.active !== true) continue;
      counts.set(r.productCode, (counts.get(r.productCode) ?? 0) + 1);
    }

    return products.map((p) => ({
      _id: p._id,
      serviceType: p.serviceType,
      productCode: p.productCode,
      displayName: p.displayName,
      customerIdentifierLabel: p.customerIdentifierLabel,
      requiresAmount: p.requiresAmount,
      requiresPackageCode: p.requiresPackageCode,
      minAmount: p.minAmount ?? null,
      maxAmount: p.maxAmount ?? null,
      priceNgn: p.priceNgn ?? null,
      active: p.active,
      activeRouteCount: counts.get(p.productCode) ?? 0,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    }));
  },
});

/**
 * Routing rows, optionally narrowed to one product.
 *
 * `take` is bounded rather than `collect()`: this table grows with
 * (products x providers), and an admin listing is not a reason to pull the
 * whole table into memory on every keystroke of the filter.
 */
export const listRoutes = query({
  args: { productCode: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);

    const routes = args.productCode
      ? await ctx.db
          .query("vtuServiceRouting")
          .withIndex("by_productCode_provider", (q) =>
            q.eq("productCode", args.productCode!),
          )
          .take(200)
      : await ctx.db.query("vtuServiceRouting").take(200);

    // One pass over the providers table, not one lookup per route.
    const providers = await ctx.db.query("vtuProviders").take(100);
    const byName = new Map(providers.map((p) => [p.name, p]));

    return routes
      .map((r) => {
        const provider = byName.get(r.provider);
        return {
          _id: r._id,
          productCode: r.productCode,
          provider: r.provider,
          providerDisplayName: provider?.displayName ?? r.provider,
          providerStatus: provider?.status ?? ("missing" as const),
          providerProductCode: r.providerProductCode,
          providerPackageCode: r.providerPackageCode ?? null,
          pointsCostOverride: r.pointsCostOverride ?? null,
          priority: r.priority,
          active: r.active,
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        };
      })
      .sort((a, b) => a.productCode.localeCompare(b.productCode) || a.priority - b.priority);
  },
});

/**
 * Dry-run the routing decision for one product.
 *
 * READ-ONLY. It runs the real `routeProduct` and returns the full ordered
 * candidate list including the ineligible ones, so an operator can see not
 * only which provider wins but why the one they expected did not.
 */
export const previewRoute = query({
  args: { productCode: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const result = await routeProduct(ctx, args.productCode);
    return result;
  },
});

/**
 * Dry-run the price for a product, at every level of precedence.
 *
 * Returns what the winning route would charge for a given naira amount, and
 * whether an override produced it. Purely informational: it reads the same
 * function the purchase path calls, and writes nothing.
 */
export const previewCost = query({
  args: { productCode: v.string(), nairaPrice: v.number() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const route = await routeProduct(ctx, args.productCode);
    if (!route.ok) return { ok: false as const, code: route.code };
    return {
      ok: true as const,
      provider: route.winner.provider,
      cost: await resolvePointsCost(ctx, {
        productCode: args.productCode,
        serviceCode: args.productCode,
        provider: route.winner.provider,
        nairaPrice: args.nairaPrice,
      }),
    };
  },
});

// ─── Product CRUD ──────────────────────────────────────────────────

export const createProduct = mutation({
  args: {
    serviceType: serviceTypeValidator,
    productCode: v.string(),
    displayName: v.string(),
    customerIdentifierLabel: v.string(),
    requiresAmount: v.boolean(),
    requiresPackageCode: v.boolean(),
    minAmount: v.optional(v.number()),
    maxAmount: v.optional(v.number()),
    /** The provider's fixed price for ONE of these, in naira. Required in
     *  practice for a product the customer does not price — a data plan or a
     *  cable bouquet — because the purchase has no amount to fall back on. */
    priceNgn: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"vtuServiceCatalog">> => {
    const { adminId } = await requireAdmin(ctx);

    const productCode = args.productCode.trim().toLowerCase();
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(productCode)) {
      throw new Error(
        "Product code must be lowercase words separated by hyphens, e.g. airtime-mtn.",
      );
    }

    // Convex declares no uniqueness constraint, so this check-then-insert is
    // what makes the code globally unique. It runs inside a serializable
    // transaction, so two admins saving "airtime-mtn" at once cannot both win.
    const existing = await ctx.db
      .query("vtuServiceCatalog")
      .withIndex("by_productCode", (q) => q.eq("productCode", productCode))
      .unique();
    if (existing) throw new Error(`A product with the code "${productCode}" already exists.`);

    const now = Date.now();
    const id = await ctx.db.insert("vtuServiceCatalog", {
      serviceType: args.serviceType,
      productCode,
      displayName: args.displayName,
      customerIdentifierLabel: args.customerIdentifierLabel,
      requiresAmount: args.requiresAmount,
      requiresPackageCode: args.requiresPackageCode,
      minAmount: args.minAmount,
      maxAmount: args.maxAmount,
      priceNgn: args.priceNgn,
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    await auditLog(ctx, adminId, {
      action: "vtu_product_created",
      resource: "vtuServiceCatalog",
      resourceId: productCode,
      after: { productCode, serviceType: args.serviceType },
    });
    return id;
  },
});

export const updateProduct = mutation({
  args: {
    productCode: v.string(),
    displayName: v.optional(v.string()),
    customerIdentifierLabel: v.optional(v.string()),
    requiresAmount: v.optional(v.boolean()),
    requiresPackageCode: v.optional(v.boolean()),
    minAmount: v.optional(v.number()),
    maxAmount: v.optional(v.number()),
    priceNgn: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ updated: boolean }> => {
    const { adminId } = await requireAdmin(ctx);
    const row = await findProduct(ctx, args.productCode);
    if (!row) throw new Error(`No product with the code "${args.productCode}".`);

    // `productCode` is deliberately NOT editable: routing rows, price overrides
    // and every historical transaction reference it. Renaming it would orphan
    // all three. A product is retired by setting `active: false`.
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.displayName !== undefined) patch.displayName = args.displayName;
    if (args.customerIdentifierLabel !== undefined) {
      patch.customerIdentifierLabel = args.customerIdentifierLabel;
    }
    if (args.requiresAmount !== undefined) patch.requiresAmount = args.requiresAmount;
    if (args.requiresPackageCode !== undefined) {
      patch.requiresPackageCode = args.requiresPackageCode;
    }
    if (args.minAmount !== undefined) patch.minAmount = args.minAmount;
    if (args.maxAmount !== undefined) patch.maxAmount = args.maxAmount;
    if (args.priceNgn !== undefined) patch.priceNgn = args.priceNgn;
    if (args.active !== undefined) patch.active = args.active;

    await ctx.db.patch(row._id, patch);
    await auditLog(ctx, adminId, {
      action: "vtu_product_updated",
      resource: "vtuServiceCatalog",
      resourceId: args.productCode,
      after: patch,
    });
    return { updated: true };
  },
});

export const deleteProduct = mutation({
  args: { productCode: v.string() },
  handler: async (ctx, args): Promise<{ deleted: boolean; routesDeleted: number }> => {
    const { adminId } = await requireAdmin(ctx);
    const row = await findProduct(ctx, args.productCode);
    if (!row) throw new Error(`No product with the code "${args.productCode}".`);

    const routes = await ctx.db
      .query("vtuServiceRouting")
      .withIndex("by_productCode_provider", (q) => q.eq("productCode", args.productCode))
      .take(200);

    // Routes are deleted with the product rather than orphaned. A route whose
    // product no longer exists can never be selected, so leaving it behind
    // would be a row that lies about being configurable.
    await Promise.all(routes.map((r) => ctx.db.delete(r._id)));
    await ctx.db.delete(row._id);

    await auditLog(ctx, adminId, {
      action: "vtu_product_deleted",
      resource: "vtuServiceCatalog",
      resourceId: args.productCode,
      after: { routesDeleted: routes.length },
    });
    return { deleted: true, routesDeleted: routes.length };
  },
});

// ─── Route CRUD ────────────────────────────────────────────────────

export const createRoute = mutation({
  args: {
    productCode: v.string(),
    provider: v.string(),
    providerProductCode: v.string(),
    providerPackageCode: v.optional(v.string()),
    pointsCostOverride: v.optional(v.number()),
    priority: v.optional(v.number()),
  },
  handler: async (ctx, args): Promise<Id<"vtuServiceRouting">> => {
    const { adminId } = await requireAdmin(ctx);

    const product = await findProduct(ctx, args.productCode);
    if (!product) throw new Error(`No product with the code "${args.productCode}".`);

    // A route for a product that does not exist can never be chosen, so it is
    // rejected at the point of creation rather than surfacing as a permanent
    // "no route" warning the operator cannot clear.
    const duplicate = await ctx.db
      .query("vtuServiceRouting")
      .withIndex("by_productCode_provider", (q) =>
        q.eq("productCode", args.productCode).eq("provider", args.provider),
      )
      .unique();
    if (duplicate) {
      throw new Error(
        `"${args.productCode}" already has a route to ${args.provider}. Edit that one instead.`,
      );
    }

    const now = Date.now();
    const id = await ctx.db.insert("vtuServiceRouting", {
      productCode: args.productCode,
      provider: args.provider,
      providerProductCode: args.providerProductCode,
      providerPackageCode: args.providerPackageCode,
      pointsCostOverride: args.pointsCostOverride,
      // Default to last, so adding a second provider never silently steals
      // traffic from the one already serving it.
      priority: args.priority ?? 100,
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    await auditLog(ctx, adminId, {
      action: "vtu_route_created",
      resource: "vtuServiceRouting",
      resourceId: `${args.productCode}:${args.provider}`,
      after: { priority: args.priority ?? 100, active: true },
    });
    return id;
  },
});

export const updateRoute = mutation({
  args: {
    productCode: v.string(),
    provider: v.string(),
    providerProductCode: v.optional(v.string()),
    providerPackageCode: v.optional(v.string()),
    pointsCostOverride: v.optional(v.number()),
    priority: v.optional(v.number()),
    active: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<{ updated: boolean }> => {
    const { adminId } = await requireAdmin(ctx);
    const row = await findRoute(ctx, args.productCode, args.provider);
    if (!row) {
      throw new Error(`No route from "${args.productCode}" to ${args.provider}.`);
    }

    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (args.providerProductCode !== undefined) {
      patch.providerProductCode = args.providerProductCode;
    }
    if (args.providerPackageCode !== undefined) {
      patch.providerPackageCode = args.providerPackageCode;
    }
    if (args.pointsCostOverride !== undefined) {
      patch.pointsCostOverride = args.pointsCostOverride;
    }
    if (args.priority !== undefined) patch.priority = args.priority;
    if (args.active !== undefined) patch.active = args.active;

    await ctx.db.patch(row._id, patch);
    await auditLog(ctx, adminId, {
      action: "vtu_route_updated",
      resource: "vtuServiceRouting",
      resourceId: `${args.productCode}:${args.provider}`,
      after: patch,
    });
    return { updated: true };
  },
});

export const deleteRoute = mutation({
  args: { productCode: v.string(), provider: v.string() },
  handler: async (ctx, args): Promise<{ deleted: boolean }> => {
    const { adminId } = await requireAdmin(ctx);
    const row = await findRoute(ctx, args.productCode, args.provider);
    if (!row) {
      throw new Error(`No route from "${args.productCode}" to ${args.provider}.`);
    }
    await ctx.db.delete(row._id);
    await auditLog(ctx, adminId, {
      action: "vtu_route_deleted",
      resource: "vtuServiceRouting",
      resourceId: `${args.productCode}:${args.provider}`,
    });
    return { deleted: true };
  },
});

async function findProduct(
  ctx: { db: any },
  productCode: string,
): Promise<Doc<"vtuServiceCatalog"> | null> {
  return ctx.db
    .query("vtuServiceCatalog")
    .withIndex("by_productCode", (q: any) => q.eq("productCode", productCode))
    .unique();
}

async function findRoute(
  ctx: { db: any },
  productCode: string,
  provider: string,
): Promise<Doc<"vtuServiceRouting"> | null> {
  return ctx.db
    .query("vtuServiceRouting")
    .withIndex("by_productCode_provider", (q: any) =>
      q.eq("productCode", productCode).eq("provider", provider),
    )
    .unique();
}

// ─── Migration ─────────────────────────────────────────────────────

/** The canonical product slice 1 supported, and the one route it used. */
const SEED_PRODUCT_CODE = "airtime-mtn";
const SEED_PROVIDER = "pairgate";
/**
 * `{amount}` is filled with the purchase amount, so this composes to exactly
 * the "airtime.mtn.<amount>" string the slice-1 adapter was handed. The wire
 * bytes are unchanged; only where the string comes from has moved.
 */
const SEED_PROVIDER_PRODUCT_CODE = "airtime.mtn.{amount}";

/**
 * Seed the catalog and routing tables so slice 3 is a no-op for existing users.
 *
 * IDEMPOTENT and NON-DESTRUCTIVE. It inserts only what is missing and never
 * overwrites a row an admin has edited — re-running after an operator has
 * re-pointed `airtime-mtn` at AidaPay must not undo that.
 *
 * The pairgate provider row is a PREREQUISITE, not a dependency it can create:
 * a route pointing at a provider that does not exist can never be chosen, and
 * seeding one anyway would leave the operator with a product that fails with
 * NO_ROUTE_AVAILABLE and no obvious cause. So when the row is missing this
 * returns `blocked` and writes nothing, and the operator re-runs it after the
 * provider migration.
 */
export const migrateVtuServiceCatalog = mutation({
  args: {},
  handler: async (ctx) => {
    const { adminId } = await requireAdmin(ctx);
    const now = Date.now();

    const provider = await ctx.db
      .query("vtuProviders")
      .withIndex("by_name", (q: any) => q.eq("name", SEED_PROVIDER))
      .unique();

    if (!provider) {
      await auditLog(ctx, adminId, {
        action: "vtu_catalog_migration_blocked",
        resource: "vtuServiceCatalog",
        resourceId: SEED_PRODUCT_CODE,
        reason: `Provider "${SEED_PROVIDER}" is not configured yet`,
      });
      return {
        action: "blocked" as const,
        reason: `No provider named "${SEED_PROVIDER}" exists. Run the provider migration first, then re-run this one.`,
      };
    }

    let action: "inserted" | "noop" = "noop";

    const existingProduct = await findProduct(ctx, SEED_PRODUCT_CODE);
    if (!existingProduct) {
      await ctx.db.insert("vtuServiceCatalog", {
        serviceType: "airtime",
        productCode: SEED_PRODUCT_CODE,
        displayName: "MTN Airtime",
        customerIdentifierLabel: "Phone number",
        requiresAmount: true,
        requiresPackageCode: false,
        // Exactly the bounds `parseServiceCode` already enforced in code, so
        // moving them into data does not widen what can be bought.
        minAmount: 100,
        maxAmount: 100_000,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      action = "inserted";
    }

    const existingRoute = await findRoute(ctx, SEED_PRODUCT_CODE, SEED_PROVIDER);
    if (!existingRoute) {
      await ctx.db.insert("vtuServiceRouting", {
        productCode: SEED_PRODUCT_CODE,
        provider: SEED_PROVIDER,
        providerProductCode: SEED_PROVIDER_PRODUCT_CODE,
        priority: 1,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      action = "inserted";
    }

    await auditLog(ctx, adminId, {
      action: "vtu_catalog_migrated",
      resource: "vtuServiceCatalog",
      resourceId: SEED_PRODUCT_CODE,
      after: { action, provider: SEED_PROVIDER },
      reason:
        action === "noop"
          ? "Catalog and route already present; no changes made"
          : "Seeded the slice-1 product and its Pairgate route",
    });

    return { action, productCode: SEED_PRODUCT_CODE, provider: SEED_PROVIDER };
  },
});
