import { describe, expect, test } from "bun:test";
import {
  TRACKING_TRANSITIONS,
  canTransition,
  calculateEta,
  generateRandomSuffix,
  generateTrackingNumber,
  isTerminal,
  progressForStatus,
} from "../src/convex/trackingEngine.ts";
import { encodeQr, qrToSvgPath } from "../src/lib/qr.ts";
import { code128Svg } from "../src/lib/barcode.ts";

const DAY = 24 * 60 * 60 * 1000;

describe("tracking engine — state machine", () => {
  test("allows the documented happy-path transitions", () => {
    expect(canTransition("CREATED", "BOOKED")).toBe(true);
    expect(canTransition("BOOKED", "PICKED_UP")).toBe(true);
    expect(canTransition("PICKED_UP", "PROCESSING")).toBe(true);
    expect(canTransition("PROCESSING", "IN_TRANSIT")).toBe(true);
    expect(canTransition("IN_TRANSIT", "OUT_FOR_DELIVERY")).toBe(true);
    expect(canTransition("OUT_FOR_DELIVERY", "DELIVERED")).toBe(true);
  });

  test("rejects invalid transitions", () => {
    expect(canTransition("CREATED", "DELIVERED")).toBe(false);
    expect(canTransition("DELIVERED", "IN_TRANSIT")).toBe(false);
    expect(canTransition("CANCELLED", "IN_TRANSIT")).toBe(false);
  });

  test("terminal statuses have no outgoing transitions", () => {
    for (const terminal of ["DELIVERED", "CANCELLED", "RETURNED"] as const) {
      expect(TRACKING_TRANSITIONS[terminal]).toHaveLength(0);
      expect(isTerminal(terminal)).toBe(true);
    }
    expect(isTerminal("IN_TRANSIT")).toBe(false);
  });
});

describe("tracking engine — progress", () => {
  test("reports the documented anchors", () => {
    expect(progressForStatus("CREATED")).toBe(5);
    expect(progressForStatus("IN_TRANSIT")).toBe(50);
    expect(progressForStatus("OUT_FOR_DELIVERY")).toBe(90);
    expect(progressForStatus("DELIVERED")).toBe(100);
  });

  test("never decreases along the happy path", () => {
    const path = [
      "CREATED",
      "BOOKED",
      "PICKED_UP",
      "PROCESSING",
      "AT_ORIGIN_FACILITY",
      "DEPARTED_ORIGIN",
      "IN_TRANSIT",
      "AT_DESTINATION_FACILITY",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ] as const;
    let last = -1;
    for (const status of path) {
      const value = progressForStatus(status);
      expect(value).toBeGreaterThanOrEqual(last);
      last = value;
    }
    expect(last).toBe(100);
  });
});

describe("tracking engine — ETA", () => {
  test("adds configured transit days beyond the creation date", () => {
    const created = Date.UTC(2026, 1, 10);
    expect(calculateEta(created, 3, "BOOKED")).toBe(created + 3 * DAY);
  });

  test("extends ETA for exceptions and holds", () => {
    const created = Date.UTC(2026, 1, 10);
    expect(calculateEta(created, 3, "EXCEPTION")).toBe(created + 5 * DAY);
    expect(calculateEta(created, 3, "ON_HOLD")).toBe(created + 5 * DAY);
  });

  test("clamps to a minimum of one day", () => {
    const created = Date.UTC(2026, 1, 10);
    expect(calculateEta(created, 0, "BOOKED")).toBe(created + DAY);
    expect(calculateEta(created, -5, "BOOKED")).toBe(created + DAY);
  });
});

describe("tracking engine — tracking numbers", () => {
  test("follows the TRK-XXXXXXYYYYMMDD format", () => {
    const value = generateTrackingNumber("TRK", Date.UTC(2026, 1, 10));
    expect(value).toMatch(/^TRK-[A-Z2-9]{6}20260210$/);
  });

  test("is effectively unique across generations", () => {
    const now = Date.UTC(2026, 1, 10);
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(generateTrackingNumber("TRK", now));
    expect(seen.size).toBe(500);
  });

  test("random suffix uses only unambiguous characters", () => {
    const suffix = generateRandomSuffix(64);
    expect(suffix).toHaveLength(64);
    expect(suffix).toMatch(/^[A-Z2-9]+$/);
  });
});

describe("QR encoder", () => {
  test("produces a square matrix with a valid QR version size", () => {
    const matrix = encodeQr("https://cloudie.app/track/TRK-ABC123");
    const size = matrix.length;
    expect(size).toBeGreaterThanOrEqual(21);
    expect((size - 17) % 4).toBe(0);
    for (const row of matrix) expect(row).toHaveLength(size);
  });

  test("includes the three finder patterns", () => {
    const matrix = encodeQr("CLOUDIE");
    const size = matrix.length;
    expect(matrix[0][0]).toBe(true);
    expect(matrix[0][size - 1]).toBe(true);
    expect(matrix[size - 1][0]).toBe(true);
    expect(matrix[size - 1][size - 1]).toBe(false);
  });

  test("encodes different payloads differently", () => {
    expect(JSON.stringify(encodeQr("A"))).not.toBe(JSON.stringify(encodeQr("B")));
  });

  test("renders an SVG path with a quiet-zone-aware size", () => {
    const { size, path } = qrToSvgPath("https://cloudie.app");
    expect(size).toBeGreaterThan(21);
    expect(path.length).toBeGreaterThan(0);
    expect(path.trimStart().startsWith("M")).toBe(true);
  });
});

describe("Code 128 barcode", () => {
  test("renders bars within the viewBox", () => {
    const { width, height, bars } = code128Svg("TRK-nGkx2V20260210");
    expect(width).toBeGreaterThan(0);
    expect(height).toBe(80);
    expect(bars.length).toBeGreaterThan(0);
    for (const bar of bars) {
      expect(bar.x).toBeGreaterThanOrEqual(0);
      expect(bar.x + bar.width).toBeLessThanOrEqual(width);
      expect(bar.width).toBeGreaterThan(0);
    }
  });

  test("is deterministic for identical input", () => {
    expect(code128Svg("CLOUDIE-123")).toEqual(code128Svg("CLOUDIE-123"));
  });

  test("differs between payloads", () => {
    expect(code128Svg("AAAA").bars).not.toEqual(code128Svg("BBBB").bars);
  });

  test("honours module width and height options", () => {
    const a = code128Svg("CLOUDIE", { moduleWidth: 1, height: 40 });
    const b = code128Svg("CLOUDIE", { moduleWidth: 4, height: 120 });
    expect(a.height).toBe(40);
    expect(b.height).toBe(120);
    expect(b.width).toBe(a.width * 4);
  });
});
