import { internalMutation } from "./_generated/server";
import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { progressForStatus, calculateEta } from "./trackingEngine";

/**
 * Demo data seeder for the public tracking experience.
 *
 * Internal-only and idempotent: it enriches a shipment with real, human-entered
 * city coordinates and a plausible multi-country route so the native route map
 * has something to render. It never runs automatically and is not part of any
 * production flow — admins create and maintain locations via /admin/locations.
 */

type NewLocation = {
  name: string;
  type:
    | "country"
    | "state"
    | "city"
    | "warehouse"
    | "airport"
    | "sorting_center"
    | "distribution_center"
    | "customs_facility"
    | "delivery_hub";
  country: string;
  countryCode: string;
  state?: string;
  city?: string;
  latitude: number;
  longitude: number;
  timezone?: string;
};

const ROUTE: NewLocation[] = [
  { name: "Damascus International Hub", type: "airport", country: "Syria", countryCode: "SY", city: "Damascus", latitude: 33.5138, longitude: 36.2765, timezone: "Asia/Damascus" },
  { name: "Aleppo Sorting Centre", type: "sorting_center", country: "Syria", countryCode: "SY", city: "Aleppo", latitude: 36.2021, longitude: 37.1343, timezone: "Asia/Damascus" },
  { name: "Istanbul Transit Hub", type: "airport", country: "Turkey", countryCode: "TR", city: "Istanbul", latitude: 41.0082, longitude: 28.9784, timezone: "Europe/Istanbul" },
  { name: "London Heathrow Gateway", type: "airport", country: "United Kingdom", countryCode: "GB", city: "London", latitude: 51.47, longitude: -0.4543, timezone: "Europe/London" },
  { name: "New York Customs Facility", type: "customs_facility", country: "USA", countryCode: "US", state: "New York", city: "New York", latitude: 40.7128, longitude: -74.006, timezone: "America/New_York" },
];

const DESTINATION: NewLocation = {
  name: "Houston Distribution Center",
  type: "distribution_center",
  country: "USA",
  countryCode: "US",
  state: "Texas",
  city: "Houston",
  latitude: 29.7604,
  longitude: -95.3698,
  timezone: "America/Chicago",
};

const DAY = 24 * 60 * 60 * 1000;

