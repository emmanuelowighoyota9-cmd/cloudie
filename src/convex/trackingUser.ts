import { getAuthUserId } from "@convex-dev/auth/server";
import { query, mutation } from "./_generated/server";
import type { QueryCtx, MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { createShipmentCore } from "./tracking";

const SHIPMENT_COST_POINTS = 100;

async function requireUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("UNAUTHORIZED");
  return userId;
}

// ─── User queries ────────────────────────────────────────────────────────────

/** Shipments where the signed-in user is sender or recipient (own view). */
export const myShipments = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const sent = await ctx.db
      .query("trackingShipments")
      .withIndex("by_sender", (q) => q.eq("senderId", userId))
      .order("desc")
      .take(100);
    const received = await ctx.db
      .query("trackingShipments")
      .withIndex("by_recipient", (q) => q.eq("recipientId", userId))
      .order("desc")
      .take(100);
    // Merge (dedupe by id).
    const seen = new Set(sent.map((s) => s._id));
    const merged = [...sent, ...received.filter((s) => !seen.has(s._id))];
    return merged
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, 100)
      .map((s) => ({
        _id: s._id,
        trackingNumber: s.trackingNumber,
        status: s.status,
        progress: s.progress,
        serviceTypeName: s.serviceTypeName,
        senderName: s.senderName,
        recipientName: s.recipientName,
        recipientCity: s.recipientCity,
        recipientCountry: s.recipientCountry,
        estimatedDelivery: s.estimatedDelivery,
        deliveredAt: s.deliveredAt,
        createdAt: s.createdAt,
        role: s.senderId === userId ? ("sender" as const) : ("recipient" as const),
      }));
  },
});

/** Detail for one own shipment (sender or recipient only) + public timeline. */
export const myShipmentDetail = query({
  args: { id: v.id("trackingShipments") },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const s = await ctx.db.get(args.id);
    if (!s) return null;
    if (s.senderId !== userId && s.recipientId !== userId) return null; // IDOR guard

    const [events, origin, destination, current] = await Promise.all([
      ctx.db
        .query("trackingEvents")
        .withIndex("by_shipment", (q) => q.eq("shipmentId", args.id))
        .order("desc")
        .take(100),
      s.originLocationId ? ctx.db.get(s.originLocationId) : null,
      s.destinationLocationId ? ctx.db.get(s.destinationLocationId) : null,
      s.currentLocationId ? ctx.db.get(s.currentLocationId) : null,
    ]);
    return {
      shipment: {
        _id: s._id,
        trackingNumber: s.trackingNumber,
        status: s.status,
        progress: s.progress,
        serviceTypeName: s.serviceTypeName,
        senderName: s.senderName,
        senderCity: s.senderCity,
        senderCountry: s.senderCountry,
        recipientName: s.recipientName,
        recipientCity: s.recipientCity,
        recipientCountry: s.recipientCountry,
        packageDescription: s.packageDescription,
        totalWeight: s.totalWeight,
        weightUnit: s.weightUnit,
        dimensions: s.dimensions,
        estimatedDelivery: s.estimatedDelivery,
        actualDelivery: s.actualDelivery,
        shippedAt: s.shippedAt,
        createdAt: s.createdAt,
        role: s.senderId === userId ? ("sender" as const) : ("recipient" as const),
      },
      route: {
        origin: origin
          ? { name: origin.name, city: origin.city, country: origin.country }
          : null,
        destination: destination
          ? { name: destination.name, city: destination.city, country: destination.country }
          : null,
        current: current
          ? { name: current.name, city: current.city, country: current.country }
          : null,
      },
      events: events
        .filter((e) => e.isPublic)
        .map((e) => ({
          _id: e._id,
          status: e.status,
          title: e.title,
          description: e.description,
          locationLabel: e.locationLabel ?? null,
          eventTimestamp: e.eventTimestamp,
        })),
    };
  },
});

// ─── User mutation: points-billed tracked shipment ───────────────────────────

const partyValidator = v.object({
  name: v.string(),
  phone: v.string(),
  email: v.string(),
  address: v.string(),
  city: v.string(),
  state: v.string(),
  country: v.string(),
  postalCode: v.string(),
});

export const createMyShipment = mutation({
  args: {
    sender: partyValidator,
    recipient: partyValidator,
    packageDescription: v.string(),
    totalWeight: v.number(),
    weightUnit: v.union(v.literal("kg"), v.literal("lb")),
    dimensions: v.optional(v.string()),
    declaredValue: v.optional(v.number()),
    currency: v.optional(v.string()),
    serviceTypeId: v.optional(v.id("trackingServiceTypes")),
    referenceNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    originLocationId: v.optional(v.id("trackingLocations")),
    destinationLocationId: v.optional(v.id("trackingLocations")),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("UNAUTHORIZED");
    if (user.isTerminated) throw new Error("FORBIDDEN: account terminated");

    // Guarded balance check + debit + immutable ledger row.
    const balance = user.pointsBalance ?? 0;
    if (balance < SHIPMENT_COST_POINTS) {
      throw new Error(
        `Insufficient points: creating a shipment costs ${SHIPMENT_COST_POINTS} points.`,
      );
    }
    const newBalance = balance - SHIPMENT_COST_POINTS;
    await ctx.db.patch(userId, { pointsBalance: newBalance });
    await ctx.db.insert("pointLedger", {
      userId,
      amount: -SHIPMENT_COST_POINTS,
      balanceAfter: newBalance,
      description: "Shipment creation",
      type: "shipment_creation",
      createdAt: Date.now(),
    });

    // Create the tracked shipment via the shared engine core (tracking number,
    // initial event, packages, route, ETA, audit). Notify via the engine's
    // notification flow happens on status changes; creation gets its own.
    const { shipmentId, trackingNumber } = await createShipmentCore(ctx, userId, {
      ...args,
      senderId: userId,
      recipientId: undefined,
    });

    await ctx.db.insert("notifications", {
      userId,
      title: "Shipment created",
      message: `Tracking number: ${trackingNumber}`,
      type: "shipment",
      isRead: false,
      link: `/tracking/${trackingNumber}`,
      createdAt: Date.now(),
    });

    return { shipmentId, trackingNumber };
  },
});
