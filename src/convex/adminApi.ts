import { getAuthUserId } from "@convex-dev/auth/server";
import { QueryCtx, MutationCtx, query, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { v } from "convex/values";

/**
 * Centralized admin authorization guard.
 *
 * Every admin query/mutation resolves identity server-side via the Convex
 * Auth session — never from client input. ADMIN role is required; extend
 * here if finer roles (FINANCE_ADMIN etc.) are added later.
 */
export async function requireAdmin(ctx: QueryCtx | MutationCtx) {
  const adminId = await getAuthUserId(ctx);
  if (!adminId) throw new Error("UNAUTHORIZED");
  const admin = await ctx.db.get(adminId);
  if (!admin || admin.role !== "admin") throw new Error("FORBIDDEN");
  if (admin.isSuspended) throw new Error("FORBIDDEN: admin account suspended");
  return { adminId, admin };
}

async function getAdminOrNull(ctx: QueryCtx) {
  const adminId = await getAuthUserId(ctx);
  if (!adminId) return null;
  const admin = await ctx.db.get(adminId);
  if (!admin || admin.role !== "admin" || admin.isSuspended) return null;
  return { adminId, admin };
}

/** Wrap a mutation body with the admin guard and audit-log convenience. */
export async function auditLog(
  ctx: MutationCtx,
  adminId: Id<"users">,
  entry: {
    action: string;
    resource: string;
    resourceId?: string;
    before?: unknown;
    after?: unknown;
    reason?: string;
  },
) {
  const admin = await ctx.db.get(adminId);
  await ctx.db.insert("auditLogs", {
    actorId: adminId,
    actorEmail: admin?.email,
    action: entry.action,
    resource: entry.resource,
    resourceId: entry.resourceId,
    before: entry.before,
    after: entry.after,
    reason: entry.reason,
    createdAt: Date.now(),
  });
}

// ─── Pricing ────────────────────────────────────────────────────────────────

export const getPricing = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    return await ctx.db.query("pointPricing").withIndex("by_service").collect();
  },
});

/** Catalog copy is trimmed and capped; blank means "use the platform default". */
function catalogText(value: string | undefined, max: number): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, max) : undefined;
}

export const upsertPricing = mutation({
  args: {
    service: v.string(),
    workspace: v.string(),
    pointsCost: v.number(),
    /** Optional per-service price override (blank = derive from point rate). */
    priceNgn: v.optional(v.number()),
    priceUsd: v.optional(v.number()),
    /** Customer-facing catalog name + description shown in the admin catalog. */
    label: v.optional(v.string()),
    description: v.optional(v.string()),
    isActive: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { adminId, admin } = await requireAdmin(ctx);
    if (!Number.isFinite(args.pointsCost) || args.pointsCost < 0) {
      throw new Error("INVALID_COST");
    }
    if (args.priceNgn !== undefined && (!Number.isFinite(args.priceNgn) || args.priceNgn < 0)) {
      throw new Error("INVALID_NGN_PRICE");
    }
    if (args.priceUsd !== undefined && (!Number.isFinite(args.priceUsd) || args.priceUsd < 0)) {
      throw new Error("INVALID_USD_PRICE");
    }

    const now = Date.now();
    const existing = await ctx.db
      .query("pointPricing")
      .withIndex("by_service", (q) => q.eq("service", args.service))
      .first();

    let id: Id<"pointPricing">;
    if (existing) {
      const before = {
        pointsCost: existing.pointsCost,
        priceNgn: existing.priceNgn,
        priceUsd: existing.priceUsd,
        isActive: existing.isActive,
      };
      const after = {
        pointsCost: args.pointsCost,
        priceNgn: args.priceNgn,
        priceUsd: args.priceUsd,
        isActive: args.isActive,
      };
      await ctx.db.patch(existing._id, {
        ...after,
        label: catalogText(args.label, 60),
        description: catalogText(args.description, 180),
        workspace: args.workspace,
        updatedBy: adminId,
        updatedAt: now,
      });
      id = existing._id;
      await auditLog(ctx, adminId, {
        action: "PRICING_CHANGED",
        resource: "pointPricing",
        resourceId: existing._id,
        before,
        after,
        reason: `Updated pricing for ${args.service}`,
      });
    } else {
      id = await ctx.db.insert("pointPricing", {
        service: args.service,
        workspace: args.workspace,
        label: catalogText(args.label, 60),
        description: catalogText(args.description, 180),
        pointsCost: args.pointsCost,
        priceNgn: args.priceNgn,
        priceUsd: args.priceUsd,
        isActive: args.isActive,
        effectiveFrom: now,
        updatedBy: adminId,
        updatedAt: now,
      });
      await auditLog(ctx, adminId, {
        action: "PRICING_CREATED",
        resource: "pointPricing",
        resourceId: id,
        after: {
          service: args.service,
          pointsCost: args.pointsCost,
          priceNgn: args.priceNgn,
          priceUsd: args.priceUsd,
        },
      });
    }
    void admin;
    return { id };
  },
});

/** Public (authed) read of active pricing for cost display in user UIs. */
export const getPublicPricing = query({
  args: {},
  handler: async (ctx) => {
    const rows = await ctx.db.query("pointPricing").withIndex("by_service").collect();
    return rows.filter((r) => r.isActive);
  },
});

/**
 * Canonical service catalog. These are the platform's baseline billable
 * services (all executed natively — no external provider is involved).
 * Admins may override the cost of any entry; new services can be added too.
 */
