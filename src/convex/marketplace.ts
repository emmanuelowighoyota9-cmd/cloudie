import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation, internalMutation } from "./_generated/server";
import { v } from "convex/values";
import { requireAdmin, auditLog } from "./adminApi";

// ─── Vendors ───
export const registerVendor = mutation({
  args: {
    businessName: v.string(),
    description: v.optional(v.string()),
    contactEmail: v.optional(v.string()),
    contactPhone: v.optional(v.string()),
    category: v.optional(v.string()),
    website: v.optional(v.string()),
    supportingInfo: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const existing = await ctx.db
      .query("vendors")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (existing) throw new Error("Already registered as vendor");

    return await ctx.db.insert("vendors", {
      userId,
      businessName: args.businessName,
      description: args.description,
      status: "pending",
      earnings: 0,
      totalSales: 0,
      createdAt: Date.now(),
    });
  },
});

export const getMyVendor = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    return await ctx.db
      .query("vendors")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
  },
});

export const createProduct = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    pointsPrice: v.number(),
    category: v.string(),
    imageUrl: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const vendor = await ctx.db
      .query("vendors")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!vendor || vendor.status !== "approved") {
      throw new Error("Must be an approved vendor");
    }

    return await ctx.db.insert("marketplaceProducts", {
      vendorId: vendor._id,
      name: args.name,
      description: args.description,
      pointsPrice: args.pointsPrice,
      category: args.category,
      imageUrl: args.imageUrl,
      isActive: false,
      isApproved: false,
      totalSold: 0,
      createdAt: Date.now(),
    });
  },
});

export const listProducts = query({
  args: { category: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let q = ctx.db.query("marketplaceProducts").filter((q) =>
      q.eq(q.field("isApproved"), true),
    );
    if (args.category) {
      q = q.filter((q) => q.eq(q.field("category"), args.category));
    }
    return await q.collect();
  },
});

export const getProduct = query({
  args: { id: v.id("marketplaceProducts") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

// ─── Orders ───
export const createOrder = mutation({
  args: {
    productId: v.id("marketplaceProducts"),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const product = await ctx.db.get(args.productId);
    if (!product || !product.isApproved || !product.isActive) {
      throw new Error("Product not available");
    }

    const totalPoints = product.pointsPrice * args.quantity;

    const user = await ctx.db.get(userId);
    const balance = user?.pointsBalance ?? 0;
    if (balance < totalPoints) {
      throw new Error("Insufficient points");
    }

    // Debit buyer
    const newBalance = balance - totalPoints;
    await ctx.db.patch(userId, { pointsBalance: newBalance });
    await ctx.db.insert("pointLedger", {
      userId,
      amount: -totalPoints,
      balanceAfter: newBalance,
      description: `Marketplace purchase: ${product.name}`,
      type: "marketplace_purchase",
      referenceId: args.productId,
      createdAt: Date.now(),
    });

    // Credit vendor
    const vendor = await ctx.db.get(product.vendorId);
    if (vendor) {
      const vendorUser = await ctx.db.get(vendor.userId);
      if (vendorUser) {
        const vendorBalance = vendorUser.pointsBalance ?? 0;
        await ctx.db.patch(vendor.userId, { pointsBalance: vendorBalance + totalPoints });
        await ctx.db.insert("pointLedger", {
          userId: vendor.userId,
          amount: totalPoints,
          balanceAfter: vendorBalance + totalPoints,
          description: `Sale: ${product.name}`,
          type: "vendor_transaction",
          referenceId: args.productId,
          createdAt: Date.now(),
        });
        await ctx.db.patch(vendor._id, {
          earnings: vendor.earnings + totalPoints,
          totalSales: vendor.totalSales + args.quantity,
        });
      }
    }

    // Update product sales
    await ctx.db.patch(args.productId, {
      totalSold: product.totalSold + args.quantity,
    });

    const orderId = await ctx.db.insert("marketplaceOrders", {
      buyerId: userId,
      productId: args.productId,
      vendorId: product.vendorId,
      quantity: args.quantity,
      totalPoints,
      status: "completed",
      createdAt: Date.now(),
    });

    // Notifications
    await ctx.db.insert("notifications", {
      userId,
      title: "Order placed",
      message: `Order for ${product.name} — ${totalPoints} points`,
      type: "marketplace_order",
      isRead: false,
      link: "/marketplace/orders",
      createdAt: Date.now(),
    });

    return orderId;
  },
});

export const getMyOrders = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    return await ctx.db
      .query("marketplaceOrders")
      .withIndex("by_buyer", (q) => q.eq("buyerId", userId))
      .order("desc")
      .collect();
  },
});

