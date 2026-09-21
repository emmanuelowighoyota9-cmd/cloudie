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

    const [events, origin, destination, current, routeStops] = await Promise.all([
      ctx.db
        .query("trackingEvents")
        .withIndex("by_shipment", (q) => q.eq("shipmentId", args.id))
        .order("desc")
        .take(100),
      s.originLocationId ? ctx.db.get(s.originLocationId) : null,
      s.destinationLocationId ? ctx.db.get(s.destinationLocationId) : null,
      s.currentLocationId ? ctx.db.get(s.currentLocationId) : null,
      ctx.db
        .query("trackingRouteStops")
        .withIndex("by_shipment", (q) => q.eq("shipmentId", args.id))
        .order("asc")
        .take(50),
    ]);
    const stopLocations = await Promise.all(
      routeStops.map((r) => (r.locationId ? ctx.db.get(r.locationId) : null)),
    );
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
        stops: routeStops.map((r, i) => ({
          label: r.label,
          city: stopLocations[i]?.city ?? null,
          country: stopLocations[i]?.country ?? null,
          sequence: r.sequence,
          status: r.status,
          arrivalAt: r.arrivalAt,
          departureAt: r.departureAt,
        })),
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

// ─── Points costs for customer shipment operations ──────────────────────────
const UPDATE_COST_POINTS = 25;
const EVENT_COST_POINTS = 15;

/**
 * Customer-initiated shipment update — edits mutable fields and deducts points.
 * Only the sender may update shipment metadata.
 */
export const customerUpdateShipment = mutation({
  args: {
    shipmentId: v.id("trackingShipments"),
    packageDescription: v.optional(v.string()),
    totalWeight: v.optional(v.number()),
    weightUnit: v.optional(v.union(v.literal("kg"), v.literal("lb"))),
    dimensions: v.optional(v.string()),
    declaredValue: v.optional(v.number()),
    currency: v.optional(v.string()),
    referenceNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    recipientName: v.optional(v.string()),
    recipientPhone: v.optional(v.string()),
    recipientEmail: v.optional(v.string()),
    recipientAddress: v.optional(v.string()),
    recipientCity: v.optional(v.string()),
    recipientState: v.optional(v.string()),
    recipientCountry: v.optional(v.string()),
    recipientPostalCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("UNAUTHORIZED");
    if (user.isTerminated) throw new Error("FORBIDDEN: account terminated");

    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) throw new Error("Shipment not found");
    if (shipment.senderId !== userId) throw new Error("Only the sender can update shipment details");
    if (shipment.status === "DELIVERED") throw new Error("Cannot update a delivered shipment");
    if (shipment.status === "CANCELLED") throw new Error("Cannot update a cancelled shipment");

    // Points check + debit
    const balance = user.pointsBalance ?? 0;
    if (balance < UPDATE_COST_POINTS) {
      throw new Error(
        `Insufficient points: updating a shipment costs ${UPDATE_COST_POINTS} points. You have ${balance}.`,
      );
    }
    const newBalance = balance - UPDATE_COST_POINTS;
    await ctx.db.patch(userId, { pointsBalance: newBalance });
    await ctx.db.insert("pointLedger", {
      userId,
      amount: -UPDATE_COST_POINTS,
      balanceAfter: newBalance,
      description: "Shipment update",
      type: "tracking_update",
      createdAt: Date.now(),
    });

    // Build patch — only include fields the customer changed
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    const changed: string[] = [];

    if (args.packageDescription !== undefined && args.packageDescription !== shipment.packageDescription) {
      patch.packageDescription = args.packageDescription;
      changed.push("package description");
    }
    if (args.totalWeight !== undefined && args.totalWeight !== shipment.totalWeight) {
      patch.totalWeight = args.totalWeight;
      changed.push("weight");
    }
    if (args.weightUnit !== undefined && args.weightUnit !== shipment.weightUnit) {
      patch.weightUnit = args.weightUnit;
    }
    if (args.dimensions !== undefined && args.dimensions !== shipment.dimensions) {
      patch.dimensions = args.dimensions;
      changed.push("dimensions");
    }
    if (args.declaredValue !== undefined && args.declaredValue !== shipment.declaredValue) {
      patch.declaredValue = args.declaredValue;
      changed.push("declared value");
    }
    if (args.currency !== undefined && args.currency !== shipment.currency) {
      patch.currency = args.currency;
    }
    if (args.referenceNumber !== undefined && args.referenceNumber !== shipment.referenceNumber) {
      patch.referenceNumber = args.referenceNumber;
      changed.push("reference number");
    }
    if (args.notes !== undefined && args.notes !== shipment.notes) {
      patch.notes = args.notes;
      changed.push("notes");
    }
    if (args.recipientName !== undefined) patch.recipientName = args.recipientName;
    if (args.recipientPhone !== undefined) patch.recipientPhone = args.recipientPhone;
    if (args.recipientEmail !== undefined) patch.recipientEmail = args.recipientEmail;
    if (args.recipientAddress !== undefined) patch.recipientAddress = args.recipientAddress;
    if (args.recipientCity !== undefined) patch.recipientCity = args.recipientCity;
    if (args.recipientState !== undefined) patch.recipientState = args.recipientState;
    if (args.recipientCountry !== undefined) patch.recipientCountry = args.recipientCountry;
    if (args.recipientPostalCode !== undefined) patch.recipientPostalCode = args.recipientPostalCode;

    if (changed.length === 0 && Object.keys(patch).length <= 1) {
      // Nothing changed — still charge the point cost for the action
    }

    await ctx.db.patch(args.shipmentId, patch);

    // Create a tracking event so the update is visible in the timeline
    const changeSummary = changed.length > 0 ? changed.join(", ") : "shipment details";
    await ctx.db.insert("trackingEvents", {
      shipmentId: args.shipmentId,
      status: shipment.status,
      title: "Shipment updated by sender",
      description: `Updated: ${changeSummary}. ${UPDATE_COST_POINTS} points charged.`,
      eventTimestamp: Date.now(),
      isPublic: true,
      createdBy: userId,
      createdAt: Date.now(),
    });

    // Notify
    await ctx.db.insert("notifications", {
      userId,
      title: "Shipment updated",
      message: `${shipment.trackingNumber} — ${changeSummary}`,
      type: "shipment",
      isRead: false,
      link: `/shipments/${args.shipmentId}/updates`,
      createdAt: Date.now(),
    });

    return {
      success: true,
      pointsCost: UPDATE_COST_POINTS,
      newBalance,
      changes: changed,
    };
  },
});