const DEFAULT_PRICING: { service: string; workspace: string; pointsCost: number }[] = [
  { service: "shipment_create", workspace: "shipments", pointsCost: 100 },
  { service: "shipment_tracking_update", workspace: "shipments", pointsCost: 25 },
  { service: "shipment_event_add", workspace: "shipments", pointsCost: 15 },
  { service: "document_render", workspace: "documents", pointsCost: 40 },
  { service: "flight_pdf", workspace: "ticketing", pointsCost: 150 },
  { service: "hotel_pdf", workspace: "ticketing", pointsCost: 120 },
  { service: "commercial_invoice", workspace: "ticketing", pointsCost: 80 },
  { service: "customs_document", workspace: "ticketing", pointsCost: 100 },
  { service: "email_per_recipient", workspace: "services", pointsCost: 10 },
  { service: "image_render", workspace: "services", pointsCost: 50 },
  { service: "tenant_site_create", workspace: "business", pointsCost: 250 },
  { service: "marketplace_purchase_fee", workspace: "platform", pointsCost: 0 },
];

/**
 * Idempotently insert any missing catalog services with their baseline cost.
 * Existing rows are never modified, so an admin's overrides are preserved.
 */
export const seedDefaultPricing = mutation({
  args: {},
  handler: async (ctx) => {
    const { adminId } = await requireAdmin(ctx);
    const now = Date.now();
    let created = 0;
    for (const entry of DEFAULT_PRICING) {
      const existing = await ctx.db
        .query("pointPricing")
        .withIndex("by_service", (q) => q.eq("service", entry.service))
        .first();
      if (existing) continue;
      await ctx.db.insert("pointPricing", {
        service: entry.service,
        workspace: entry.workspace,
        pointsCost: entry.pointsCost,
        isActive: false,
        effectiveFrom: now,
        updatedBy: adminId,
        updatedAt: now,
      });
      created++;
    }
    if (created > 0) {
      await auditLog(ctx, adminId, {
        action: "PRICING_SEEDED",
        resource: "pointPricing",
        after: { created },
        reason: "Seeded default pricing catalog",
      });
    }
    return { created };
  },
});

/**
 * Apply multiple pricing changes atomically in a single mutation. Each entry
 * is validated server-side before anything is written, then one summary audit
 * record is produced for the whole batch.
 */
export const bulkUpsertPricing = mutation({
  args: {
    entries: v.array(
      v.object({
        service: v.string(),
        workspace: v.string(),
        pointsCost: v.number(),
        priceNgn: v.optional(v.number()),
        priceUsd: v.optional(v.number()),
        label: v.optional(v.string()),
        description: v.optional(v.string()),
        isActive: v.boolean(),
      }),
    ),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    if (args.entries.length === 0) return { updated: 0 };
    if (args.entries.length > 100) throw new Error("TOO_MANY_ENTRIES");

    // Validate everything up-front so a bad entry cannot leave a partial write.
    for (const entry of args.entries) {
      if (!entry.service.trim()) throw new Error("INVALID_SERVICE");
      if (!Number.isFinite(entry.pointsCost) || entry.pointsCost < 0) {
        throw new Error(`INVALID_COST:${entry.service}`);
      }
      if (entry.priceNgn !== undefined && (!Number.isFinite(entry.priceNgn) || entry.priceNgn < 0)) {
        throw new Error(`INVALID_NGN_PRICE:${entry.service}`);
      }
      if (entry.priceUsd !== undefined && (!Number.isFinite(entry.priceUsd) || entry.priceUsd < 0)) {
        throw new Error(`INVALID_USD_PRICE:${entry.service}`);
      }
    }

    const now = Date.now();
    let updated = 0;
    for (const entry of args.entries) {
      const service = entry.service.trim();
      const existing = await ctx.db
        .query("pointPricing")
        .withIndex("by_service", (q) => q.eq("service", service))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, {
          pointsCost: entry.pointsCost,
          priceNgn: entry.priceNgn,
          priceUsd: entry.priceUsd,
          label: catalogText(entry.label, 60),
          description: catalogText(entry.description, 180),
          isActive: entry.isActive,
          workspace: entry.workspace,
          updatedBy: adminId,
          updatedAt: now,
        });
      } else {
        await ctx.db.insert("pointPricing", {
          service,
          workspace: entry.workspace,
          label: catalogText(entry.label, 60),
          description: catalogText(entry.description, 180),
          pointsCost: entry.pointsCost,
          priceNgn: entry.priceNgn,
          priceUsd: entry.priceUsd,
          isActive: entry.isActive,
          effectiveFrom: now,
          updatedBy: adminId,
          updatedAt: now,
        });
      }
      updated++;
    }

    await auditLog(ctx, adminId, {
      action: "PRICING_BULK_UPDATED",
      resource: "pointPricing",
      after: { count: updated, services: args.entries.map((e) => e.service) },
      reason: `Bulk pricing update across ${updated} service(s)`,
    });
    return { updated };
  },
});

// ─── Admin Settings ─────────────────────────────────────────────────────────

const SECRET_KEY_FRAGMENTS = ["secret", "password", "token", "api_key", "apikey", "credential"];

export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("adminSettings").withIndex("by_key").collect();
    // Defense in depth: never return values for keys marked secret.
    return rows.map((r) =>
      SECRET_KEY_FRAGMENTS.some((f) => r.key.toLowerCase().includes(f))
        ? { ...r, value: "•••••••• (managed via environment)" }
        : r,
    );
  },
});

