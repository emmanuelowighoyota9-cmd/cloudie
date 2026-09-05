import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

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
