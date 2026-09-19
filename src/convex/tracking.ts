import { getAuthUserId } from "@convex-dev/auth/server";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import type { TrackingStatus } from "./schema";
import {
  calculateEta,
  canTransition,
  generateTrackingNumber,
  progressForStatus,
} from "./trackingEngine";
import { requireAdmin } from "./adminApi";

// ─── Shared helpers ──────────────────────────────────────────────────────────

async function requireUser(
  ctx: MutationCtx,
): Promise<{ userId: Id<"users">; user: Doc<"users"> }> {
  const userId = await getAuthUserId(ctx);
  if (!userId) throw new Error("UNAUTHORIZED");
  const user = await ctx.db.get(userId);
  if (!user) throw new Error("UNAUTHORIZED");
  if (user.isTerminated) throw new Error("FORBIDDEN: account terminated");
  return { userId, user };
}

async function uniqueTrackingNumber(
  ctx: MutationCtx,
  now: number,
): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const tn = generateTrackingNumber("TRK", now);
    const existing = await ctx.db
      .query("trackingShipments")
      .withIndex("by_tracking", (q) => q.eq("trackingNumber", tn))
      .unique();
    if (!existing) return tn;
  }
  throw new Error("Could not generate a unique tracking number — try again");
}

async function resolveServiceType(
  ctx: MutationCtx,
  serviceTypeId?: Id<"trackingServiceTypes">,
): Promise<Doc<"trackingServiceTypes">> {
  if (serviceTypeId) {
    const st = await ctx.db.get(serviceTypeId);
    if (st) return st;
  }
  const fallback = await ctx.db
    .query("trackingServiceTypes")
    .order("asc")
    .first();
  if (!fallback) throw new Error("No service types configured");
  return fallback;
}

async function audit(
  ctx: MutationCtx,
  actorId: Id<"users"> | undefined,
  action: string,
  resource: string,
  resourceId: string | undefined,
  before: unknown,
  after: unknown,
): Promise<void> {
  await ctx.db.insert("auditLogs", {
    actorId,
    action,
    resource,
    resourceId,
    before,
    after,
    createdAt: Date.now(),
  });
}

async function notifyShipment(
  ctx: MutationCtx,
  userId: Id<"users"> | undefined,
  trackingNumber: string,
  title: string,
  message: string,
): Promise<void> {
  if (!userId) return;
  await ctx.db.insert("notifications", {
    userId,
    title,
    message,
    type: "shipment",
    isRead: false,
    link: `/tracking/${trackingNumber}`,
    createdAt: Date.now(),
  });
}

async function notifyStatusChange(
  ctx: MutationCtx,
  shipment: Doc<"trackingShipments">,
  status: TrackingStatus,
): Promise<void> {
  const tn = shipment.trackingNumber;
  const messages: Partial<
    Record<TrackingStatus, { title: string; message: string }>
  > = {
    BOOKED: {
      title: "Shipment booked",
      message: `Your shipment ${tn} has been booked and is being prepared.`,
    },
    PICKED_UP: {
      title: "Shipment picked up",
      message: `Your shipment ${tn} has been picked up and is on its way.`,
    },
    IN_TRANSIT: {
      title: "Shipment in transit",
      message: `Your shipment ${tn} is currently in transit.`,
    },
    OUT_FOR_DELIVERY: {
      title: "Out for delivery",
      message: `Your shipment ${tn} is out for delivery.`,
    },
    DELIVERED: {
      title: "Shipment delivered",
      message: `Your shipment ${tn} has been delivered.`,
    },
    EXCEPTION: {
      title: "Shipment exception",
      message: `Your shipment ${tn} has encountered an exception. Contact support for details.`,
    },
    ON_HOLD: {
      title: "Shipment on hold",
      message: `Your shipment ${tn} is currently on hold.`,
    },
  };
  const payload = messages[status];
  if (!payload) return;
  await notifyShipment(ctx, shipment.senderId, tn, payload.title, payload.message);
  if (shipment.recipientId !== shipment.senderId) {
    await notifyShipment(ctx, shipment.recipientId, tn, payload.title, payload.message);
  }
}