export const upsertSetting = mutation({
  args: { key: v.string(), value: v.any(), category: v.string() },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    if (SECRET_KEY_FRAGMENTS.some((f) => args.key.toLowerCase().includes(f))) {
      throw new Error("FORBIDDEN: secret-looking keys must be managed via environment configuration");
    }
    const now = Date.now();
    const existing = await ctx.db
      .query("adminSettings")
      .withIndex("by_key", (q) => q.eq("key", args.key))
      .first();
    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value, category: args.category, updatedBy: adminId, updatedAt: now });
    } else {
      await ctx.db.insert("adminSettings", {
        key: args.key,
        value: args.value,
        category: args.category,
        updatedBy: adminId,
        updatedAt: now,
      });
    }
    await auditLog(ctx, adminId, {
      action: "SETTING_CHANGED",
      resource: "adminSetting",
      resourceId: args.key,
      after: { key: args.key, category: args.category },
    });
    return { success: true };
  },
});

// ─── Vendor detail (admin view) ───────────────────────────────────────────

export const getVendorAdmin = query({
  args: { vendorId: v.id("vendors") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await ctx.db.get(args.vendorId);
  },
});

export const listVendorProducts = query({
  args: { vendorId: v.id("vendors") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    return await ctx.db
      .query("marketplaceProducts")
      .withIndex("by_vendor", (q) => q.eq("vendorId", args.vendorId))
      .order("desc")
      .collect();
  },
});

/** Enable/disable an approved product (marketplace visibility). */
export const adminToggleProductActive = mutation({
  args: { productId: v.id("marketplaceProducts"), isActive: v.boolean() },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const product = await ctx.db.get(args.productId);
    if (!product) throw new Error("PRODUCT_NOT_FOUND");
    if (product.isActive === args.isActive) throw new Error("DUPLICATE_OPERATION");
    await ctx.db.patch(args.productId, { isActive: args.isActive });
    await auditLog(ctx, adminId, {
      action: args.isActive ? "PRODUCT_ENABLED" : "PRODUCT_DISABLED",
      resource: "marketplaceProduct",
      resourceId: args.productId,
      before: { isActive: product.isActive },
      after: { isActive: args.isActive },
    });
    return { success: true };
  },
});

// ─── Disputes ───────────────────────────────────────────────────────────────

export const adminListDisputes = query({
  args: {
    status: v.optional(v.union(v.literal("open"), v.literal("under_review"), v.literal("resolved"), v.literal("closed"))),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const limit = Math.min(args.limit ?? 100, 100);
    if (args.status) {
      return await ctx.db
        .query("disputes")
        .withIndex("by_status", (q) => q.eq("status", args.status!))
        .order("desc")
        .take(limit);
    }
    return await ctx.db.query("disputes").order("desc").take(limit);
  },
});

export const getDispute = query({
  args: { id: v.id("disputes") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const dispute = await ctx.db.get(args.id);
    if (!dispute) return null;
    const order = await ctx.db.get(dispute.orderId);
    return { dispute, order };
  },
});

export const addDisputeNote = mutation({
  args: { disputeId: v.id("disputes"), text: v.string() },
  handler: async (ctx, args) => {
    const { adminId, admin } = await requireAdmin(ctx);
    const dispute = await ctx.db.get(args.disputeId);
    if (!dispute) throw new Error("DISPUTE_NOT_FOUND");
    const notes = [...(dispute.notes ?? []), { authorId: adminId, authorEmail: admin.email, text: args.text, createdAt: Date.now() }];
    await ctx.db.patch(args.disputeId, { notes, updatedAt: Date.now() });
    return { success: true };
  },
});

export const setDisputePriority = mutation({
  args: { disputeId: v.id("disputes"), priority: v.union(v.literal("low"), v.literal("medium"), v.literal("high"), v.literal("critical")) },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const dispute = await ctx.db.get(args.disputeId);
    if (!dispute) throw new Error("DISPUTE_NOT_FOUND");
    await ctx.db.patch(args.disputeId, { priority: args.priority, updatedAt: Date.now() });
    await auditLog(ctx, adminId, {
      action: "DISPUTE_PRIORITY_SET",
      resource: "dispute",
      resourceId: args.disputeId,
      before: { priority: dispute.priority },
      after: { priority: args.priority },
    });
    return { success: true };
  },
});

/**
 * Resolve a dispute. `refundBuyer` atomically refunds the buyer from the
 * vendor (points move vendor → buyer) inside one transaction. Idempotent via
 * a deterministic idempotency key derived from the dispute id.
 */
