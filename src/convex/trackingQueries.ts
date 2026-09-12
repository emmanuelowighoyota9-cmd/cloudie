import { getAuthUserId } from "@convex-dev/auth/server";
import { paginationOptsValidator } from "convex/server";
import { query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { requireAdmin } from "./adminApi";

// ─── Reference data (available to any signed-in user; needed for create forms) ──

export const listCarriers = query({
  args: {},
  handler: async (ctx) => {
    await getAuthUserId(ctx); // must be signed in
    return await ctx.db.query("trackingCarriers").order("asc").take(100);
  },
});

export const listServiceTypes = query({
  args: {},
  handler: async (ctx) => {
    await getAuthUserId(ctx);
    return await ctx.db.query("trackingServiceTypes").order("asc").take(100);
  },
});

export const listLocations = query({
  args: {},
  handler: async (ctx) => {
    await getAuthUserId(ctx);
    return await ctx.db.query("trackingLocations").order("desc").take(500);
  },
});

export const listFacilities = query({
  args: {},
  handler: async (ctx) => {
    await getAuthUserId(ctx);
    return await ctx.db.query("trackingFacilities").order("desc").take(500);
  },
});

export const countStats = query({
  args: {},
  handler: async (ctx) => {
    await getAuthUserId(ctx);
    const [shipments, locations, facilities, carriers, services] = await Promise.all([
      ctx.db.query("trackingShipments").take(1000),
      ctx.db.query("trackingLocations").take(1000),
      ctx.db.query("trackingFacilities").take(1000),
      ctx.db.query("trackingCarriers").take(1000),
      ctx.db.query("trackingServiceTypes").take(1000),
    ]);
    return {
      shipments: shipments.length,
      active: shipments.filter((s) => !["DELIVERED", "CANCELLED", "RETURNED"].includes(s.status)).length,
      delivered: shipments.filter((s) => s.status === "DELIVERED").length,
      locations: locations.length,
      facilities: facilities.length,
      carriers: carriers.length,
      services: services.length,
    };
  },
});

// ─── Public tracking (NO AUTH) — intentionally minimal, privacy-filtered ─────

export const publicTracking = query({
  args: { trackingNumber: v.string() },
  handler: async (ctx, args) => {
    const tn = args.trackingNumber.trim().toUpperCase();
    const shipment = await ctx.db
      .query("trackingShipments")
      .withIndex("by_tracking", (q) => q.eq("trackingNumber", tn))
      .unique();
    if (!shipment) return null;

    const [carrier, service, origin, destination, current] = await Promise.all([
      shipment.carrierId ? ctx.db.get(shipment.carrierId) : null,
      shipment.serviceTypeId ? ctx.db.get(shipment.serviceTypeId) : null,
      shipment.originLocationId ? ctx.db.get(shipment.originLocationId) : null,
      shipment.destinationLocationId ? ctx.db.get(shipment.destinationLocationId) : null,
      shipment.currentLocationId ? ctx.db.get(shipment.currentLocationId) : null,
    ]);

    const events = (
      await ctx.db
        .query("trackingEvents")
        .withIndex("by_shipment", (q) => q.eq("shipmentId", shipment._id))
        .order("desc")
        .take(200)
    ).filter((e) => e.isPublic);

    const routeStops = await ctx.db
      .query("trackingRouteStops")
      .withIndex("by_shipment", (q) => q.eq("shipmentId", shipment._id))
      .order("asc")
      .take(50);

    const stopLocations = await Promise.all(
      routeStops.map((s) => (s.locationId ? ctx.db.get(s.locationId) : null)),
    );

    return {
      trackingNumber: shipment.trackingNumber,
      status: shipment.status,
      progress: shipment.progress,
      carrierName: carrier?.name ?? null,
      serviceName: service?.name ?? shipment.serviceTypeName,
      origin: origin
        ? { label: origin.name, city: origin.city, country: origin.country }
        : null,
      destination: destination
        ? { label: destination.name, city: destination.city, country: destination.country }
        : null,
      currentLocation: current
        ? {
            label: current.name,
            city: current.city,
            state: current.state,
            country: current.country,
            latitude: current.latitude,
            longitude: current.longitude,
          }
        : null,
      estimatedDelivery: shipment.estimatedDelivery,
      actualDelivery: shipment.actualDelivery,
      shippedAt: shipment.shippedAt,
      deliveredAt: shipment.deliveredAt,
      totalWeight: shipment.totalWeight,
      weightUnit: shipment.weightUnit,
      packageDescription: shipment.packageDescription,
      createdAt: shipment.createdAt,
      // Public-safe city/country only — never full addresses, phones, or emails.
      destinationCity: shipment.recipientCity,
      destinationCountry: shipment.recipientCountry,
      events: events.map((e) => {
        return {
          status: e.status,
          title: e.title,
          description: e.description,
          locationLabel: e.locationLabel,
          eventTimestamp: e.eventTimestamp,
          timezone: e.timezone,
        };
      }),
      route: routeStops.map((s, i) => {
        const loc = stopLocations[i];
        return {
          label: s.label,
          city: loc?.city ?? null,
          country: loc?.country ?? null,
          sequence: s.sequence,
          status: s.status,
          arrivalAt: s.arrivalAt,
          departureAt: s.departureAt,
        };
      }),
    };
  },
});

// ─── Admin queries ───────────────────────────────────────────────────────────

export const adminListShipments = query({
  args: {
    paginationOpts: paginationOptsValidator,
    status: v.optional(v.string()),
    search: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const search = args.search?.trim().toUpperCase();
    if (search) {
      const page = await ctx.db
        .query("trackingShipments")
        .withSearchIndex("search_tracking", (s) => s.search("trackingNumber", search))
        .paginate(args.paginationOpts);
      return { ...page, page: page.page.map(toListItem) };
    }
    const page = await ctx.db
      .query("trackingShipments")
      .withIndex("by_createdAt")
      .order("desc")
      .paginate(args.paginationOpts);
    let items = page.page.map(toListItem);
    if (args.status) items = items.filter((s) => s.status === args.status);
    return { ...page, page: items };
  },
});

function toListItem(s: Doc<"trackingShipments">) {
  return {
    _id: s._id,
    trackingNumber: s.trackingNumber,
    referenceNumber: s.referenceNumber,
    status: s.status,
    progress: s.progress,
    serviceTypeName: s.serviceTypeName,
    senderName: s.senderName,
    senderCity: s.senderCity,
    senderCountry: s.senderCountry,
    recipientName: s.recipientName,
    recipientCity: s.recipientCity,
    recipientCountry: s.recipientCountry,
    originLabel: s.originLocationId,
    destinationLabel: s.destinationLocationId,
    estimatedDelivery: s.estimatedDelivery,
    deliveredAt: s.deliveredAt,
    createdAt: s.createdAt,
  };
}

export const adminShipmentDetail = query({
  args: { shipmentId: v.id("trackingShipments") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) return null;
    const [carrier, service, origin, destination, current] = await Promise.all([
      shipment.carrierId ? ctx.db.get(shipment.carrierId) : null,
      shipment.serviceTypeId ? ctx.db.get(shipment.serviceTypeId) : null,
      shipment.originLocationId ? ctx.db.get(shipment.originLocationId) : null,
      shipment.destinationLocationId ? ctx.db.get(shipment.destinationLocationId) : null,
      shipment.currentLocationId ? ctx.db.get(shipment.currentLocationId) : null,
    ]);
    const [events, packages, routeStops] = await Promise.all([
      ctx.db
        .query("trackingEvents")
        .withIndex("by_shipment", (q) => q.eq("shipmentId", shipment._id))
        .order("desc")
        .take(500),
      ctx.db
        .query("trackingPackages")
        .withIndex("by_shipment", (q) => q.eq("shipmentId", shipment._id))
        .order("asc")
        .take(100),
      ctx.db
        .query("trackingRouteStops")
        .withIndex("by_shipment", (q) => q.eq("shipmentId", shipment._id))
        .order("asc")
        .take(50),
    ]);
    const eventLocationIds = new Set(
      events.map((e) => e.locationId).filter((x): x is Id<"trackingLocations"> => !!x),
    );
    const stopLocationIds = new Set(
      routeStops.map((s) => s.locationId).filter((x): x is Id<"trackingLocations"> => !!x),
    );
    const facilityIds = new Set(
      [...events.map((e) => e.facilityId), ...routeStops.map((s) => s.facilityId)].filter(
        (x): x is Id<"trackingFacilities"> => !!x,
      ),
    );
    const [eventLocations, stopLocations, facilities] = await Promise.all([
      Promise.all([...eventLocationIds].map((id) => ctx.db.get(id))),
      Promise.all([...stopLocationIds].map((id) => ctx.db.get(id))),
      Promise.all([...facilityIds].map((id) => ctx.db.get(id))),
    ]);
    const locMap = new Map(
      [...eventLocations, ...stopLocations].flatMap((l) => (l ? [[l._id, l]] : [])),
    );
    const facMap = new Map(facilities.flatMap((f) => (f ? [[f._id, f]] : [])));
    return {
      shipment,
      carrier,
      service,
      origin,
      destination,
      current,
      events: events.map((e) => ({
        _id: e._id,
        status: e.status,
        title: e.title,
        description: e.description,
        locationLabel: e.locationId ? locMap.get(e.locationId)?.name ?? null : e.locationLabel,
        facilityName: e.facilityId ? facMap.get(e.facilityId)?.name ?? null : null,
        eventTimestamp: e.eventTimestamp,
        timezone: e.timezone,
        latitude: e.latitude,
        longitude: e.longitude,
        isPublic: e.isPublic,
      })),
      packages,
      routeStops: routeStops.map((s) => ({
        _id: s._id,
        label: s.label,
        locationName: s.locationId ? locMap.get(s.locationId)?.name ?? null : null,
        facilityName: s.facilityId ? facMap.get(s.facilityId)?.name ?? null : null,
        sequence: s.sequence,
        status: s.status,
        arrivalAt: s.arrivalAt,
        departureAt: s.departureAt,
        notes: s.notes,
      })),
    };
  },
});