export const STATUS_EVENT_TITLES: Record<TrackingStatus, string> = {
  CREATED: "Shipment created",
  BOOKED: "Booking confirmed",
  PICKED_UP: "Package picked up",
  PROCESSING: "Processing at origin",
  AT_ORIGIN_FACILITY: "Arrived at origin facility",
  DEPARTED_ORIGIN: "Departed origin facility",
  IN_TRANSIT: "In transit",
  ARRIVED_DESTINATION_COUNTRY: "Arrived in destination country",
  CUSTOMS_CLEARANCE: "Customs clearance in progress",
  CUSTOMS_CLEARED: "Customs cleared",
  AT_DESTINATION_FACILITY: "Arrived at destination facility",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERY_ATTEMPTED: "Delivery attempted",
  DELIVERED: "Delivered",
  EXCEPTION: "Shipment exception",
  ON_HOLD: "Shipment on hold",
  CANCELLED: "Shipment cancelled",
  RETURNED: "Return initiated",
};

/** Applies a validated status change: shipment patch + event + ETA/progress + audit. */
export async function applyStatusChange(
  ctx: MutationCtx,
  actorId: Id<"users">,
  shipment: Doc<"trackingShipments">,
  to: TrackingStatus,
  eventDescription: string,
  locationId?: Id<"trackingLocations">,
  facilityId?: Id<"trackingFacilities">,
): Promise<void> {
  if (!canTransition(shipment.status, to)) {
    throw new Error(
      `Invalid status transition: ${shipment.status} → ${to}`,
    );
  }
  const now = Date.now();
  const patch: Partial<Doc<"trackingShipments">> = {
    status: to,
    progress: progressForStatus(to),
    updatedAt: now,
  };
  if (to === "PICKED_UP" && !shipment.shippedAt) patch.shippedAt = now;
  if (to === "DELIVERED") {
    patch.deliveredAt = now;
    patch.actualDelivery = now;
  }
  if (locationId && (to === "AT_ORIGIN_FACILITY" || to === "AT_DESTINATION_FACILITY" || to === "IN_TRANSIT" || to === "OUT_FOR_DELIVERY")) {
    patch.currentLocationId = locationId;
  }
  ctx.db.patch(shipment._id, patch);

  await ctx.db.insert("trackingEvents", {
    shipmentId: shipment._id,
    status: to,
    title: STATUS_EVENT_TITLES[to],
    description: eventDescription || STATUS_EVENT_TITLES[to],
    locationId,
    facilityId,
    eventTimestamp: now,
    isPublic: true,
    createdBy: actorId,
    createdAt: now,
  });

  await audit(
    ctx,
    actorId,
    "STATUS_CHANGED",
    "trackingShipments",
    shipment._id,
    { status: shipment.status, progress: shipment.progress },
    { status: to, progress: patch.progress },
  );

  await notifyStatusChange(ctx, { ...shipment, ...patch } as Doc<"trackingShipments">, to);
}

// ─── Shipment creation (shared core) ─────────────────────────────────────────

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

type PartyInput = {
  name: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  country: string;
  postalCode: string;
};