export const resolveDispute = mutation({
  args: {
    disputeId: v.id("disputes"),
    outcome: v.union(v.literal("refund_buyer"), v.literal("reject")),
    resolution: v.string(),
  },
  handler: async (ctx, args) => {
    const { adminId, admin } = await requireAdmin(ctx);
    const dispute = await ctx.db.get(args.disputeId);
    if (!dispute) throw new Error("DISPUTE_NOT_FOUND");
    if (dispute.status === "resolved" || dispute.status === "closed") {
      throw new Error("DUPLICATE_OPERATION: dispute already resolved");
    }
    const order = await ctx.db.get(dispute.orderId);
    if (!order) throw new Error("ORDER_NOT_FOUND");

    const now = Date.now();

    if (args.outcome === "refund_buyer") {
      const product = await ctx.db.get(order.productId);
      const vendorDoc = await ctx.db.get(order.vendorId);
      if (!vendorDoc) throw new Error("VENDOR_NOT_FOUND");

      const refundAmount = order.totalPoints;
      const idemKey = `dispute-refund-${args.disputeId}`;
      const dupe = await ctx.db
        .query("pointLedger")
        .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idemKey))
        .first();
      if (!dupe) {
        // Vendor → buyer refund (atomic: same mutation = same transaction)
        const vendorUser = await ctx.db.get(vendorDoc.userId);
        if (!vendorUser) throw new Error("VENDOR_NOT_FOUND");
        if ((vendorUser.pointsBalance ?? 0) < refundAmount) {
          throw new Error("INSUFFICIENT_POINTS: vendor balance cannot cover refund");
        }
        const vendorNewBal = (vendorUser.pointsBalance ?? 0) - refundAmount;
        await ctx.db.patch(vendorUser._id, { pointsBalance: vendorNewBal });
        await ctx.db.insert("pointLedger", {
          userId: vendorUser._id,
          amount: -refundAmount,
          balanceAfter: vendorNewBal,
          description: `Dispute refund: ${product?.name ?? "order"}`,
          type: "refund",
          referenceId: args.disputeId,
          idempotencyKey: idemKey,
          createdAt: now,
        });
        const buyer = await ctx.db.get(order.buyerId);
        if (!buyer) throw new Error("USER_NOT_FOUND");
        const buyerNewBal = (buyer.pointsBalance ?? 0) + refundAmount;
        await ctx.db.patch(buyer._id, { pointsBalance: buyerNewBal });
        await ctx.db.insert("pointLedger", {
          userId: buyer._id,
          amount: refundAmount,
          balanceAfter: buyerNewBal,
          description: `Dispute refund: ${product?.name ?? "order"}`,
          type: "refund",
          referenceId: args.disputeId,
          idempotencyKey: `${idemKey}-buyer`,
          createdAt: now,
        });
      }
      await ctx.db.patch(order._id, { status: "refunded" });
    } else {
      await ctx.db.patch(order._id, { status: "completed" });
    }

    await ctx.db.patch(args.disputeId, {
      status: "resolved",
      resolution: args.resolution,
      resolvedBy: adminId,
      resolvedAt: now,
      updatedAt: now,
    });

    await auditLog(ctx, adminId, {
      action: args.outcome === "refund_buyer" ? "ORDER_REFUNDED" : "DISPUTE_REJECTED",
      resource: "dispute",
      resourceId: args.disputeId,
      before: { status: dispute.status },
      after: { status: "resolved", outcome: args.outcome },
      reason: args.resolution,
    });

    void admin;
    return { success: true };
  },
});

// ─── Escrow / Orders ────────────────────────────────────────────────────────

/**
 * Release escrow for a pending/escrow order: moves held points from buyer
 * (already debited at purchase) to the vendor, marks order completed.
 * Idempotent: re-running on a completed order throws DUPLICATE_OPERATION.
 */
export const releaseEscrow = mutation({
  args: { orderId: v.id("marketplaceOrders"), reason: v.string() },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (order.status === "completed") throw new Error("DUPLICATE_OPERATION: already released");
    if (order.status === "refunded") throw new Error("INVALID_STATUS_TRANSITION: order refunded");

    const vendorDoc = await ctx.db.get(order.vendorId);
    if (!vendorDoc) throw new Error("VENDOR_NOT_FOUND");
    const vendorUser = await ctx.db.get(vendorDoc.userId);
    if (!vendorUser) throw new Error("VENDOR_NOT_FOUND");
    const product = await ctx.db.get(order.productId);

    const amount = order.totalPoints;
    const now = Date.now();

    const vendorNewBal = (vendorUser.pointsBalance ?? 0) + amount;
    await ctx.db.patch(vendorUser._id, { pointsBalance: vendorNewBal });
    await ctx.db.insert("pointLedger", {
      userId: vendorUser._id,
      amount,
      balanceAfter: vendorNewBal,
      description: `Escrow release: ${product?.name ?? "order"}`,
      type: "vendor_transaction",
      referenceId: order._id,
      createdAt: now,
    });

    await ctx.db.patch(order._id, { status: "completed" });
    await ctx.db.patch(vendorDoc._id, {
      earnings: vendorDoc.earnings + amount,
      totalSales: vendorDoc.totalSales + order.quantity,
    });

    await auditLog(ctx, adminId, {
      action: "ESCROW_RELEASED",
      resource: "marketplaceOrder",
      resourceId: order._id,
      before: { status: order.status },
      after: { status: "completed", amount },
      reason: args.reason,
    });

    await ctx.db.insert("notifications", {
      userId: order.buyerId,
      title: "Order completed",
      message: `Escrow released for ${product?.name ?? "your order"}`,
      type: "marketplace_order",
      isRead: false,
      link: "/orders",
      createdAt: now,
    });

    return { success: true };
  },
});

