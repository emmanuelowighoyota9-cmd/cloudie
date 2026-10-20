/**
 * View models for shipment surfaces.
 *
 * Shipment data reaches the UI in two shapes: the Convex document shape and the
 * normalized Postgres rows returned by the API adapter (`src/lib/neonClient`).
 * Both are flattened here so screens deal with one field set and never have to
 * know whether a weight arrives as `totalWeight` or `weight`.
 */

import { statusLabel } from "@/lib/trackingUi";

export type ViewShipment = {
  id: string;
  trackingNumber: string;
  /** Upper-case status, e.g. "IN_TRANSIT" — used for stage mapping. */
  status: string;
  /** Lower-case status, e.g. "in_transit" — used for badges and copy. */
  statusKey: string;
  service: string;
  senderName: string;
  senderCity: string;
  senderCountry: string;
  recipientName: string;
  recipientCity: string;
  recipientCountry: string;
  packageDescription: string;
  weightLabel: string;
  dimensions: string;
  estimatedDelivery: number | null;
  deliveredAt: number | null;
  originCity: string;
  destinationCity: string;
  recipientMasked: string | null;
};

export type ViewEvent = {
  id: string;
  status: string;
  title: string;
  description: string | null;
  location: string | null;
  timestamp: number;
};

const CLOSED = ["DELIVERED", "CANCELLED", "RETURNED", "FAILED"];

/** Accepts epoch millis, numeric strings and ISO dates. */
export function toEpoch(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(String(value));
  return Number.isNaN(parsed) ? null : parsed;
}

function text(value: unknown, fallback = ""): string {
  if (value === null || value === undefined) return fallback;
  const trimmed = String(value).trim();
  return trimmed || fallback;
}

function initials(name: string): string | null {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return null;
  return parts.map((part) => `${part.charAt(0).toUpperCase()}.`).join(" ");
}

export function toViewShipment(raw: unknown): ViewShipment {
  const row = (raw ?? {}) as Record<string, unknown>;
  const statusRaw = text(row.status, "pending");
  const senderCity = text(row.senderCity ?? row.sender_city);
  const senderCountry = text(row.senderCountry ?? row.sender_country);
  const recipientCity = text(row.recipientCity ?? row.recipient_city);
  const recipientCountry = text(row.recipientCountry ?? row.recipient_country);
  const weight = row.totalWeight ?? row.weight;
  const unit = text(row.weightUnit ?? row.weight_unit, "kg");
  const recipientName = text(row.recipientName ?? row.recipient_name);
  const explicitMasked = text(row.recipientMasked ?? row.recipient_masked);

  return {
    id: text(row._id ?? row.id),
    trackingNumber: text(row.trackingNumber ?? row.tracking_number),
    status: statusRaw.toUpperCase().replace(/\s+/g, "_"),
    statusKey: statusRaw.toLowerCase().replace(/\s+/g, "_"),
    service: text(row.serviceTypeName ?? row.serviceType ?? row.service_type, "Standard"),
    senderName: text(row.senderName ?? row.sender_name),
    senderCity,
    senderCountry,
    recipientName,
    recipientCity,
    recipientCountry,
    packageDescription: text(row.packageDescription ?? row.package_description),
    weightLabel:
      weight === null || weight === undefined || String(weight) === ""
        ? ""
        : `${Number(weight)} ${unit}`.trim(),
    dimensions: text(row.dimensions),
    estimatedDelivery: toEpoch(row.estimatedDelivery ?? row.estimated_delivery),
    deliveredAt: toEpoch(
      row.actualDelivery ?? row.deliveredAt ?? row.delivered_at ?? row.actual_delivery,
    ),
    originCity: senderCity || text((row.origin as Record<string, unknown>)?.city, "Origin"),
    destinationCity:
      recipientCity || text((row.destination as Record<string, unknown>)?.city, "Destination"),
    recipientMasked: explicitMasked || initials(recipientName),
  };
}

/** Turns the two event shapes into one row shape for the timeline components. */
export function toViewEvents(raw: unknown): ViewEvent[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry, index) => {
    const row = (entry ?? {}) as Record<string, unknown>;
    const statusRaw = text(row.status, "in_transit");
    const description = text(row.description ?? row.message);
    // "Shipment status changed to in transit" adds nothing beside the status.
    const noise = /^shipment status changed to /i.test(description) ? null : description;

    return {
      id: text(row._id ?? row.id, `event_${index}`),
      status: statusRaw,
      title: text(row.title) || statusLabel(statusRaw),
      description: noise,
      location: text(row.locationLabel ?? row.location) || null,
      timestamp:
        toEpoch(row.eventTimestamp ?? row.timestamp ?? row.occurredAt ?? row.occurred_at ?? row.createdAt) ??
        Date.now(),
    };
  });
}

export function isClosedStatus(status: string): boolean {
  return CLOSED.includes(status.toUpperCase());
}