/** Shared creation core: tracking number, ETA, event, packages, route, audit. */
export async function createShipmentCore(
  ctx: MutationCtx,
  actorId: Id<"users">,
  input: {
    sender: PartyInput;
    recipient: PartyInput;
    senderId?: Id<"users">;
    recipientId?: Id<"users">;
    packageDescription: string;
    totalWeight: number;
    weightUnit: "kg" | "lb";
    dimensions?: string;
    declaredValue?: number;
    currency?: string;
    serviceTypeId?: Id<"trackingServiceTypes">;
    carrierId?: Id<"trackingCarriers">;
    referenceNumber?: string;
    notes?: string;
    originLocationId?: Id<"trackingLocations">;
    destinationLocationId?: Id<"trackingLocations">;
    packages?: Array<{
      description: string;
      packageType: string;
      weight: number;
      dimensions?: string;
      quantity: number;
    }>;
    routeStops?: Array<{
      locationId?: Id<"trackingLocations">;
      facilityId?: Id<"trackingFacilities">;
      label: string;
    }>;
  },
): Promise<{ shipmentId: Id<"trackingShipments">; trackingNumber: string }> {
  const now = Date.now();
  const tn = await uniqueTrackingNumber(ctx, now);
  const service = await resolveServiceType(ctx, input.serviceTypeId);
  const eta = calculateEta(now, service.estimatedTransitDays, "CREATED");

  const shipmentId = await ctx.db.insert("trackingShipments", {
    trackingNumber: tn,
    referenceNumber: input.referenceNumber,
    status: "CREATED",
    progress: progressForStatus("CREATED"),
    serviceTypeId: service._id,
    serviceTypeName: service.name,
    carrierId: input.carrierId,
    senderId: input.senderId,
    recipientId: input.recipientId,
    originLocationId: input.originLocationId,
    destinationLocationId: input.destinationLocationId,
    senderName: input.sender.name,
    senderPhone: input.sender.phone,
    senderEmail: input.sender.email,
    senderAddress: input.sender.address,
    senderCity: input.sender.city,
    senderState: input.sender.state,
    senderCountry: input.sender.country,
    senderPostalCode: input.sender.postalCode,
    recipientName: input.recipient.name,
    recipientPhone: input.recipient.phone,
    recipientEmail: input.recipient.email,
    recipientAddress: input.recipient.address,
    recipientCity: input.recipient.city,
    recipientState: input.recipient.state,
    recipientCountry: input.recipient.country,
    recipientPostalCode: input.recipient.postalCode,
    packageDescription: input.packageDescription,
    totalWeight: input.totalWeight,
    weightUnit: input.weightUnit,
    dimensions: input.dimensions,
    declaredValue: input.declaredValue,
    currency: input.currency,
    notes: input.notes,
    estimatedDelivery: eta,
    createdAt: now,
    updatedAt: now,
  });

  await ctx.db.insert("trackingEvents", {
    shipmentId,
    status: "CREATED",
    title: "Shipment created",
    description: `Shipment ${tn} created with service ${service.name}.`,
    locationId: input.originLocationId,
    eventTimestamp: now,
    isPublic: true,
    createdBy: actorId,
    createdAt: now,
  });

  // Packages: barcode encodes the tracking number, QR encodes the public URL path.
  // Every shipment must be scannable — fall back to a single default package
  // built from the shipment-level data when none is provided.
  const packagesToCreate =
    input.packages && input.packages.length > 0
      ? input.packages
      : [
          {
            description: input.packageDescription,
            packageType: "parcel",
            weight: input.totalWeight,
            dimensions: input.dimensions,
            quantity: 1,
          },
        ];
  for (let i = 0; i < packagesToCreate.length; i++) {
    const p = packagesToCreate[i];
    const packageTracking =
      packagesToCreate.length > 1 ? `${tn}-P${i + 1}` : tn;
    await ctx.db.insert("trackingPackages", {
      shipmentId,
      packageNumber: i + 1,
      trackingNumber: packageTracking,
      description: p.description,
      packageType: p.packageType,
      weight: p.weight,
      dimensions: p.dimensions,
      quantity: p.quantity,
      barcodeData: packageTracking,
      qrData: `/tracking/${tn}`,
      createdAt: now,
    });
  }

  // Route stops in the provided order.
  for (let i = 0; i < (input.routeStops?.length ?? 0); i++) {
    const s = input.routeStops![i];
    await ctx.db.insert("trackingRouteStops", {
      shipmentId,
      locationId: s.locationId,
      facilityId: s.facilityId,
      label: s.label,
      sequence: i + 1,
      status: "pending",
      createdAt: now,
    });
  }

  await audit(ctx, actorId, "SHIPMENT_CREATED", "trackingShipments", shipmentId, null, {
    trackingNumber: tn,
    service: service.name,
  });

  return { shipmentId, trackingNumber: tn };
}