/** Refund an order to the buyer (points move vendor → buyer). */
export const refundOrder = mutation({
  args: { orderId: v.id("marketplaceOrders"), reason: v.string() },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const order = await ctx.db.get(args.orderId);
    if (!order) throw new Error("ORDER_NOT_FOUND");
    if (order.status === "refunded") throw new Error("DUPLICATE_OPERATION: already refunded");
    if (order.status === "completed") throw new Error("INVALID_STATUS_TRANSITION: escrow already released");

    const vendorDoc = await ctx.db.get(order.vendorId);
    if (!vendorDoc) throw new Error("VENDOR_NOT_FOUND");
    const vendorUser = await ctx.db.get(vendorDoc.userId);
    const buyer = await ctx.db.get(order.buyerId);
    if (!vendorUser || !buyer) throw new Error("USER_NOT_FOUND");

    const amount = order.totalPoints;
    const now = Date.now();
    const idemKey = `order-refund-${order._id}`;

    const dupe = await ctx.db
      .query("pointLedger")
      .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", idemKey))
      .first();
    if (!dupe) {
      if ((vendorUser.pointsBalance ?? 0) < amount) {
        throw new Error("INSUFFICIENT_POINTS: vendor balance cannot cover refund");
      }
      const vendorNewBal = (vendorUser.pointsBalance ?? 0) - amount;
      await ctx.db.patch(vendorUser._id, { pointsBalance: vendorNewBal });
      await ctx.db.insert("pointLedger", {
        userId: vendorUser._id,
        amount: -amount,
        balanceAfter: vendorNewBal,
        description: `Order refund: ${order.productId}`,
        type: "refund",
        referenceId: order._id,
        idempotencyKey: idemKey,
        createdAt: now,
      });
      const buyerNewBal = (buyer.pointsBalance ?? 0) + amount;
      await ctx.db.patch(buyer._id, { pointsBalance: buyerNewBal });
      await ctx.db.insert("pointLedger", {
        userId: buyer._id,
        amount,
        balanceAfter: buyerNewBal,
        description: `Order refund`,
        type: "refund",
        referenceId: order._id,
        idempotencyKey: `${idemKey}-buyer`,
        createdAt: now,
      });
    }

    await ctx.db.patch(order._id, { status: "refunded" });
    await auditLog(ctx, adminId, {
      action: "ORDER_REFUNDED",
      resource: "marketplaceOrder",
      resourceId: order._id,
      before: { status: order.status },
      after: { status: "refunded", amount },
      reason: args.reason,
    });
    return { success: true };
  },
});

// ─── Vendors (reason-required actions) ──────────────────────────────────────

export const reviewVendor = mutation({
  args: {
    vendorId: v.id("vendors"),
    action: v.union(v.literal("approve"), v.literal("reject"), v.literal("suspend"), v.literal("reactivate")),
    reason: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const vendor = await ctx.db.get(args.vendorId);
    if (!vendor) throw new Error("VENDOR_NOT_FOUND");

    const nextStatus =
      args.action === "approve" || args.action === "reactivate"
        ? ("approved" as const)
        : args.action === "reject"
          ? ("rejected" as const)
          : ("suspended" as const);
    if (vendor.status === nextStatus) throw new Error("DUPLICATE_OPERATION");

    if ((args.action === "reject" || args.action === "suspend") && (!args.reason || args.reason.trim().length < 5)) {
      throw new Error("Reason of at least 5 characters is required");
    }

    await ctx.db.patch(args.vendorId, {
      status: nextStatus,
      statusReason: args.reason,
    });
    await ctx.db.patch(vendor.userId, { role: nextStatus === "approved" ? "vendor" : "user" });

    await ctx.db.insert("notifications", {
      userId: vendor.userId,
      title: `Vendor application ${nextStatus}`,
      message: args.reason ? `Reason: ${args.reason}` : `Your vendor application was ${nextStatus}.`,
      type: "system",
      isRead: false,
      link: "/vendor",
      createdAt: Date.now(),
    });

    await auditLog(ctx, adminId, {
      action: `VENDOR_${args.action.toUpperCase()}`,
      resource: "vendor",
      resourceId: args.vendorId,
      before: { status: vendor.status },
      after: { status: nextStatus },
      reason: args.reason,
    });
    return { success: true };
  },
});

// ─── Users (terminate, role change) ─────────────────────────────────────────

export const terminateUser = mutation({
  args: { userId: v.id("users"), reason: v.string() },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("USER_NOT_FOUND");
    if (target.role === "admin") throw new Error("FORBIDDEN: cannot terminate another admin");
    if (target.isTerminated) throw new Error("DUPLICATE_OPERATION");

    await ctx.db.patch(args.userId, {
      isSuspended: true,
      isTerminated: true,
      terminatedAt: Date.now(),
      role: "user",
    });
    await auditLog(ctx, adminId, {
      action: "USER_TERMINATED",
      resource: "user",
      resourceId: args.userId,
      before: { isSuspended: target.isSuspended, isTerminated: false },
      after: { isTerminated: true },
      reason: args.reason,
    });
    return { success: true };
  },
});

export const changeUserRole = mutation({
  args: { userId: v.id("users"), role: v.union(v.literal("user"), v.literal("vendor"), v.literal("admin")) },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("USER_NOT_FOUND");
    if (target.role === "admin" && args.role !== "admin") {
      throw new Error("FORBIDDEN: cannot demote another admin");
    }
    if (target.role === args.role) throw new Error("DUPLICATE_OPERATION");

    await ctx.db.patch(args.userId, { role: args.role });
    await auditLog(ctx, adminId, {
      action: "USER_ROLE_CHANGED",
      resource: "user",
      resourceId: args.userId,
      before: { role: target.role },
      after: { role: args.role },
    });
    return { success: true };
  },
});

// ─── Tenants (unlock, moderation) ───────────────────────────────────────────

export const unlockTenant = mutation({
  args: { tenantId: v.id("tenantSites"), reason: v.string() },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant) throw new Error("TENANT_NOT_FOUND");
    if (tenant.isActive) throw new Error("DUPLICATE_OPERATION: tenant not locked");

    await ctx.db.patch(args.tenantId, { isActive: true });
    await auditLog(ctx, adminId, {
      action: "TENANT_UNLOCKED",
      resource: "tenantSite",
      resourceId: args.tenantId,
      before: { isActive: false },
      after: { isActive: true },
      reason: args.reason,
    });
    return { success: true };
  },
});

