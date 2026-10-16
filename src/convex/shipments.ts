import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

function generateTrackingNumber(): string {
  const prefix = "CLD";
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = prefix;
  for (let i = 0; i < 10; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

export const create = mutation({
  args: {
    senderName: v.string(),
    senderPhone: v.string(),
    senderEmail: v.string(),
    senderAddress: v.string(),
    senderCity: v.string(),
    senderState: v.string(),
    senderCountry: v.string(),
    senderPostalCode: v.string(),
    recipientName: v.string(),
    recipientPhone: v.string(),
    recipientEmail: v.string(),
    recipientAddress: v.string(),
    recipientCity: v.string(),
    recipientState: v.string(),
    recipientCountry: v.string(),
    recipientPostalCode: v.string(),
    packageDescription: v.string(),
    weight: v.number(),
    dimensions: v.optional(v.string()),
    serviceType: v.string(),
    estimatedDelivery: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const user = await ctx.db.get(userId);
    if (!user) throw new Error("User not found");

    const balance = user.pointsBalance ?? 0;
    if (balance < 100) {
      throw new Error("Insufficient points. Shipment creation costs 100 points.");
    }

    const newBalance = balance - 100;
    await ctx.db.patch(userId, { pointsBalance: newBalance });
    await ctx.db.insert("pointLedger", {
      userId,
      amount: -100,
      balanceAfter: newBalance,
      description: "Shipment creation",
      type: "shipment_creation",
      createdAt: Date.now(),
    });

    const trackingNumber = generateTrackingNumber();
    const now = Date.now();

    const shipmentId = await ctx.db.insert("shipments", {
      userId,
      trackingNumber,
      status: "pending",
      ...args,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("shipmentEvents", {
      shipmentId,
      status: "pending",
      description: "Shipment created and awaiting pickup",
      timestamp: now,
    });

    await ctx.db.insert("notifications", {
      userId,
      title: "Shipment created",
      message: `Tracking number: ${trackingNumber}`,
      type: "shipment_update",
      isRead: false,
      link: `/shipments/${shipmentId}`,
      createdAt: now,
    });

    return { shipmentId, trackingNumber };
  },
});

export const list = query({
  args: { status: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const results = await ctx.db
      .query("shipments")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
    if (args.status) {
      return results.filter((s) => s.status === args.status);
    }
    return results;
  },
});

export const get = query({
  args: { id: v.id("shipments") },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    const shipment = await ctx.db.get(args.id);
    if (!shipment) return null;
    if (shipment.userId !== userId) return null;
    return shipment;
  },
});

export const publicTracking = query({
  args: { trackingNumber: v.string() },
  handler: async (ctx, args) => {
    const shipment = await ctx.db
      .query("shipments")
      .withIndex("by_tracking", (q) =>
        q.eq("trackingNumber", args.trackingNumber),
      )
      .first();
    if (!shipment) return null;

    const events = await ctx.db
      .query("shipmentEvents")
      .withIndex("by_shipment", (q) => q.eq("shipmentId", shipment._id))
      .order("desc")
      .collect();

    return {
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
      serviceType: shipment.serviceType,
      estimatedDelivery: shipment.estimatedDelivery,
      createdAt: shipment.createdAt,
      updatedAt: shipment.updatedAt,
      recipientCity: shipment.recipientCity,
      recipientCountry: shipment.recipientCountry,
      events,
    };
  },
});

export const updateStatus = mutation({
  args: {
    shipmentId: v.id("shipments"),
    status: v.union(
      v.literal("pending"),
      v.literal("picked_up"),
      v.literal("in_transit"),
      v.literal("out_for_delivery"),
      v.literal("delivered"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    location: v.optional(v.string()),
    description: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const user = await ctx.db.get(userId);
    if (user?.role !== "admin" || user.isSuspended) {
      throw new Error("FORBIDDEN: only an active administrator may update carrier shipment status");
    }

    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) throw new Error("Shipment not found");
    if (!args.description.trim() || args.description.trim().length > 1000) {
      throw new Error("Status description must be between 1 and 1,000 characters");
    }
    if (args.location && args.location.trim().length > 200) {
      throw new Error("Location must be 200 characters or fewer");
    }

    const now = Date.now();
    await ctx.db.patch(args.shipmentId, {
      status: args.status,
      updatedAt: now,
    });

    await ctx.db.insert("shipmentEvents", {
      shipmentId: args.shipmentId,
      status: args.status,
      location: args.location,
      description: args.description.trim(),
      timestamp: now,
    });

    await ctx.db.insert("notifications", {
      userId: shipment.userId,
      title: "Shipment status update",
      message: `${args.description.trim()}${args.location ? ` at ${args.location.trim()}` : ""}`,
      type: "shipment_update",
      isRead: false,
      link: `/shipments/${args.shipmentId}`,
      createdAt: now,
    });

    return { success: true };
  },
});

export const adminList = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return [];
    const user = await ctx.db.get(userId);
    if (user?.role !== "admin") return [];
    return await ctx.db.query("shipments").order("desc").take(args.limit ?? 50);
  },
});