export const getMyOrder = query({
  args: { orderId: v.id("marketplaceOrders") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const order = await ctx.db.get(args.orderId);
    if (!order || order.buyerId !== userId) return null;
    return order;
  },
});

export const getVendorOrders = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const vendor = await ctx.db
      .query("vendors")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    if (!vendor) return [];
    return await ctx.db
      .query("marketplaceOrders")
      .withIndex("by_vendor", (q) => q.eq("vendorId", vendor._id))
      .order("desc")
      .collect();
  },
});

// ─── Disputes ───
export const createDispute = mutation({
  args: {
    orderId: v.id("marketplaceOrders"),
    reason: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("Order not found");
    if (order.buyerId !== userId) throw new Error("Not your order");

    await ctx.db.patch(args.orderId, { status: "disputed" });

    return await ctx.db.insert("disputes", {
      orderId: args.orderId,
      raisedBy: userId,
      reason: args.reason,
      status: "open",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

export const listDisputes = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return [];
    return await ctx.db.query("disputes").order("desc").collect();
  },
});

// Admin: approve product
export const adminApproveProduct = mutation({
  args: {
    productId: v.id("marketplaceProducts"),
    approve: v.boolean(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") throw new Error("Admin only");

    await ctx.db.patch(args.productId, {
      isApproved: args.approve,
      isActive: args.approve,
    });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actorEmail: user.email,
      action: args.approve ? "product_approval" : "product_rejection",
      resource: "marketplaceProduct",
      resourceId: args.productId,
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

// Admin: re-price a marketplace listing from the catalog (points only).
export const adminSetProductPrice = mutation({
  args: {
    productId: v.id("marketplaceProducts"),
    pointsPrice: v.number(),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("PRODUCT_NOT_FOUND");
    if (!Number.isFinite(args.pointsPrice) || args.pointsPrice < 0) {
      throw new Error("INVALID_PRICE");
    }

    const pointsPrice = Math.round(args.pointsPrice);
    const before = { pointsPrice: product.pointsPrice };
    await ctx.db.patch(args.productId, { pointsPrice });

    await auditLog(ctx, adminId, {
      action: "PRODUCT_PRICE_CHANGED",
      resource: "marketplaceProduct",
      resourceId: args.productId,
      before,
      after: { pointsPrice },
      reason: `Re-priced ${product.name} to ${pointsPrice} points`,
    });

    return { pointsPrice };
  },
});

// Admin: manage vendors
export const adminListVendors = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return [];
    return await ctx.db.query("vendors").order("desc").take(args.limit ?? 50);
  },
});

export const adminUpdateVendor = mutation({
  args: {
    vendorId: v.id("vendors"),
    status: v.union(
      v.literal("pending"),
      v.literal("approved"),
      v.literal("suspended"),
      v.literal("rejected"),
    ),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") throw new Error("Admin only");

    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new Error("Vendor not found");

    const oldStatus = vendor.status;
    await ctx.db.patch(args.vendorId, { status: args.status });

    await ctx.db.insert("auditLogs", {
      actorId: userId,
      actorEmail: user.email,
      action: "vendor_status_change",
      resource: "vendor",
      resourceId: args.vendorId,
      before: { status: oldStatus },
      after: { status: args.status },
      createdAt: Date.now(),
    });

    return { success: true };
  },
});

export const adminListAllProducts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return [];
    return await ctx.db
      .query("marketplaceProducts")
      .order("desc")
      .take(args.limit ?? 50);
  },
});