export const listModerationFlags = query({
  args: { tenantId: v.optional(v.id("tenantSites")), limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    if (args.tenantId) {
      return await ctx.db
        .query("moderationFlags")
        .withIndex("by_tenant", (q) => q.eq("tenantId", args.tenantId!))
        .order("desc")
        .take(args.limit ?? 50);
    }
    return await ctx.db.query("moderationFlags").withIndex("by_status").order("desc").take(args.limit ?? 100);
  },
});

export const createModerationFlag = mutation({
  args: {
    tenantId: v.id("tenantSites"),
    rule: v.string(),
    severity: v.union(v.literal("low"), v.literal("medium"), v.literal("high"), v.literal("critical")),
    details: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const tenant = await ctx.db.get(args.tenantId);
    if (!tenant) throw new Error("TENANT_NOT_FOUND");
    const now = Date.now();
    const id = await ctx.db.insert("moderationFlags", {
      tenantId: args.tenantId,
      rule: args.rule,
      severity: args.severity,
      status: "open",
      details: args.details,
      createdAt: now,
      updatedAt: now,
    });
    await auditLog(ctx, adminId, {
      action: "TENANT_FLAGGED",
      resource: "moderationFlag",
      resourceId: id,
      after: { rule: args.rule, severity: args.severity },
    });
    return { id };
  },
});

export const reviewModerationFlag = mutation({
  args: {
    flagId: v.id("moderationFlags"),
    status: v.union(v.literal("reviewing"), v.literal("resolved"), v.literal("dismissed")),
    reviewNotes: v.string(),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const flag = await ctx.db.get(args.flagId);
    if (!flag) throw new Error("FLAG_NOT_FOUND");
    await ctx.db.patch(args.flagId, {
      status: args.status,
      reviewNotes: args.reviewNotes,
      reviewedBy: adminId,
      reviewedAt: Date.now(),
      updatedAt: Date.now(),
    });
    await auditLog(ctx, adminId, {
      action: "FLAG_REVIEWED",
      resource: "moderationFlag",
      resourceId: args.flagId,
      before: { status: flag.status },
      after: { status: args.status },
      reason: args.reviewNotes,
    });
    return { success: true };
  },
});

// ─── Notification admin ─────────────────────────────────────────────────────

export const sendNotification = mutation({
  args: {
    userIds: v.optional(v.array(v.id("users"))),
    broadcast: v.optional(v.boolean()),
    title: v.string(),
    message: v.string(),
    type: v.string(),
    link: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    if (!args.broadcast && (!args.userIds || args.userIds.length === 0)) {
      throw new Error("Provide userIds or set broadcast");
    }
    let count = 0;
    if (args.broadcast) {
      const users = await ctx.db.query("users").collect();
      for (const u of users) {
        if (u.isTerminated) continue;
        await ctx.db.insert("notifications", {
          userId: u._id,
          title: args.title,
          message: args.message,
          type: args.type,
          isRead: false,
          link: args.link,
          createdAt: Date.now(),
        });
        count++;
      }
    } else {
      for (const uid of args.userIds!) {
        const u = await ctx.db.get(uid);
        if (!u) continue;
        await ctx.db.insert("notifications", {
          userId: uid,
          title: args.title,
          message: args.message,
          type: args.type,
          isRead: false,
          link: args.link,
          createdAt: Date.now(),
        });
        count++;
      }
    }
    await auditLog(ctx, adminId, {
      action: "NOTIFICATION_SENT",
      resource: "notification",
      after: { title: args.title, type: args.type, count, broadcast: !!args.broadcast },
    });
    return { count };
  },
});

export const adminListNotifications = query({
  args: { limit: v.optional(v.number()), type: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const rows = await ctx.db.query("notifications").order("desc").take(args.limit ?? 100);
    return args.type ? rows.filter((r) => r.type === args.type) : rows;
  },
});

// ─── Admin global search ────────────────────────────────────────────────────

export const globalSearch = query({
  args: { q: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const q = args.q.trim().toLowerCase();
    if (q.length < 2) return { users: [], shipments: [], vendors: [], tenants: [], orders: [] };

    const users = (await ctx.db.query("users").take(500))
      .filter((u) => u.email?.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q))
      .slice(0, 5)
      .map((u) => ({ id: u._id, label: u.name || u.email || u._id, sub: u.email ?? "", points: u.pointsBalance ?? 0 }));

    const shipments = (await ctx.db.query("shipments").withIndex("by_tracking").collect())
      .filter((s) => s.trackingNumber.toLowerCase().includes(q))
      .slice(0, 5)
      .map((s) => ({ id: s._id, label: s.trackingNumber, sub: s.status }));

    const vendors = (await ctx.db.query("vendors").take(500))
      .filter((v) => v.businessName.toLowerCase().includes(q))
      .slice(0, 5)
      .map((v) => ({ id: v._id, label: v.businessName, sub: v.status }));

    const tenants = (await ctx.db.query("tenantSites").take(500))
      .filter((t) => t.siteName.toLowerCase().includes(q) || t.subdomain.toLowerCase().includes(q))
      .slice(0, 5)
      .map((t) => ({ id: t._id, label: t.siteName, sub: t.subdomain }));

    const orders = (await ctx.db.query("marketplaceOrders").take(500))
      .filter((o) => o._id.toLowerCase().includes(q))
      .slice(0, 3)
      .map((o) => ({ id: o._id, label: o._id, sub: `${o.totalPoints} pts` }));

    return { users, shipments, vendors, tenants, orders };
  },
});

// ─── User profile (admin view) ──────────────────────────────────────────────

