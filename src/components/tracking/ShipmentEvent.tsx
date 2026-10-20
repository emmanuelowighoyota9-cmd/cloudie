import type { LucideIcon } from "lucide-react";
import {
  Ban,
  CircleCheck,
  ClipboardCheck,
  Landmark,
  MapPin,
  PackageCheck,
  Plane,
  TriangleAlert,
  Truck,
  Undo2,
  Warehouse,
} from "lucide-react";

import { StatusBadge } from "@/components/admin/shared";
import { cn } from "@/lib/utils";

/**
 * Icon for a tracking status. Kept separate from the badge so a scan, a hold
 * and a delivery never look alike at a glance on the timeline.
 */
export function statusIcon(status: string): LucideIcon {
  switch (status.toUpperCase()) {
    case "PENDING":
    case "CREATED":
    case "BOOKED":
      return ClipboardCheck;
    case "PICKED_UP":
    case "AT_ORIGIN_FACILITY":
    case "AT_DESTINATION_FACILITY":
      return Warehouse;
    case "PROCESSING":
    case "DEPARTED_ORIGIN":
    case "IN_TRANSIT":
    case "ARRIVED_DESTINATION_COUNTRY":
      return Plane;
    case "CUSTOMS_CLEARANCE":
    case "CUSTOMS_CLEARED":
      return Landmark;
    case "OUT_FOR_DELIVERY":
    case "DELIVERY_ATTEMPTED":
      return Truck;
    case "DELIVERED":
      return CircleCheck;
    case "EXCEPTION":
    case "ON_HOLD":
    case "RETURNED":
    case "FAILED":
      return TriangleAlert;
    case "CANCELLED":
      return Ban;
    case "RETURNED_TO_SENDER":
      return Undo2;
    default:
      return PackageCheck;
  }
}

/** "12 Mar, 14:32" — short, unambiguous, no year noise for recent scans. */
export function eventTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * One entry in a shipment timeline: status icon, title, status pill, optional
 * description, timestamp and location. `last` drops the connector line.
 */
export function ShipmentEvent({
  status,
  title,
  description,
  locationLabel,
  timestamp,
  latest = false,
  last = false,
  className,
}: {
  status: string;
  title: string;
  description?: string | null;
  locationLabel?: string | null;
  timestamp: number;
  latest?: boolean;
  last?: boolean;
  className?: string;
}) {
  const Icon = statusIcon(status);

  return (
    <li className={cn("relative flex gap-3", className)}>
      <div className="flex flex-col items-center">
        <span
          className={cn(
            "z-10 flex size-8 shrink-0 items-center justify-center rounded-full border transition-colors",
            latest
              ? "border-primary/40 bg-primary/12 text-primary"
              : "border-border bg-surface-2 text-muted-foreground",
          )}
          aria-hidden
        >
          <Icon className="size-4" />
        </span>
        {!last && <span className="mt-1 w-px flex-1 bg-border" aria-hidden />}
      </div>

      <div className={cn("min-w-0 flex-1", last ? "pb-0" : "pb-5")}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <p
            className={cn(
              "min-w-0 text-sm leading-snug",
              latest ? "font-semibold text-foreground" : "font-medium text-foreground",
            )}
          >
            {title}
          </p>
          <StatusBadge status={status.toLowerCase()} />
        </div>

        {description && (
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{description}</p>
        )}

        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          <time dateTime={new Date(timestamp).toISOString()} className="font-mono tabular-nums">
            {eventTime(timestamp)}
          </time>
          {locationLabel && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <MapPin className="size-3 shrink-0" aria-hidden />
              <span className="truncate">{locationLabel}</span>
            </span>
          )}
        </div>
      </div>
    </li>
  );
}