// ─── Public (authenticated user) mutations ───────────────────────────────────

export const createShipment = mutation({
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
    const { userId } = await requireUser(ctx);
    return createShipmentCore(ctx, userId, {
      ...args,
      senderId: userId,
    });
  },
});

// ─── Admin mutations ─────────────────────────────────────────────────────────

export const adminCreateShipment = mutation({
  args: {
    sender: partyValidator,
    recipient: partyValidator,
    senderId: v.optional(v.id("users")),
    recipientId: v.optional(v.id("users")),
    packageDescription: v.string(),
    totalWeight: v.number(),
    weightUnit: v.union(v.literal("kg"), v.literal("lb")),
    dimensions: v.optional(v.string()),
    declaredValue: v.optional(v.number()),
    currency: v.optional(v.string()),
    serviceTypeId: v.optional(v.id("trackingServiceTypes")),
    carrierId: v.optional(v.id("trackingCarriers")),
    referenceNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    originLocationId: v.optional(v.id("trackingLocations")),
    destinationLocationId: v.optional(v.id("trackingLocations")),
    packages: v.optional(
      v.array(
        v.object({
          description: v.string(),
          packageType: v.string(),
          weight: v.number(),
          dimensions: v.optional(v.string()),
          quantity: v.number(),
        }),
      ),
    ),
    routeStops: v.optional(
      v.array(
        v.object({
          locationId: v.optional(v.id("trackingLocations")),
          facilityId: v.optional(v.id("trackingFacilities")),
          label: v.string(),
        }),
      ),
    ),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    return createShipmentCore(ctx, adminId, args);
  },
});

export const adminUpdateShipment = mutation({
  args: {
    shipmentId: v.id("trackingShipments"),
    referenceNumber: v.optional(v.string()),
    notes: v.optional(v.string()),
    packageDescription: v.optional(v.string()),
    totalWeight: v.optional(v.number()),
    dimensions: v.optional(v.string()),
    declaredValue: v.optional(v.number()),
    currency: v.optional(v.string()),
    carrierId: v.optional(v.id("trackingCarriers")),
    serviceTypeId: v.optional(v.id("trackingServiceTypes")),
    originLocationId: v.optional(v.id("trackingLocations")),
    destinationLocationId: v.optional(v.id("trackingLocations")),
    currentLocationId: v.optional(v.id("trackingLocations")),
    estimatedDelivery: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) throw new Error("Shipment not found");

    const patch: Partial<Doc<"trackingShipments">> = {};
    for (const key of [
      "referenceNumber",
      "notes",
      "packageDescription",
      "totalWeight",
      "dimensions",
      "declaredValue",
      "currency",
      "carrierId",
      "originLocationId",
      "destinationLocationId",
      "currentLocationId",
      "estimatedDelivery",
    ] as const) {
      const value = args[key];
      if (value !== undefined) (patch as Record<string, unknown>)[key] = value;
    }
    if (args.serviceTypeId && args.serviceTypeId !== shipment.serviceTypeId) {
      const service = await ctx.db.get(args.serviceTypeId);
      if (service) {
        patch.serviceTypeId = service._id;
        patch.serviceTypeName = service.name;
        if (shipment.status !== "DELIVERED") {
          patch.estimatedDelivery = calculateEta(
            shipment.createdAt,
            service.estimatedTransitDays,
            shipment.status,
          );
        }
      }
    }
    patch.updatedAt = Date.now();
    ctx.db.patch(shipment._id, patch);

    await audit(
      ctx,
      adminId,
      "SHIPMENT_UPDATED",
      "trackingShipments",
      shipment._id,
      {
        status: shipment.status,
        carrierId: shipment.carrierId,
        serviceTypeId: shipment.serviceTypeId,
      },
      patch,
    );
    return { ok: true };
  },
});