export const adminUserDetail = query({
  args: { userId: v.id("users") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    const ledger = await ctx.db
      .query("pointLedger")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(50);

    const shipments = await ctx.db
      .query("shipments")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(20);

    const documents = await ctx.db
      .query("documents")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(20);

    const orders = await ctx.db
      .query("marketplaceOrders")
      .withIndex("by_buyer", (q) => q.eq("buyerId", args.userId))
      .order("desc")
      .take(20);

    const notifications = await ctx.db
      .query("notifications")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(20);

    const audit = await ctx.db
      .query("auditLogs")
      .withIndex("by_actor", (q) => q.eq("actorId", args.userId))
      .order("desc")
      .take(20);

    // Security: active auth sessions (non-expired), newest first.
    const now = Date.now();
    const sessions = (await ctx.db
      .query("authSessions")
      .withIndex("userId", (q) => q.eq("userId", args.userId))
      .order("desc")
      .take(50))
      .filter((s) => s.expirationTime > now)
      .slice(0, 20)
      .map((s) => ({ _id: s._id, createdAt: s._creationTime, expiresAt: s.expirationTime }));

    // Referral activity in both directions.
    const referralsSent = await ctx.db
      .query("referrals")
      .withIndex("by_referrer", (q) => q.eq("referrerId", args.userId))
      .order("desc")
      .take(20);
    const referralsReceived = await ctx.db
      .query("referrals")
      .withIndex("by_referred", (q) => q.eq("referredUserId", args.userId))
      .order("desc")
      .take(20);

    const allLedger = await ctx.db
      .query("pointLedger")
      .withIndex("by_user", (q) => q.eq("userId", args.userId))
      .collect();
    const totalCredited = allLedger.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
    const totalDebited = allLedger.filter((l) => l.amount < 0).reduce((s, l) => s + Math.abs(l.amount), 0);

    return {
      user,
      wallet: { totalCredited, totalDebited },
      ledger,
      shipments,
      documents,
      orders,
      notifications,
      audit,
      sessions,
      referralsSent,
      referralsReceived,
    };
  },
});

// ─── Admin audit of own actions ─────────────────────────────────────────────

export const logAdminSession = mutation({
  args: { action: v.string() },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    await ctx.db.insert("adminSessions", {
      adminId,
      action: args.action,
      createdAt: Date.now(),
    });
    if (args.action === "ADMIN_LOGOUT") {
      await auditLog(ctx, adminId, { action: "ADMIN_LOGOUT", resource: "session" });
    }
    return { success: true };
  },
});

// ─── Counts for admin sidebar badges (single reactive query) ────────────────

export const adminBadgeCounts = query({
  args: {},
  handler: async (ctx) => {
    const admin = await getAdminOrNull(ctx);
    if (!admin) {
      return { pendingVendors: 0, pendingKyc: 0, openDisputes: 0, openFlags: 0 };
    }
    const vendors = await ctx.db.query("vendors").withIndex("by_status").take(1000);
    const kyc = await ctx.db.query("kycRecords").take(1000);
    const disputes = await ctx.db.query("disputes").withIndex("by_status").take(1000);
    const flags = await ctx.db.query("moderationFlags").withIndex("by_status").take(1000);
    return {
      pendingVendors: vendors.filter((v) => v.status === "pending").length,
      pendingKyc: kyc.filter((k) => k.status === "submitted" || k.status === "under_review" || k.status === "resubmission_required").length,
      openDisputes: disputes.filter((d) => d.status === "open" || d.status === "under_review").length,
      openFlags: flags.filter((f) => f.status === "open").length,
    };
  },
});

export const adminDashboard = query({
  args: {},
  handler: async (ctx) => {
    const admin = await getAdminOrNull(ctx);
    if (!admin) return null;
    const now = Date.now();
    const dayAgo = now - 24 * 60 * 60 * 1000;
    const weekAgo = now - 7 * 24 * 60 * 60 * 1000;

    const users = await ctx.db.query("users").take(1000);
    const ledger = await ctx.db.query("pointLedger").withIndex("by_createdAt").take(1000);
    const shipments = await ctx.db.query("shipments").withIndex("by_status").take(1000);
    const docs = await ctx.db.query("documents").take(1000);
    const vendors = await ctx.db.query("vendors").withIndex("by_status").take(1000);
    const tenants = await ctx.db.query("tenantSites").take(1000);
    const orders = await ctx.db.query("marketplaceOrders").take(1000);
    const disputes = await ctx.db.query("disputes").withIndex("by_status").take(1000);
    const kyc = await ctx.db.query("kycRecords").take(1000);
    const flags = await ctx.db.query("moderationFlags").withIndex("by_status").take(1000);

    const minted = ledger.filter((l) => l.amount > 0);
    const burned = ledger.filter((l) => l.amount < 0);

    return {
      users: {
        total: users.length,
        active: users.filter((u) => !u.isSuspended && !u.isTerminated).length,
        suspended: users.filter((u) => u.isSuspended).length,
        terminated: users.filter((u) => u.isTerminated).length,
        admins: users.filter((u) => u.role === "admin").length,
      },
      points: {
        minted: minted.reduce((s, l) => s + l.amount, 0),
        burned: burned.reduce((s, l) => s + Math.abs(l.amount), 0),
        velocity24h:
          minted.filter((l) => l.createdAt > dayAgo).reduce((s, l) => s + l.amount, 0) -
          burned.filter((l) => l.createdAt > dayAgo).reduce((s, l) => s + Math.abs(l.amount), 0),
        mintedCount24h: minted.filter((l) => l.createdAt > dayAgo).length,
      },
      vendors: {
        total: vendors.length,
        pending: vendors.filter((v) => v.status === "pending").length,
        approved: vendors.filter((v) => v.status === "approved").length,
        suspended: vendors.filter((v) => v.status === "suspended").length,
      },
      tenants: {
        total: tenants.length,
        active: tenants.filter((t) => t.isActive).length,
        locked: tenants.filter((t) => !t.isActive).length,
      },
      shipments: {
        total: shipments.length,
        active: shipments.filter((s) => !["delivered", "cancelled", "failed"].includes(s.status)).length,
        delivered: shipments.filter((s) => s.status === "delivered").length,
      },
      documents: { total: docs.length, last24h: docs.filter((d) => d.createdAt > dayAgo).length },
      marketplace: {
        orders: orders.length,
        orders24h: orders.filter((o) => o.createdAt > dayAgo).length,
        escrowPending: orders.filter((o) => o.status === "pending" || o.status === "escrow").length,
      },
      disputes: {
        open: disputes.filter((d) => d.status === "open").length,
        underReview: disputes.filter((d) => d.status === "under_review").length,
        resolved: disputes.filter((d) => d.status === "resolved").length,
      },
      kyc: {
        pending: kyc.filter((k) => k.status === "submitted").length,
        underReview: kyc.filter((k) => k.status === "under_review").length,
        verified: kyc.filter((k) => k.status === "approved").length,
        rejected: kyc.filter((k) => k.status === "rejected").length,
        resubmissionRequired: kyc.filter((k) => k.status === "resubmission_required").length,
      },
      moderation: { openFlags: flags.filter((f) => f.status === "open").length },
      activity: {
        newUsers7d: users.filter((u) => (u.createdAt ?? 0) > weekAgo).length,
        ledger7d: ledger.filter((l) => l.createdAt > weekAgo).length,
      },
    };
  },
});