// Admin: create a catalog listing directly (no vendor account needed).
export const adminCreateProduct = mutation({
  args: {
    name: v.string(),
    description: v.string(),
    pointsPrice: v.number(),
    category: v.string(),
    imageUrl: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
    isApproved: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    if (!args.name.trim()) throw new Error("Name required");
    if (!args.description.trim()) throw new Error("Description required");
    if (!Number.isFinite(args.pointsPrice) || args.pointsPrice < 0) throw new Error("INVALID_PRICE");
    if (!args.category.trim()) throw new Error("Category required");
    // Admin-owned system vendor — create once and reuse.
    let systemVendor = await ctx.db.query("vendors").withIndex("by_status", (q) => q.eq("status", "approved")).first();
    // Try to find an admin-linked vendor first by user.
    const ownVendor = await ctx.db.query("vendors").withIndex("by_user", (q) => q.eq("userId", adminId)).first();
    if (ownVendor) systemVendor = ownVendor;
    let vendorId: any = systemVendor?._id;
    if (!systemVendor) {
      vendorId = await ctx.db.insert("vendors", {
        userId: adminId,
        businessName: "Platform catalog",
        description: "Admin-managed listings",
        status: "approved",
        earnings: 0,
        totalSales: 0,
        createdAt: Date.now(),
      });
    }
    const active = args.isApproved ?? true;
    const id = await ctx.db.insert("marketplaceProducts", {
      vendorId,
      name: args.name.trim().slice(0, 120),
      description: args.description.trim().slice(0, 800),
      pointsPrice: Math.round(args.pointsPrice),
      category: args.category.trim().slice(0, 40),
      imageUrl: args.imageUrl?.trim() ? args.imageUrl.trim() : undefined,
      isActive: args.isActive ?? active,
      isApproved: active,
      totalSold: 0,
      createdAt: Date.now(),
    });
    await auditLog(ctx, adminId, {
      action: "PRODUCT_CREATED_BY_ADMIN",
      resource: "marketplaceProduct",
      resourceId: id,
      after: { name: args.name, pointsPrice: args.pointsPrice, category: args.category },
    });
    return { productId: id };
  },
});