export const adminUpdateStatus = mutation({
  args: {
    shipmentId: v.id("trackingShipments"),
    status: v.string(),
    description: v.optional(v.string()),
    locationId: v.optional(v.id("trackingLocations")),
    facilityId: v.optional(v.id("trackingFacilities")),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) throw new Error("Shipment not found");
    await applyStatusChange(
      ctx,
      adminId,
      shipment,
      args.status as TrackingStatus,
      args.description ?? "",
      args.locationId,
      args.facilityId,
    );
    return { ok: true };
  },
});

export const adminAddEvent = mutation({
  args: {
    shipmentId: v.id("trackingShipments"),
    status: v.string(),
    title: v.string(),
    description: v.string(),
    locationId: v.optional(v.id("trackingLocations")),
    locationLabel: v.optional(v.string()),
    facilityId: v.optional(v.id("trackingFacilities")),
    eventTimestamp: v.number(),
    timezone: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    isPublic: v.boolean(),
    syncShipmentStatus: v.boolean(),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) throw new Error("Shipment not found");

    await ctx.db.insert("trackingEvents", {
      shipmentId: shipment._id,
      status: args.status,
      title: args.title,
      description: args.description,
      locationId: args.locationId,
      locationLabel: args.locationLabel,
      facilityId: args.facilityId,
      eventTimestamp: args.eventTimestamp,
      timezone: args.timezone,
      latitude: args.latitude,
      longitude: args.longitude,
      isPublic: args.isPublic,
      createdBy: adminId,
      createdAt: Date.now(),
    });
    await audit(ctx, adminId, "EVENT_CREATED", "trackingEvents", shipment._id, null, {
      status: args.status,
      title: args.title,
    });

    // Optionally drive the shipment's own status from this event.
    if (args.syncShipmentStatus && args.status !== shipment.status) {
      if (canTransition(shipment.status, args.status as TrackingStatus)) {
        await applyStatusChange(
          ctx,
          adminId,
          shipment,
          args.status as TrackingStatus,
          args.description,
          args.locationId,
          args.facilityId,
        );
      }
    }
    return { ok: true };
  },
});

export const adminAddPackage = mutation({
  args: {
    shipmentId: v.id("trackingShipments"),
    description: v.string(),
    packageType: v.string(),
    weight: v.number(),
    dimensions: v.optional(v.string()),
    quantity: v.number(),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) throw new Error("Shipment not found");
    const existing = await ctx.db
      .query("trackingPackages")
      .withIndex("by_shipment", (q) => q.eq("shipmentId", shipment._id))
      .collect();
    const nextNumber = existing.length + 1;
    const packageTracking =
      existing.length === 0
        ? shipment.trackingNumber
        : `${shipment.trackingNumber}-P${nextNumber}`;
    await ctx.db.insert("trackingPackages", {
      shipmentId: shipment._id,
      packageNumber: nextNumber,
      trackingNumber: packageTracking,
      description: args.description,
      packageType: args.packageType,
      weight: args.weight,
      dimensions: args.dimensions,
      quantity: args.quantity,
      barcodeData: packageTracking,
      qrData: `/tracking/${shipment.trackingNumber}`,
      createdAt: Date.now(),
    });
    // Keep shipment weight in sync with package sum.
    const totalWeight =
      existing.reduce((sum, p) => sum + p.weight * p.quantity, 0) +
      args.weight * args.quantity;
    ctx.db.patch(shipment._id, { totalWeight, updatedAt: Date.now() });
    await audit(ctx, adminId, "PACKAGE_ADDED", "trackingPackages", shipment._id, null, {
      packageTracking,
    });
    return { ok: true };
  },
});

export const adminAddRouteStop = mutation({
  args: {
    shipmentId: v.id("trackingShipments"),
    label: v.string(),
    locationId: v.optional(v.id("trackingLocations")),
    facilityId: v.optional(v.id("trackingFacilities")),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) throw new Error("Shipment not found");
    const stops = await ctx.db
      .query("trackingRouteStops")
      .withIndex("by_shipment", (q) => q.eq("shipmentId", shipment._id))
      .collect();
    await ctx.db.insert("trackingRouteStops", {
      shipmentId: shipment._id,
      label: args.label,
      locationId: args.locationId,
      facilityId: args.facilityId,
      sequence: stops.length + 1,
      status: "pending",
      createdAt: Date.now(),
    });
    await audit(ctx, adminId, "ROUTE_CHANGED", "trackingRouteStops", shipment._id, null, {
      added: args.label,
    });
    return { ok: true };
  },
});