/** Move a dispute into review before resolution. Audited. */
export const markDisputeUnderReview = mutation({
  args: { disputeId: v.id("disputes") },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const dispute = await ctx.db.get(args.disputeId);
    if (!dispute) throw new Error("DISPUTE_NOT_FOUND");
    if (dispute.status !== "open") throw new Error("INVALID_STATUS_TRANSITION");
    await ctx.db.patch(args.disputeId, { status: "under_review", updatedAt: Date.now() });
    await auditLog(ctx, adminId, {
      action: "DISPUTE_UNDER_REVIEW",
      resource: "dispute",
      resourceId: args.disputeId,
      before: { status: dispute.status },
      after: { status: "under_review" },
    });
    return { success: true };
  },
});

/**
 * Server-side time-series aggregation for /admin/analytics.
 * Returns daily buckets over the trailing `days` window plus totals.
 */
export const getAnalyticsRange = query({
  args: { days: v.union(v.literal(1), v.literal(7), v.literal(30), v.literal(90)) },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const now = Date.now();
    const start = now - args.days * 24 * 60 * 60 * 1000;

    const ledger = await ctx.db.query("pointLedger").withIndex("by_createdAt").collect();
    const users = await ctx.db.query("users").collect();
    const shipments = await ctx.db.query("shipments").withIndex("by_createdAt").collect();
    const docs = await ctx.db.query("documents").collect();
    const orders = await ctx.db.query("marketplaceOrders").collect();
    const campaigns = await ctx.db.query("emailCampaigns").collect();
    const notifications = await ctx.db.query("notifications").collect();
    const tenants = await ctx.db.query("tenantSites").collect();

    const bucketCount = args.days === 1 ? 24 : args.days;
    const buckets: {
      label: string;
      minted: number;
      burned: number;
      users: number;
      shipments: number;
      documents: number;
      orders: number;
    }[] = [];
    const bucketMs = ((now - start) / bucketCount) | 0;
    for (let i = 0; i < bucketCount; i++) {
      const from = start + i * bucketMs;
      const to = from + bucketMs;
      const inBucket = (t: number) => t >= from && t < to;
      const date = new Date(from);
      buckets.push({
        label:
          args.days === 1
            ? `${String(date.getHours()).padStart(2, "0")}:00`
            : `${date.getMonth() + 1}/${date.getDate()}`,
        minted: ledger.filter((l) => l.amount > 0 && inBucket(l.createdAt)).reduce((s, l) => s + l.amount, 0),
        burned: ledger.filter((l) => l.amount < 0 && inBucket(l.createdAt)).reduce((s, l) => s + Math.abs(l.amount), 0),
        users: users.filter((u) => (u.createdAt ?? 0) >= from && (u.createdAt ?? 0) < to).length,
        shipments: shipments.filter((s) => s.createdAt >= from && s.createdAt < to).length,
        documents: docs.filter((d) => d.createdAt >= from && d.createdAt < to).length,
        orders: orders.filter((o) => o.createdAt >= from && o.createdAt < to).length,
      });
    }

    return {
      buckets,
      totals: {
        newUsers: users.filter((u) => (u.createdAt ?? 0) >= start).length,
        shipments: shipments.filter((s) => s.createdAt >= start).length,
        documents: docs.filter((d) => d.createdAt >= start).length,
        orders: orders.filter((o) => o.createdAt >= start).length,
        campaigns: campaigns.filter((c) => c.createdAt >= start).length,
        notifications: notifications.filter((n) => n.createdAt >= start).length,
        activeTenants: tenants.filter((t) => t.isActive).length,
        minted: ledger.filter((l) => l.amount > 0 && l.createdAt >= start).reduce((s, l) => s + l.amount, 0),
        burned: ledger.filter((l) => l.amount < 0 && l.createdAt >= start).reduce((s, l) => s + Math.abs(l.amount), 0),
      },
    };
  },
});