// Admin: bulk import many listings from a CSV/JSON payload (max 50 per call).
export const adminBulkImportProducts = mutation({
  args: {
    products: v.array(
      v.object({
        name: v.string(),
        description: v.string(),
        pointsPrice: v.number(),
        category: v.string(),
        imageUrl: v.optional(v.string()),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    if (args.products.length === 0) throw new Error("No products supplied");
    if (args.products.length > 50) throw new Error("TOO_MANY: max 50 per import");
    let systemVendor = await ctx.db.query("vendors").withIndex("by_user", (q) => q.eq("userId", adminId)).first();
    if (!systemVendor) {
      const anyApproved = await ctx.db.query("vendors").withIndex("by_status", (q) => q.eq("status", "approved")).first();
      systemVendor = anyApproved ?? null;
    }
    let vendorId: any = systemVendor?._id;
    if (!systemVendor) {
      vendorId = await ctx.db.insert("vendors", {
        userId: adminId,
        businessName: "Platform catalog",
        description: "Admin bulk import",
        status: "approved",
        earnings: 0,
        totalSales: 0,
        createdAt: Date.now(),
      });
    }
    let created = 0;
    for (const p of args.products) {
      if (!p.name.trim() || !p.category.trim()) continue;
      if (!Number.isFinite(p.pointsPrice) || p.pointsPrice < 0) continue;
      await ctx.db.insert("marketplaceProducts", {
        vendorId,
        name: p.name.trim().slice(0, 120),
        description: (p.description || p.name).trim().slice(0, 800),
        pointsPrice: Math.round(p.pointsPrice),
        category: p.category.trim().slice(0, 40),
        imageUrl: p.imageUrl?.trim() ? p.imageUrl.trim() : undefined,
        isActive: true,
        isApproved: true,
        totalSold: 0,
        createdAt: Date.now(),
      });
      created++;
    }
    await auditLog(ctx, adminId, {
      action: "PRODUCTS_BULK_IMPORTED",
      resource: "marketplaceProduct",
      after: { count: created },
    });
    return { created };
  },
});


/** Prepare and reserve a Logspanel marketplace order. External fulfillment happens in the action. */
export const prepareLogspanelOrder = internalMutation({
  args: {
    userId: v.id("users"),
    productId: v.id("marketplaceProducts"),
    quantity: v.number(),
    idempotencyKey: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.quantity < 1 || args.quantity > 100 || !Number.isInteger(args.quantity)) {
      throw new Error("INVALID_QUANTITY");
    }
    if (args.idempotencyKey.length < 8 || args.idempotencyKey.length > 120) {
      throw new Error("INVALID_IDEMPOTENCY_KEY");
    }

    const existing = await ctx.db
      .query("marketplaceOrders")
      .withIndex("by_order_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
      .first();
    if (existing) return { orderId: existing._id, reused: true, productRef: existing.providerOrderId ?? null };

    const product = await ctx.db.get(args.productId);
    if (!product || product.provider !== "logspanel" || !product.providerProductRef || !product.isApproved || !product.isActive) {
      throw new Error("LOGSPANEL_PRODUCT_UNAVAILABLE");
    }

    const user = await ctx.db.get(args.userId);
    if (!user) throw new Error("USER_NOT_FOUND");

    const totalPoints = Math.round(product.pointsPrice * args.quantity);
    if (!Number.isFinite(totalPoints) || totalPoints <= 0) throw new Error("INVALID_ORDER_TOTAL");
    const balance = user.pointsBalance ?? 0;
    if (balance < totalPoints) throw new Error("Insufficient points");

    const now = Date.now();
    const newBalance = balance - totalPoints;
    await ctx.db.patch(args.userId, { pointsBalance: newBalance });
    await ctx.db.insert("pointLedger", {
      userId: args.userId,
      amount: -totalPoints,
      balanceAfter: newBalance,
      description: `Marketplace purchase: ${product.name}`,
      type: "marketplace_purchase",
      referenceId: args.productId,
      idempotencyKey: args.idempotencyKey,
      metadata: { provider: "logspanel", providerProductRef: product.providerProductRef },
      createdAt: now,
    });

    const orderId = await ctx.db.insert("marketplaceOrders", {
      buyerId: args.userId,
      productId: args.productId,
      vendorId: product.vendorId,
      quantity: args.quantity,
      totalPoints,
      status: "pending",
      createdAt: now,
      provider: "logspanel",
      providerStatus: "pending",
      providerCostNgn: product.providerCostNgn,
      idempotencyKey: args.idempotencyKey,
      updatedAt: now,
    });

    return { orderId, reused: false, productRef: product.providerProductRef, totalPoints };
  },
});

/** Apply provider result. Provider failure refunds the reserved customer points atomically. */
export const finalizeLogspanelOrder = internalMutation({
  args: {
    orderId: v.id("marketplaceOrders"),
    status: v.union(v.literal("completed"), v.literal("pending"), v.literal("cancelled")),
    providerOrderId: v.optional(v.string()),
    providerStatus: v.optional(v.string()),
    providerResponse: v.optional(v.any()),
    fulfilledItems: v.optional(v.any()),
  },
  handler: async (ctx, args) => {
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("ORDER_NOT_FOUND");

    if (order.status === "completed" || order.status === "refunded" || order.status === "cancelled") {
      return { status: order.status, alreadyFinalized: true };
    }

    const now = Date.now();
    if (args.status === "cancelled") {
      const user = await ctx.db.get(order.buyerId);
      if (!user) throw new Error("USER_NOT_FOUND");
      const balance = user.pointsBalance ?? 0;
      const refundBalance = balance + order.totalPoints;
      await ctx.db.patch(order.buyerId, { pointsBalance: refundBalance });
      await ctx.db.insert("pointLedger", {
        userId: order.buyerId,
        amount: order.totalPoints,
        balanceAfter: refundBalance,
        description: `Refund: marketplace provider failure`,
        type: "refund",
        referenceId: order._id,
        idempotencyKey: `logspanel-refund-${order._id}`,
        metadata: { provider: "logspanel", providerOrderId: args.providerOrderId },
        createdAt: now,
      });
    }

    await ctx.db.patch(order._id, {
      status: args.status,
      providerOrderId: args.providerOrderId,
      providerStatus: args.providerStatus,
      providerResponse: args.providerResponse,
      fulfilledItems: args.fulfilledItems,
      updatedAt: now,
    });

    if (args.status === "completed") {
      const product = await ctx.db.get(order.productId);
      if (product) {
        await ctx.db.patch(product._id, { totalSold: product.totalSold + order.quantity });
      }
    }

    return { status: args.status, alreadyFinalized: false };
  },
});

export const getLogspanelProducts = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = Math.min(args.limit ?? 100, 200);
    return await ctx.db
      .query("marketplaceProducts")
      .withIndex("by_provider_ref", (q) => q.eq("provider", "logspanel"))
      .order("desc")
      .take(limit);
  },
});

export const getLogspanelAdminStatus = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const enabled = await ctx.db.query("adminSettings").withIndex("by_key", (q) => q.eq("key", "logspanel_enabled")).first();
    const markup = await ctx.db.query("adminSettings").withIndex("by_key", (q) => q.eq("key", "logspanel_markup_percent")).first();
    const products = await ctx.db.query("marketplaceProducts").withIndex("by_provider_ref", (q) => q.eq("provider", "logspanel")).take(200);
    return {
      configured: Boolean(process.env.LOGSPANEL_API_KEY),
      enabled: enabled?.value === true,
      markupPercent: typeof markup?.value === "number" ? markup.value : 0,
      syncedProducts: products.length,
    };
  },
});