export const adminUpdateRouteStop = mutation({
  args: {
    stopId: v.id("trackingRouteStops"),
    status: v.optional(v.union(v.literal("pending"), v.literal("arrived"), v.literal("departed"), v.literal("skipped"))),
    arrivalAt: v.optional(v.number()),
    departureAt: v.optional(v.number()),
    notes: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const stop = await ctx.db.get(args.stopId);
    if (!stop) throw new Error("Route stop not found");
    const patch: Partial<Doc<"trackingRouteStops">> = {};
    if (args.status !== undefined) patch.status = args.status;
    if (args.arrivalAt !== undefined) patch.arrivalAt = args.arrivalAt;
    if (args.departureAt !== undefined) patch.departureAt = args.departureAt;
    if (args.notes !== undefined) patch.notes = args.notes;
    ctx.db.patch(stop._id, patch);

    // Arriving at a stop updates the shipment's current location.
    if (args.status === "arrived" && stop.locationId) {
      const shipment = await ctx.db.get(stop.shipmentId);
      if (shipment) {
        ctx.db.patch(shipment._id, {
          currentLocationId: stop.locationId,
          updatedAt: Date.now(),
        });
      }
    }
    await audit(ctx, adminId, "ROUTE_CHANGED", "trackingRouteStops", stop._id, null, patch);
    return { ok: true };
  },
});

export const adminDeleteShipment = mutation({
  args: { shipmentId: v.id("trackingShipments") },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) throw new Error("Shipment not found");
    for (const table of ["trackingEvents", "trackingPackages", "trackingRouteStops"] as const) {
      const rows = await ctx.db
        .query(table)
        .withIndex("by_shipment", (q) => q.eq("shipmentId", shipment._id))
        .take(1000);
      for (const row of rows) await ctx.db.delete(row._id);
    }
    await audit(ctx, adminId, "SHIPMENT_DELETED", "trackingShipments", shipment._id, {
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
    }, null);
    ctx.db.delete(shipment._id);
    return { ok: true };
  },
});

// ─── Locations & facilities (admin-managed, no geocoding) ────────────────────