/**
 * Customer adds a tracking event / note to their shipment.
 * Deducts points and creates a public event on the timeline.
 */
export const customerAddShipmentEvent = mutation({
  args: {
    shipmentId: v.id("trackingShipments"),
    title: v.string(),
    description: v.string(),
    isPublic: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    if (!user) throw new Error("UNAUTHORIZED");
    if (user.isTerminated) throw new Error("FORBIDDEN: account terminated");

    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) throw new Error("Shipment not found");
    if (shipment.senderId !== userId && shipment.recipientId !== userId) {
      throw new Error("Only shipment participants can add events");
    }
    if (shipment.status === "DELIVERED") throw new Error("Cannot add events to a delivered shipment");
    if (shipment.status === "CANCELLED") throw new Error("Cannot add events to a cancelled shipment");

    // Points check + debit
    const balance = user.pointsBalance ?? 0;
    if (balance < EVENT_COST_POINTS) {
      throw new Error(
        `Insufficient points: adding a shipment event costs ${EVENT_COST_POINTS} points. You have ${balance}.`,
      );
    }
    const newBalance = balance - EVENT_COST_POINTS;
    await ctx.db.patch(userId, { pointsBalance: newBalance });
    await ctx.db.insert("pointLedger", {
      userId,
      amount: -EVENT_COST_POINTS,
      balanceAfter: newBalance,
      description: "Shipment event added",
      type: "tracking_update",
      createdAt: Date.now(),
    });

    const userDoc = await ctx.db.get(userId);
    const actorName = userDoc?.name || userDoc?.email || "User";

    await ctx.db.insert("trackingEvents", {
      shipmentId: args.shipmentId,
      status: shipment.status,
      title: args.title,
      description: `${actorName}: ${args.description}`,
      eventTimestamp: Date.now(),
      isPublic: args.isPublic ?? true,
      createdBy: userId,
      createdAt: Date.now(),
    });

    await ctx.db.insert("notifications", {
      userId,
      title: "Event added to shipment",
      message: `${shipment.trackingNumber} — ${args.title}`,
      type: "shipment",
      isRead: false,
      link: `/shipments/${args.shipmentId}/updates`,
      createdAt: Date.now(),
    });

    return {
      success: true,
      pointsCost: EVENT_COST_POINTS,
      newBalance,
    };
  },
});

/** Returns the current user's points balance for real-time display. */
export const myPointsBalance = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const user = await ctx.db.get(userId);
    return { balance: user?.pointsBalance ?? 0 };
  },
});
