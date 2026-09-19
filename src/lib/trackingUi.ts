/**
 * Client-side mirrors of the tracking engine's display helpers.
 * The engine (src/convex/trackingEngine.ts) is the source of truth for the
 * state machine, progress and ETA — these helpers only format for the UI.
 */

export const TRACKING_STATUSES = [
  "CREATED",
  "BOOKED",
  "PICKED_UP",
  "PROCESSING",
  "AT_ORIGIN_FACILITY",
  "DEPARTED_ORIGIN",
  "IN_TRANSIT",
  "ARRIVED_DESTINATION_COUNTRY",
  "CUSTOMS_CLEARANCE",
  "CUSTOMS_CLEARED",
  "AT_DESTINATION_FACILITY",
  "OUT_FOR_DELIVERY",
  "DELIVERY_ATTEMPTED",
  "DELIVERED",
  "EXCEPTION",
  "ON_HOLD",
  "CANCELLED",
  "RETURNED",
] as const;

export type TrackingStatusUi = (typeof TRACKING_STATUSES)[number];

export function statusLabel(status: string): string {
  return status.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

export function statusBadgeClass(status: string): string {
  switch (status) {
    case "DELIVERED":
    case "CUSTOMS_CLEARED":
      return "bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300";
    case "CANCELLED":
      return "bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400";
    case "EXCEPTION":
      return "bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300";
    case "ON_HOLD":
    case "DELIVERY_ATTEMPTED":
      return "bg-amber-100 text-amber-700 dark:bg-amber-900/50 dark:text-amber-300";
    case "OUT_FOR_DELIVERY":
      return "bg-indigo-100 text-indigo-700 dark:bg-indigo-900/50 dark:text-indigo-300";
    case "RETURNED":
      return "bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300";
    case "CREATED":
      return "bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300";
    default:
      return "bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300";
  }
}

/**
 * Absolute public tracking URL for a tracking number. QRs encode this so a
 * scanned code opens the real page rather than a relative path.
 */
export function trackingUrl(trackingNumber: string): string {
  const path = `/tracking/${encodeURIComponent(trackingNumber)}`;
  if (typeof window !== "undefined" && window.location?.origin) {
    return `${window.location.origin}${path}`;
  }
  return path;
}

/** Formats a location label consistently: "City, Country" or the raw name. */
export function locationLabel(loc: { name: string; city?: string | null; country?: string | null } | null | undefined): string {
  if (!loc) return "—";
  const parts = [loc.city, loc.country].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : loc.name;
}