export const isLogspanelEnabled = query({
  args: {},
  handler: async (ctx) => {
    const row = await ctx.db.query("adminSettings").withIndex("by_key", (q) => q.eq("key", "logspanel_enabled")).first();
    return row?.value === true && Boolean(process.env.LOGSPANEL_API_KEY);
  },
});

export const setLogspanelSettings = mutation({
  args: { enabled: v.boolean(), markupPercent: v.number() },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    if (!Number.isFinite(args.markupPercent) || args.markupPercent < 0 || args.markupPercent > 100) {
      throw new Error("INVALID_MARKUP");
    }
    const now = Date.now();
    for (const [key, value] of [
      ["logspanel_enabled", args.enabled],
      ["logspanel_markup_percent", args.markupPercent],
    ] as const) {
      const existing = await ctx.db.query("adminSettings").withIndex("by_key", (q) => q.eq("key", key)).first();
      if (existing) await ctx.db.patch(existing._id, { value, category: "marketplace_provider", updatedBy: adminId, updatedAt: now });
      else await ctx.db.insert("adminSettings", { key, value, category: "marketplace_provider", updatedBy: adminId, updatedAt: now });
    }
    await auditLog(ctx, adminId, {
      action: "LOGSPANEL_SETTINGS_CHANGED",
      resource: "marketplace_provider",
      after: { enabled: args.enabled, markupPercent: args.markupPercent },
    });
    return { success: true };
  },
});


export const syncLogspanelProducts = internalMutation({
  args: {
    products: v.array(v.any()),
    markupPercent: v.number(),
    ngnPerPoint: v.number(),
    adminId: v.id("users"),
  },
  handler: async (ctx, args) => {
    let vendor = await ctx.db.query("vendors").withIndex("by_user", (q) => q.eq("userId", args.adminId)).first();
    if (!vendor) {
      vendor = await ctx.db.query("vendors").withIndex("by_status", (q) => q.eq("status", "approved")).first();
    }
    let vendorId = vendor?._id;
    if (!vendorId) {
      vendorId = await ctx.db.insert("vendors", {
        userId: args.adminId,
        businessName: "Logspanel Provider",
        description: "External marketplace provider",
        status: "approved",
        earnings: 0,
        totalSales: 0,
        createdAt: Date.now(),
      });
    }

    const seen = new Set<string>();
    let created = 0;
    let updated = 0;
    for (const raw of args.products) {
      const ref = typeof raw?.product_ref === "string" ? raw.product_ref.trim() : "";
      if (!ref) continue;
      const name = typeof raw?.name === "string" ? raw.name.trim() : "Logspanel Product";
      const description = typeof raw?.description === "string" ? raw.description.trim() : "";
      const providerPrice = Number(raw?.selling_price);
      const available = Number(raw?.available_quantity);
      const purchasable = raw?.purchasable !== false;
      if (!Number.isFinite(providerPrice) || providerPrice < 0) continue;

      seen.add(ref);
      const customerPrice = Math.max(1, Math.ceil((providerPrice * (1 + args.markupPercent / 100)) / args.ngnPerPoint));
      const existing = await ctx.db
        .query("marketplaceProducts")
        .withIndex("by_provider_ref", (q) => q.eq("provider", "logspanel").eq("providerProductRef", ref))
        .first();

      const patch = {
        name: name.slice(0, 120),
        description: description.slice(0, 800),
        pointsPrice: customerPrice,
        category: "Logs",
        isActive: purchasable && (!Number.isFinite(available) || available > 0),
        isApproved: true,
        provider: "logspanel",
        providerProductRef: ref,
        providerCostNgn: providerPrice,
        providerAvailableQuantity: Number.isFinite(available) ? available : 0,
        providerStatus: purchasable ? "available" : "unavailable",
        providerSyncedAt: Date.now(),
        providerMetadata: {
          minQuantity: Number(raw?.min_quantity) || 1,
          maxQuantity: Number(raw?.max_quantity) || 100,
          currency: raw?.currency ?? "NGN",
        },
      };

      if (existing) {
        await ctx.db.patch(existing._id, patch);
        updated++;
      } else {
        await ctx.db.insert("marketplaceProducts", {
          vendorId,
          ...patch,
          totalSold: 0,
          createdAt: Date.now(),
        });
        created++;
      }
    }

    await auditLog(ctx, args.adminId, {
      action: "LOGSPANEL_CATALOG_SYNCED",
      resource: "marketplace_provider",
      after: { received: args.products.length, created, updated },
    });
    return { created, updated, received: args.products.length, seen: Array.from(seen) };
  },
});