export const adminCreateLocation = mutation({
  args: {
    name: v.string(),
    type: v.union(
      v.literal("country"),
      v.literal("state"),
      v.literal("city"),
      v.literal("warehouse"),
      v.literal("airport"),
      v.literal("sorting_center"),
      v.literal("distribution_center"),
      v.literal("customs_facility"),
      v.literal("delivery_hub"),
    ),
    country: v.string(),
    countryCode: v.string(),
    state: v.optional(v.string()),
    city: v.optional(v.string()),
    postalCode: v.optional(v.string()),
    address: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const now = Date.now();
    const id = await ctx.db.insert("trackingLocations", {
      ...args,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    await audit(ctx, adminId, "LOCATION_CREATED", "trackingLocations", id, null, {
      name: args.name,
      countryCode: args.countryCode,
    });
    return { locationId: id };
  },
});

export const adminUpdateLocation = mutation({
  args: {
    locationId: v.id("trackingLocations"),
    name: v.optional(v.string()),
    city: v.optional(v.string()),
    state: v.optional(v.string()),
    address: v.optional(v.string()),
    latitude: v.optional(v.number()),
    longitude: v.optional(v.number()),
    timezone: v.optional(v.string()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const location = await ctx.db.get(args.locationId);
    if (!location) throw new Error("Location not found");
    const patch: Partial<Doc<"trackingLocations">> = { updatedAt: Date.now() };
    for (const key of ["name", "city", "state", "address", "latitude", "longitude", "timezone", "isActive"] as const) {
      const value = args[key];
      if (value !== undefined) (patch as Record<string, unknown>)[key] = value;
    }
    ctx.db.patch(location._id, patch);
    await audit(ctx, adminId, "SHIPMENT_UPDATED", "trackingLocations", location._id, null, patch);
    return { ok: true };
  },
});

export const adminDeleteLocation = mutation({
  args: { locationId: v.id("trackingLocations") },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const facilities = await ctx.db
      .query("trackingFacilities")
      .withIndex("by_location", (q) => q.eq("locationId", args.locationId))
      .first();
    if (facilities) {
      throw new Error("Location has facilities — delete or reassign them first");
    }
    await audit(ctx, adminId, "SHIPMENT_DELETED", "trackingLocations", args.locationId, null, null);
    ctx.db.delete(args.locationId);
    return { ok: true };
  },
});

export const adminCreateFacility = mutation({
  args: {
    name: v.string(),
    code: v.string(),
    type: v.union(
      v.literal("warehouse"),
      v.literal("airport"),
      v.literal("sorting_center"),
      v.literal("distribution_center"),
      v.literal("customs_facility"),
      v.literal("delivery_hub"),
    ),
    locationId: v.id("trackingLocations"),
  },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    const existing = await ctx.db
      .query("trackingFacilities")
      .withIndex("by_code", (q) => q.eq("code", args.code))
      .unique();
    if (existing) throw new Error(`Facility code ${args.code} already exists`);
    const now = Date.now();
    const id = await ctx.db.insert("trackingFacilities", {
      name: args.name,
      code: args.code,
      type: args.type,
      locationId: args.locationId,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    });
    await audit(ctx, adminId, "LOCATION_CREATED", "trackingFacilities", id, null, {
      name: args.name,
      code: args.code,
    });
    return { facilityId: id };
  },
});

export const adminDeleteFacility = mutation({
  args: { facilityId: v.id("trackingFacilities") },
  handler: async (ctx, args) => {
    const { adminId } = await requireAdmin(ctx);
    await audit(ctx, adminId, "SHIPMENT_DELETED", "trackingFacilities", args.facilityId, null, null);
    ctx.db.delete(args.facilityId);
    return { ok: true };
  },
});

// ─── Reference data seeding (idempotent, native — no external providers) ────

export const seedTrackingDefaults = mutation({
  args: {},
  handler: async (ctx) => {
    let seeded = 0;
    const carriers: Array<{ name: string; code: string }> = [
      { name: "Cloudie Air", code: "CLAIR" },
      { name: "Cloudie Ground", code: "CLGRD" },
      { name: "Cloudie Ocean", code: "CLOCN" },
      { name: "Cloudie Rail", code: "CLRAI" },
    ];
    for (const c of carriers) {
      const existing = await ctx.db
        .query("trackingCarriers")
        .withIndex("by_code", (q) => q.eq("code", c.code))
        .unique();
      if (!existing) {
        await ctx.db.insert("trackingCarriers", {
          name: c.name,
          code: c.code,
          isActive: true,
          createdAt: Date.now(),
        });
        seeded++;
      }
    }
    const services: Array<{ name: string; code: string; description: string; days: number }> = [
      { name: "Express", code: "EXP", description: "Priority air service", days: 3 },
      { name: "Standard", code: "STD", description: "Regular air/ground service", days: 7 },
      { name: "Economy", code: "ECO", description: "Cost-effective consolidated service", days: 14 },
      { name: "Air Freight", code: "AIRF", description: "Consolidated air cargo", days: 10 },
      { name: "Sea Freight", code: "SEAF", description: "Ocean container freight", days: 35 },
    ];
    for (const s of services) {
      const existing = await ctx.db
        .query("trackingServiceTypes")
        .withIndex("by_code", (q) => q.eq("code", s.code))
        .unique();
      if (!existing) {
        await ctx.db.insert("trackingServiceTypes", {
          name: s.name,
          code: s.code,
          description: s.description,
          estimatedTransitDays: s.days,
          isActive: true,
        });
        seeded++;
      }
    }
    return { seeded };
  },
});
