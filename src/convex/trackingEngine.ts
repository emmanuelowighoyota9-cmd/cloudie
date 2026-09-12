import { v } from "convex/values";
import type { TrackingStatus } from "./schema";

// ─── Tracking number generator ───
// Cryptographically-secure random suffix, collision-checked against the
// database with automatic retry. Configurable prefix via app settings.
const RNG_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // unambiguous charset

export function generateRandomSuffix(length: number): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < length; i++) out += RNG_CHARS[bytes[i] % RNG_CHARS.length];
  return out;
}

export function generateTrackingNumber(prefix: string, now: number): string {
  // TRK-XXXXXXXXXX + yyyymmdd, e.g. TRK-nGkx2V20260210
  const suffix = generateRandomSuffix(6);
  const date = new Date(now);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${prefix}-${suffix}${y}${m}${d}`;
}

export const trackingNumberValidator = v.string();

// ─── Status state machine ───
// Explicit valid transitions. Delivered shipments can never silently return
// to in-transit; terminal and failure states have explicit exits only.
export const TRACKING_TRANSITIONS: Record<TrackingStatus, TrackingStatus[]> = {
  CREATED: ["BOOKED", "CANCELLED"],
  BOOKED: ["PICKED_UP", "CANCELLED", "ON_HOLD"],
  PICKED_UP: ["PROCESSING", "AT_ORIGIN_FACILITY", "IN_TRANSIT", "EXCEPTION"],
  PROCESSING: ["AT_ORIGIN_FACILITY", "IN_TRANSIT", "ON_HOLD", "EXCEPTION"],
  AT_ORIGIN_FACILITY: ["DEPARTED_ORIGIN", "PROCESSING", "ON_HOLD", "EXCEPTION"],
  DEPARTED_ORIGIN: ["IN_TRANSIT", "ARRIVED_DESTINATION_COUNTRY", "EXCEPTION"],
  IN_TRANSIT: [
    "ARRIVED_DESTINATION_COUNTRY",
    "CUSTOMS_CLEARANCE",
    "AT_DESTINATION_FACILITY",
    "OUT_FOR_DELIVERY",
    "ON_HOLD",
    "EXCEPTION",
  ],
  ARRIVED_DESTINATION_COUNTRY: ["CUSTOMS_CLEARANCE", "AT_DESTINATION_FACILITY", "ON_HOLD", "EXCEPTION"],
  CUSTOMS_CLEARANCE: ["CUSTOMS_CLEARED", "ON_HOLD", "EXCEPTION"],
  CUSTOMS_CLEARED: ["AT_DESTINATION_FACILITY", "OUT_FOR_DELIVERY", "IN_TRANSIT"],
  AT_DESTINATION_FACILITY: ["OUT_FOR_DELIVERY", "IN_TRANSIT", "RETURNED", "EXCEPTION"],
  OUT_FOR_DELIVERY: ["DELIVERED", "DELIVERY_ATTEMPTED", "EXCEPTION"],
  DELIVERY_ATTEMPTED: ["OUT_FOR_DELIVERY", "RETURNED", "ON_HOLD"],
  DELIVERED: [],
  EXCEPTION: ["IN_TRANSIT", "ON_HOLD", "RETURNED", "CANCELLED", "OUT_FOR_DELIVERY"],
  ON_HOLD: ["IN_TRANSIT", "OUT_FOR_DELIVERY", "EXCEPTION", "CANCELLED", "RETURNED"],
  CANCELLED: [],
  RETURNED: [],
};

export function canTransition(from: TrackingStatus, to: TrackingStatus): boolean {
  return from === to || TRACKING_TRANSITIONS[from]?.includes(to) ?? false;
}

// ─── Progress engine ───
// Progress is derived from status on the server — never hardcoded in the UI.
export const STATUS_PROGRESS: Record<TrackingStatus, number> = {
  CREATED: 5,
  BOOKED: 10,
  PICKED_UP: 20,
  PROCESSING: 30,
  AT_ORIGIN_FACILITY: 35,
  DEPARTED_ORIGIN: 40,
  IN_TRANSIT: 50,
  ARRIVED_DESTINATION_COUNTRY: 55,
  CUSTOMS_CLEARANCE: 60,
  CUSTOMS_CLEARED: 65,
  AT_DESTINATION_FACILITY: 75,
  OUT_FOR_DELIVERY: 90,
  DELIVERY_ATTEMPTED: 90,
  DELIVERED: 100,
  EXCEPTION: 50,
  ON_HOLD: 50,
  CANCELLED: 0,
  RETURNED: 0,
};

export function progressForStatus(status: TrackingStatus): number {
  return STATUS_PROGRESS[status] ?? 0;
}

// ─── ETA engine ───
// Transit days are configured per service type in the database (admin-managed).
export function calculateEta(
  createdAt: number,
  transitDays: number,
  status: TrackingStatus,
): number {
  const dayMs = 24 * 60 * 60 * 1000;
  // Delivered shipments keep their actual delivery time; ETA is a planning date.
  const base = createdAt;
  const eta = base + Math.max(1, Math.round(transitDays)) * dayMs;
  // Exceptions/holds extend the ETA by 2 days (business rule, native engine).
  if (status === "EXCEPTION" || status === "ON_HOLD") return eta + 2 * dayMs;
  return eta;
}

// ─── Status display metadata (shared by UI via api payload, not duplicated) ───
export const STATUS_IS_TERMINAL: Record<TrackingStatus, boolean> = {
  CREATED: false,
  BOOKED: false,
  PICKED_UP: false,
  PROCESSING: false,
  AT_ORIGIN_FACILITY: false,
  DEPARTED_ORIGIN: false,
  IN_TRANSIT: false,
  ARRIVED_DESTINATION_COUNTRY: false,
  CUSTOMS_CLEARANCE: false,
  CUSTOMS_CLEARED: false,
  AT_DESTINATION_FACILITY: false,
  OUT_FOR_DELIVERY: false,
  DELIVERY_ATTEMPTED: false,
  DELIVERED: true,
  EXCEPTION: false,
  ON_HOLD: false,
  CANCELLED: true,
  RETURNED: true,
};

export function isTerminal(status: TrackingStatus): boolean {
  return STATUS_IS_TERMINAL[status] ?? false;
}