export const adminShipmentByTracking = query({
  args: { trackingNumber: v.string() },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const tn = args.trackingNumber.trim().toUpperCase();
    const shipment = await ctx.db
      .query("trackingShipments")
      .withIndex("by_tracking", (q) => q.eq("trackingNumber", tn))
      .unique();
    if (!shipment) return null;
    return shipment._id;
  },
});

// Label data: includes full addresses — admin-only, used by the label renderer.
export const adminLabelData = query({
  args: { shipmentId: v.id("trackingShipments") },
  handler: async (ctx, args) => {
    await requireAdmin(ctx);
    const shipment = await ctx.db.get(args.shipmentId);
    if (!shipment) return null;
    const [service, origin, destination, packages] = await Promise.all([
      shipment.serviceTypeId ? ctx.db.get(shipment.serviceTypeId) : null,
      shipment.originLocationId ? ctx.db.get(shipment.originLocationId) : null,
      shipment.destinationLocationId ? ctx.db.get(shipment.destinationLocationId) : null,
      ctx.db
        .query("trackingPackages")
        .withIndex("by_shipment", (q) => q.eq("shipmentId", shipment._id))
        .order("asc")
        .take(100),
    ]);
    return {
      shipment,
      serviceName: service?.name ?? shipment.serviceTypeName,
      originLabel: origin ? `${origin.city ? origin.city + ", " : ""}${origin.country}` : `${shipment.senderCity}, ${shipment.senderCountry}`,
      destinationLabel: destination
        ? `${destination.city ? destination.city + ", " : ""}${destination.country}`
        : `${shipment.recipientCity}, ${shipment.recipientCountry}`,
      packages,
    };
  },
});