export const seedDemoRoute = internalMutation({
  args: { trackingNumber: v.optional(v.string()) },
  handler: async (ctx, args) => {
    let shipment: Doc<"trackingShipments"> | null = null;
    if (args.trackingNumber) {
      shipment = await ctx.db
        .query("trackingShipments")
        .withIndex("by_tracking", (q) => q.eq("trackingNumber", args.trackingNumber!.trim().toUpperCase()))
        .unique();
    } else {
      shipment = await ctx.db.query("trackingShipments").order("desc").first();
    }
    if (!shipment) return { ok: false, reason: "NO_SHIPMENT" };

    const now = Date.now();
    const allLocations = [...ROUTE, DESTINATION];

    // Reuse locations that already exist by name, otherwise insert them.
    // Existing rows missing coordinates are backfilled so the map can render.
    const locationIdByName = new Map<string, Id<"trackingLocations">>();
    for (const loc of allLocations) {
      const existing = await ctx.db
        .query("trackingLocations")
        .withIndex("by_country", (q) => q.eq("countryCode", loc.countryCode))
        .take(200);
      const match = existing.find((l) => l.name === loc.name);
      if (match) {
        if (match.latitude == null || match.longitude == null) {
          await ctx.db.patch(match._id, {
            latitude: loc.latitude,
            longitude: loc.longitude,
            timezone: match.timezone ?? loc.timezone,
            updatedAt: now,
          });
        }
        locationIdByName.set(loc.name, match._id);
        continue;
      }
      const id = await ctx.db.insert("trackingLocations", {
        name: loc.name,
        type: loc.type,
        country: loc.country,
        countryCode: loc.countryCode,
        state: loc.state,
        city: loc.city,
        latitude: loc.latitude,
        longitude: loc.longitude,
        timezone: loc.timezone,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
      locationIdByName.set(loc.name, id);
    }

    // Idempotency: if this shipment already has route stops, stop here — the
    // location backfill above is the only side effect worth repeating.
    const existingStops = await ctx.db
      .query("trackingRouteStops")
      .withIndex("by_shipment", (q) => q.eq("shipmentId", shipment!._id))
      .take(1);
    if (existingStops.length > 0) {
      return { ok: true, trackingNumber: shipment.trackingNumber, skipped: true };
    }

    const id = (name: string) => locationIdByName.get(name)!;
    const originId = id(ROUTE[0].name);
    const destinationId = id(DESTINATION.name);
    const currentId = id("London Heathrow Gateway");

    // ── Planned route (intermediate stops only; origin/destination are separate) ──
    const intermediates = ROUTE.slice(1);
    const stopIds: Id<"trackingRouteStops">[] = [];
    for (let i = 0; i < intermediates.length; i++) {
      const loc = intermediates[i];
      const reached = loc.name === "Aleppo Sorting Centre" || loc.name === "Istanbul Transit Hub";
      const stopId = await ctx.db.insert("trackingRouteStops", {
        shipmentId: shipment._id,
        locationId: id(loc.name),
        label: loc.name,
        sequence: i + 1,
        status: reached ? "departed" : "pending",
        arrivalAt: reached ? now - (4 - i) * DAY : undefined,
        departureAt: reached ? now - (4 - i) * DAY + 6 * 60 * 60 * 1000 : undefined,
        createdAt: now,
      });
      stopIds.push(stopId);
    }

    // ── Public timeline with realistic, spread-out timestamps ──
    const events: Array<{
      status: string;
      title: string;
      description: string;
      loc: NewLocation;
      ts: number;
    }> = [
      {
        status: "CREATED",
        title: "Shipment created",
        description: `Consignment ${shipment.trackingNumber} booked with Express service.`,
        loc: ROUTE[0],
        ts: now - 5 * DAY,
      },
      {
        status: "PICKED_UP",
        title: "Picked up",
        description: "Collected from the sender and scanned into the network.",
        loc: ROUTE[0],
        ts: now - 5 * DAY + 4 * 60 * 60 * 1000,
      },
      {
        status: "AT_ORIGIN_FACILITY",
        title: "Arrived at origin facility",
        description: `Processed at ${ROUTE[1].name}.`,
        loc: ROUTE[1],
        ts: now - 4 * DAY,
      },
      {
        status: "DEPARTED_ORIGIN",
        title: "Departed origin country",
        description: "Customs cleared and handed to the outbound air linehaul.",
        loc: ROUTE[1],
        ts: now - 3 * DAY,
      },
      {
        status: "IN_TRANSIT",
        title: "In transit",
        description: `Transferred through ${ROUTE[2].name} en route to the destination country.`,
        loc: ROUTE[2],
        ts: now - 2 * DAY,
      },
      {
        status: "ARRIVED_DESTINATION_COUNTRY",
        title: "Arrived destination country",
        description: `Landed at ${ROUTE[3].name}; awaiting customs clearance.`,
        loc: ROUTE[3],
        ts: now - 8 * 60 * 60 * 1000,
      },
    ];

    for (const e of events) {
      await ctx.db.insert("trackingEvents", {
        shipmentId: shipment._id,
        status: e.status,
        title: e.title,
        description: e.description,
        locationId: id(e.loc.name),
        locationLabel: e.loc.city ? `${e.loc.city}, ${e.loc.country}` : e.loc.country,
        eventTimestamp: e.ts,
        timezone: e.loc.timezone,
        latitude: e.loc.latitude,
        longitude: e.loc.longitude,
        isPublic: true,
        createdAt: e.ts,
      });
    }

    const status = "IN_TRANSIT" as const;
    await ctx.db.patch(shipment._id, {
      status,
      progress: progressForStatus(status),
      originLocationId: originId,
      destinationLocationId: destinationId,
      currentLocationId: currentId,
      shippedAt: shipment.shippedAt ?? now - 5 * DAY + 4 * 60 * 60 * 1000,
      estimatedDelivery: calculateEta(now - 5 * DAY, 3, status),
      updatedAt: now,
    });

    await ctx.db.insert("auditLogs", {
      actorId: undefined,
      action: "DEMO_ROUTE_SEEDED",
      resource: "trackingShipments",
      resourceId: shipment._id,
      before: { status: shipment.status },
      after: { status, stops: stopIds.length, events: events.length },
      createdAt: now,
    });

    return {
      ok: true,
      trackingNumber: shipment.trackingNumber,
      stops: stopIds.length,
      events: events.length,
    };
  },
});
