import { describe, expect, test } from "bun:test";
import { api } from "../src/convex/_generated/api";
import { resolveFunctionName } from "../src/lib/neonClient";
import { formatNgn, formatUsd, DEFAULT_POINT_PACKAGES } from "../src/lib/pricing";
import { fmtMoney } from "../src/lib/money";
import { discoverMigrations, computeChecksum } from "../api/scripts/migrate.mjs";

describe("Neon adapter & currency formatting regression suite", () => {
  test("resolveFunctionName extracts exact module:fn name from Convex anyApi Proxies", () => {
    expect(resolveFunctionName(api.wallet.getBalance)).toBe("wallet:getBalance");
    expect(resolveFunctionName(api.points.getBalance)).toBe("points:getBalance");
    expect(resolveFunctionName(api.wallet.getLedger)).toBe("wallet:getLedger");
    expect(resolveFunctionName(api.shipments.listMy)).toBe("shipments:listMy");
    expect(resolveFunctionName(api.serviceHub.getOverview)).toBe("serviceHub:getOverview");
    expect(resolveFunctionName(api.adminApi.adminDashboard)).toBe("adminApi:adminDashboard");
    expect(resolveFunctionName(api.trackingQueries.publicTracking)).toBe("trackingQueries:publicTracking");
    expect(resolveFunctionName("custom:query")).toBe("custom:query");
    expect(resolveFunctionName(null)).toBe("");
  });

  test("formatNgn and fmtMoney never produce ₦[object Object] or ₦NaN for any input shape", () => {
    expect(formatNgn(0)).toBe("₦0");
    expect(formatNgn(1500)).toBe("₦1,500");
    expect(formatNgn(-2500)).toBe("-₦2,500");
    expect(formatNgn(NaN)).toBe("₦0");
    expect(formatNgn(undefined)).toBe("₦0");
    expect(formatNgn(null)).toBe("₦0");
    expect(formatNgn({ balance: 0, ngnEquivalent: 0, currency: "NGN" })).toBe("₦0");
    expect(formatNgn({ walletBalanceNgn: 5000 })).toBe("₦5,000");
    expect(formatNgn("12500")).toBe("₦12,500");
    expect(formatNgn("invalid")).toBe("₦0");

    expect(fmtMoney({ balance: 0 } as never, "NGN")).toBe("₦0.00");
    expect(fmtMoney({ walletBalanceNgn: 150000 } as never, "NGN")).toBe("₦1,500.00");
    expect(fmtMoney(NaN, "NGN")).toBe("₦0.00");
    expect(fmtMoney(undefined, "NGN")).toBe("₦0.00");
  });

  test("formatUsd never produces $[object Object] or $NaN for any input shape", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(12.5)).toBe("$12.50");
    expect(formatUsd(NaN)).toBe("$0.00");
    expect(formatUsd(undefined)).toBe("$0.00");
    expect(formatUsd({ balance: 25 })).toBe("$25.00");
  });

  test("DEFAULT_POINT_PACKAGES provides valid funding presets", () => {
    expect(DEFAULT_POINT_PACKAGES.length).toBeGreaterThanOrEqual(3);
    for (const pkg of DEFAULT_POINT_PACKAGES) {
      expect(typeof pkg.id).toBe("string");
      expect(typeof pkg.name).toBe("string");
      expect(pkg.priceNgn).toBeGreaterThan(0);
      expect(pkg.points).toBeGreaterThan(0);
    }
  });

  test("ordered SQL migrations are discovered with deterministic SHA-256 checksums", () => {
    const migrations = discoverMigrations();
    expect(migrations.length).toBeGreaterThanOrEqual(6);
    expect(migrations.map((m) => m.version)).toEqual(["001", "002", "003", "004", "005", "006"]);
    for (const m of migrations) {
      expect(m.checksum).toMatch(/^[a-f0-9]{64}$/);
      expect(computeChecksum(m.sql)).toBe(m.checksum);
    }
  });
});

