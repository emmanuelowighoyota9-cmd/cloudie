import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../src/convex/schema";
import { internal, api } from "../src/convex/_generated/api";
import { registerAdapter, getAdapter } from "../src/convex/vtuRegistry";
import { pairgateAdapter } from "../src/convex/vtuPairgate";
import { aidapayAdapter } from "../src/convex/providers/aidapay";
import { encrypt } from "../src/convex/lib/encryption";
import { assertAmountInRange } from "../src/convex/vtuInternal";
import {
  canonicalProductCode,
  composeProviderProductCode,
  effectiveProvider,
  resolvePointsCost,
  routeProduct,
} from "../src/convex/vtuServiceRouting";
import { vtuLedgerPurchaseKey } from "../src/lib/vtu";
import type { VtuProviderAdapter } from "../src/convex/vtuShared";

/**
 * Slice 3 tests: routing is a DECISION, read from data.
 *
 * What these pin down, in order of how much money they protect:
 *
 *   - a purchase that cannot be routed debits NOTHING
 *   - NO_ROUTE_AVAILABLE and PRODUCT_NOT_FOUND are distinguishable, because
 *     they have completely different operator fixes
 *   - a disabled or sandbox provider is SKIPPED rather than chosen, so an
 *     operator's preferred route cannot quietly take live money
 *   - the route is a SNAPSHOT: changing the routing table after dispatch does
 *     not move a purchase that is already in flight
 *   - the three levels of price precedence live in one function and resolve in
 *     the documented order
 */

const modules = {
  "src/convex/_generated/api.js": () => import("../src/convex/_generated/api.js"),
  "src/convex/_generated/server.js": () => import("../src/convex/_generated/server.js"),
  "src/convex/schema.ts": () => import("../src/convex/schema"),
  "src/convex/vtuHttp.ts": () => import("../src/convex/vtuHttp"),
  "src/convex/vtuProviderCall.ts": () => import("../src/convex/vtuProviderCall"),
  "src/convex/vtuProviderConfig.ts": () => import("../src/convex/vtuProviderConfig"),
  "src/convex/vtuProviderAdmin.ts": () => import("../src/convex/vtuProviderAdmin"),
  "src/convex/vtuServiceAdmin.ts": () => import("../src/convex/vtuServiceAdmin"),
  "src/convex/vtuServiceRouting.ts": () => import("../src/convex/vtuServiceRouting"),
  "src/convex/vtuRegistry.ts": () => import("../src/convex/vtuRegistry"),
  "src/convex/vtuInternal.ts": () => import("../src/convex/vtuInternal"),
  "src/convex/vtu.ts": () => import("../src/convex/vtu"),
  "src/convex/vtuShared.ts": () => import("../src/convex/vtuShared"),
  "src/convex/lib/encryption.ts": () => import("../src/convex/lib/encryption"),
  "src/convex/points.ts": () => import("../src/convex/points"),
  "src/convex/pricing.ts": () => import("../src/convex/pricing"),
  "src/convex/adminApi.ts": () => import("../src/convex/adminApi"),
  "src/convex/storage.ts": () => import("../src/convex/storage"),
};

type Harness = ReturnType<typeof convexTest>;

const SERVICE_CODE = "airtime.mtn.1000";
const PHONE = "08031234567";
/** NGN per point at the platform rate these tests leave in place. */
const RATE = 15;
/** ₦1,000 of airtime is ₦1,000 of wallet — the amount IS the price. */
const AIRTIME_PRICE = 1_000;
/** What the customer starts with, in NGN — the old 5,000-point figure at 15/point. */
const START_BALANCE = 5_000 * RATE;
const MASTER = "test-master-key-0123456789abcdef";

/**
 * Seeding a provider row needs a REAL sealed credential, because
 * `openForPurchase` decrypts before it dispatches and a placeholder ciphertext
 * fails closed with CREDENTIAL_CORRUPT — the correct behaviour, but it would
 * make the end-to-end tests assert on a refund instead of on routing.
 *
 * Scoped to this file with before/afterAll and restored afterwards, so it
 * cannot leak a master key into another test file sharing the process.
 */
beforeAll(() => {
  process.env.APP_MASTER_KEY = MASTER;
});

afterAll(() => {
  delete process.env.APP_MASTER_KEY;
});

async function seedUser(t: Harness, balance = START_BALANCE) {
  const now = Date.now();
  return t.run(async (ctx) =>
    ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      walletBalanceNgn: balance,
      createdAt: now,
    }),
  );
}

async function seedProvider(
  t: Harness,
  row: { name: string; status?: "active" | "sandbox" | "disabled"; priority?: number },
) {
  const now = Date.now();
  const sealed = await encrypt(`key_${row.name}`);
  await t.run(async (ctx) =>
    ctx.db.insert("vtuProviders", {
      displayName: row.name,
      status: "active",
      baseUrl: "https://api.example.com",
      encryptedApiKey: sealed,
      priority: 100,
      createdAt: now,
      updatedAt: now,
      ...row,
    } as any),
  );
}

async function seedProduct(
  t: Harness,
  row: Partial<{
    productCode: string;
    serviceType: "airtime" | "data";
    active: boolean;
    displayName: string;
  }> = {},
) {
  const now = Date.now();
  const productCode = row.productCode ?? "airtime-mtn";
  await t.run(async (ctx) =>
    ctx.db.insert("vtuServiceCatalog", {
      serviceType: "airtime",
      productCode,
      displayName: row.displayName ?? "MTN Airtime",
      customerIdentifierLabel: "Phone number",
      requiresAmount: true,
      requiresPackageCode: false,
      minAmount: 100,
      maxAmount: 100_000,
      active: true,
      createdAt: now,
      updatedAt: now,
      ...row,
    } as any),
  );
  return productCode;
}

async function seedRoute(
  t: Harness,
  row: {
    productCode?: string;
    provider: string;
    providerProductCode?: string;
    pointsCostOverride?: number;
    priority?: number;
    active?: boolean;
  },
) {
  const now = Date.now();
  await t.run(async (ctx) =>
    ctx.db.insert("vtuServiceRouting", {
      productCode: row.productCode ?? "airtime-mtn",
      provider: row.provider,
      providerProductCode: row.providerProductCode ?? "airtime.mtn.{amount}",
      priority: row.priority ?? 1,
      active: true,
      createdAt: now,
      updatedAt: now,
      ...(row.pointsCostOverride !== undefined
        ? { pointsCostOverride: row.pointsCostOverride }
        : {}),
      ...(row.active !== undefined ? { active: row.active } : {}),
    } as any),
  );
}

const begin = (args: any) => (t: Harness) =>
  t.mutation(internal.vtuInternal.beginPurchase, args);

/** The authoritative monetary balance: the NGN wallet, not the retired points field. */
const balanceOf = (t: Harness, userId: any) =>
  t.run(async (ctx) => (await ctx.db.get(userId))?.walletBalanceNgn ?? 0);

const txOf = (t: Harness, id: any) => t.run(async (ctx) => ctx.db.get(id));

const txCount = (t: Harness) =>
  t.run(async (ctx) => ctx.db.query("vtuTransactions").collect().then((r) => r.length));

const claims = (t: Harness) => t.run(async (ctx) => ctx.db.query("vtuIdempotency").collect());

/** Call the pure routing function against the harness's own context. */
const route = (productCode: string) => (t: Harness) =>
  t.run(async (ctx) => routeProduct(ctx as any, productCode));

// ─── The failures that must never charge anyone ─────────────────────

describe("an unroutable purchase debits nothing", () => {
  test("an unknown product is PRODUCT_NOT_FOUND, and the balance is untouched", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedProvider(t, { name: "pairgate" });
    // No catalog row at all, so even the slice-1 product is unknown.
    await seedProduct(t, { productCode: "data-mtn-1gb-30d" });

    const result: any = await route("airtime-mtn")(t);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("PRODUCT_NOT_FOUND");
    // The other product DOES exist, and its own code is a different failure.
    // That is the whole reason `productCode` is globally unique: a lookup
    // returns one row, so "no such product" and "nothing serves it" are
    // separable instead of both being a list every caller disambiguates.
    const other: any = await route("data-mtn-1gb-30d")(t);
    expect(other.ok).toBe(false);
    expect(other.code).toBe("NO_ROUTE_AVAILABLE");

    await expect(
      begin({
        userId,
        clientRequestId: "req_missing_product",
        serviceCode: SERVICE_CODE,
        customerIdentifier: PHONE,
      })(t),
    ).rejects.toThrow();

    expect(await balanceOf(t, userId)).toBe(START_BALANCE);
    expect(await txCount(t)).toBe(0);
    // The claim is gone too, so the customer can retry the same request id
    // once the operator has fixed the configuration.
    expect(await claims(t)).toHaveLength(0);
  });

  test("a product with no route is NO_ROUTE_AVAILABLE — a DIFFERENT error", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedProvider(t, { name: "pairgate" });
    // Catalog row exists, provider exists, but nothing points at it.
    await seedProduct(t);

    const result: any = await route("airtime-mtn")(t);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("NO_ROUTE_AVAILABLE");
    expect(result.code).not.toBe("PRODUCT_NOT_FOUND");

    await expect(
      begin({
        userId,
        clientRequestId: "req_no_route",
        serviceCode: SERVICE_CODE,
        customerIdentifier: PHONE,
      })(t),
    ).rejects.toThrow();

    expect(await balanceOf(t, userId)).toBe(START_BALANCE);
    expect(await txCount(t)).toBe(0);
  });

  test("an inactive product is refused with its own code, not 'not found'", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedProvider(t, { name: "pairgate" });
    await seedProduct(t, { active: false });
    await seedRoute(t, { provider: "pairgate" });

    const result: any = await route("airtime-mtn")(t);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("PRODUCT_INACTIVE");

    await expect(
      begin({
        userId,
        clientRequestId: "req_inactive_product",
        serviceCode: SERVICE_CODE,
        customerIdentifier: PHONE,
      })(t),
    ).rejects.toThrow();
    expect(await balanceOf(t, userId)).toBe(START_BALANCE);
  });
});

// ─── Ordering and eligibility ───────────────────────────────────────

describe("routing picks the first eligible candidate", () => {
  test("the lower route priority wins", async () => {
    const t = convexTest(schema, modules);
    await seedProvider(t, { name: "alpha" });
    await seedProvider(t, { name: "beta" });
    await seedProduct(t);
    await seedRoute(t, { provider: "alpha", priority: 1 });
    await seedRoute(t, { provider: "beta", priority: 2 });

    const result: any = await route("airtime-mtn")(t);
    expect(result.ok).toBe(true);
    expect(result.winner.provider).toBe("alpha");
    // The full order is returned so an operator can see the standby.
    expect(result.candidates.map((c: any) => c.provider)).toEqual(["alpha", "beta"]);
  });

  test("a DISABLED provider at priority 1 is skipped and priority 2 wins", async () => {
    const t = convexTest(schema, modules);
    await seedProvider(t, { name: "alpha", status: "disabled" });
    await seedProvider(t, { name: "beta" });
    await seedProduct(t);
    await seedRoute(t, { provider: "alpha", priority: 1 });
    await seedRoute(t, { provider: "beta", priority: 2 });

    const result: any = await route("airtime-mtn")(t);
    expect(result.winner.provider).toBe("beta");
    // The skipped route is REPORTED, not hidden, so the operator can see why
    // their preferred provider lost.
    const alpha = result.candidates.find((c: any) => c.provider === "alpha");
    expect(alpha.eligible).toBe(false);
    expect(alpha.skippedBecause).toBe("provider_disabled");
  });

  test("a SANDBOX provider at priority 1 is skipped — sandbox keys never take live money", async () => {
    const t = convexTest(schema, modules);
    await seedProvider(t, { name: "alpha", status: "sandbox" });
    await seedProvider(t, { name: "beta" });
    await seedProduct(t);
    await seedRoute(t, { provider: "alpha", priority: 1 });
    await seedRoute(t, { provider: "beta", priority: 2 });

    const result: any = await route("airtime-mtn")(t);
    expect(result.winner.provider).toBe("beta");
    expect(
      result.candidates.find((c: any) => c.provider === "alpha").skippedBecause,
    ).toBe("provider_sandbox");
  });

  test("a route with no provider row is skipped, not a crash", async () => {
    const t = convexTest(schema, modules);
    await seedProvider(t, { name: "beta" });
    await seedProduct(t);
    await seedRoute(t, { provider: "ghost", priority: 1 });
    await seedRoute(t, { provider: "beta", priority: 2 });

    const result: any = await route("airtime-mtn")(t);
    expect(result.winner.provider).toBe("beta");
    expect(
      result.candidates.find((c: any) => c.provider === "ghost").skippedBecause,
    ).toBe("provider_missing");
  });

  test("every candidate ineligible is NO_ROUTE_AVAILABLE, listing why", async () => {
    const t = convexTest(schema, modules);
    await seedProvider(t, { name: "alpha", status: "sandbox" });
    await seedProduct(t);
    await seedRoute(t, { provider: "alpha", priority: 1 });

    const result: any = await route("airtime-mtn")(t);
    expect(result.ok).toBe(false);
    expect(result.code).toBe("NO_ROUTE_AVAILABLE");
    expect(result.skipped).toHaveLength(1);
    expect(result.skipped[0].skippedBecause).toBe("provider_sandbox");
  });

  test("an inactive route is not even a candidate", async () => {
    const t = convexTest(schema, modules);
    await seedProvider(t, { name: "alpha" });
    await seedProvider(t, { name: "beta" });
    await seedProduct(t);
    await seedRoute(t, { provider: "alpha", priority: 1, active: false });
    await seedRoute(t, { provider: "beta", priority: 2 });

    const result: any = await route("airtime-mtn")(t);
    expect(result.winner.provider).toBe("beta");
    expect(result.candidates.map((c: any) => c.provider)).toEqual(["beta"]);
  });

  test("an equal route priority falls back to the PROVIDER's priority", async () => {
    const t = convexTest(schema, modules);
    // `alpha` is named first alphabetically and has the better provider
    // priority, so the tie-break must be decided by priority, not by name.
    await seedProvider(t, { name: "alpha", priority: 50 });
    await seedProvider(t, { name: "beta", priority: 10 });
    await seedProduct(t);
    await seedRoute(t, { provider: "alpha", priority: 1 });
    await seedRoute(t, { provider: "beta", priority: 1 });

    const result: any = await route("airtime-mtn")(t);
    expect(result.winner.provider).toBe("beta");
  });

  test("a total tie is broken by name, so the winner never flaps", async () => {
    const t = convexTest(schema, modules);
    await seedProvider(t, { name: "zeta" });
    await seedProvider(t, { name: "alpha" });
    await seedProduct(t);
    await seedRoute(t, { provider: "zeta", priority: 1 });
    await seedRoute(t, { provider: "alpha", priority: 1 });

    const first: any = await route("airtime-mtn")(t);
    const second: any = await route("airtime-mtn")(t);
    expect(first.winner.provider).toBe("alpha");
    expect(second.winner.provider).toBe("alpha");
  });
});

// ─── The snapshot ───────────────────────────────────────────────────

describe("the route is snapshotted, not re-read at settlement", () => {
  test("the transaction records the route that was charged for", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedProvider(t, { name: "pairgate" });
    await seedProduct(t);
    await seedRoute(t, {
      provider: "pairgate",
      providerProductCode: "airtime.mtn.{amount}",
    });

    const reserved: any = await begin({
      userId,
      clientRequestId: "req_snapshot_write",
      serviceCode: SERVICE_CODE,
      customerIdentifier: PHONE,
    })(t);

    const tx: any = await txOf(t, reserved.transactionId);
    expect(tx.routedProvider).toBe("pairgate");
    // The AMOUNT is already filled in on the snapshot, so the adapter is handed
    // exactly the string slice 1 used to send.
    expect(tx.routedProviderProductCode).toBe("airtime.mtn.1000");
    expect(tx.provider).toBe("pairgate");
  });

  test("re-pointing the routing table does not move an in-flight purchase", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedProvider(t, { name: "pairgate" });
    await seedProvider(t, { name: "aidapay" });
    await seedProduct(t);
    await seedRoute(t, { provider: "pairgate", priority: 1 });
    await seedRoute(t, { provider: "aidapay", priority: 2 });

    const reserved: any = await begin({
      userId,
      clientRequestId: "req_snapshot_stable",
      serviceCode: SERVICE_CODE,
      customerIdentifier: PHONE,
    })(t);
    await t.mutation(internal.vtuInternal.markProcessing, {
      transactionId: reserved.transactionId,
    });
    await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: reserved.transactionId,
      source: "dispatch",
      verdict: {
        status: "confirmed",
        providerReference: "PG-REF-1",
        costNgn: 1000,
      },
    });

    // The operator now prefers AidaPay for MTN airtime.
    await t.run(async (ctx) => {
      const routes = await ctx.db.query("vtuServiceRouting").collect();
      const row = routes.find((r) => r.provider === "aidapay");
      await ctx.db.patch(row!._id, { priority: 0 });
    });

    // The already-dispatched purchase is untouched…
    const tx: any = await txOf(t, reserved.transactionId);
    expect(tx.routedProvider).toBe("pairgate");
    expect(tx.routedProviderProductCode).toBe("airtime.mtn.1000");

    // …and a NEW purchase goes to the new winner, which is the point of
    // routing being a decision rather than a constant.
    const next: any = await begin({
      userId,
      clientRequestId: "req_after_repoint",
      serviceCode: SERVICE_CODE,
      customerIdentifier: PHONE,
    })(t);
    const nextTx: any = await txOf(t, next.transactionId);
    expect(nextTx.routedProvider).toBe("aidapay");
  });

  test("the webhook matches the SNAPSHOT, so a re-pointed route cannot hijack settlement", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedProvider(t, { name: "pairgate" });
    await seedProvider(t, { name: "aidapay" });
    await seedProduct(t);
    await seedRoute(t, { provider: "pairgate", priority: 1 });
    await seedRoute(t, { provider: "aidapay", priority: 2 });

    const reserved: any = await begin({
      userId,
      clientRequestId: "req_webhook_snapshot",
      serviceCode: SERVICE_CODE,
      customerIdentifier: PHONE,
    })(t);
    await t.mutation(internal.vtuInternal.markProcessing, {
      transactionId: reserved.transactionId,
    });
    await t.mutation(internal.vtuInternal.markUnknown, {
      transactionId: reserved.transactionId,
      source: "dispatch",
      message: "no answer",
      providerReference: "REF-XYZ",
    });

    // Re-point the product at AidaPay AFTER Pairgate was dispatched.
    await t.run(async (ctx) => {
      const routes = await ctx.db.query("vtuServiceRouting").collect();
      await ctx.db.patch(routes.find((r) => r.provider === "aidapay")!._id, { priority: 0 });
    });

    // Now make the two provider columns DISAGREE. `routedProvider` is the
    // write-once snapshot; `provider` is the denormalised copy slice 1/2 read.
    // Nothing at write time keeps them in sync forever — a future migration or
    // a careless patch could drift them — so the test forces the drift and
    // asserts the SNAPSHOT is the one that settles. Without this, a webhook
    // reading either column would pass.
    await t.run(async (ctx) => {
      await ctx.db.patch(reserved.transactionId, { provider: "aidapay" });
    });

    // The AidaPay callback for Pairgate's reference must NOT match: the
    // snapshot says this transaction was Pairgate's, even though the
    // denormalised column now says otherwise.
    const wrong: any = await t.query(internal.vtuInternal.findByProviderReference, {
      provider: "aidapay",
      providerReference: "REF-XYZ",
    });
    expect(wrong).toBeNull();

    // The provider that actually dispatched it still matches.
    const right: any = await t.query(internal.vtuInternal.findByProviderReference, {
      provider: "pairgate",
      providerReference: "REF-XYZ",
    });
    expect(right).toBe(String(reserved.transactionId));
  });

  test("a pre-slice-3 row with no snapshot is treated as implicitly pairgate", async () => {
    // Documented rule: null routedProvider means "routed to pairgate", and
    // `effectiveProvider` is the ONLY place that knows it.
    expect(effectiveProvider({ routedProvider: null, provider: "pairgate" })).toBe("pairgate");
    expect(effectiveProvider({ routedProvider: "aidapay", provider: "pairgate" })).toBe(
      "aidapay",
    );

    const t = convexTest(schema, modules);
    const now = Date.now();
    const userId = await seedUser(t);
    const legacyId = await t.run(async (ctx) =>
      ctx.db.insert("vtuTransactions", {
        userId,
        clientRequestId: "legacy_req",
        serviceCode: SERVICE_CODE,
        provider: "pairgate",
        status: "processing",
        customerIdentifier: "0803****4567",
        nairaPrice: 1000,
        ngnPerPoint: 15,
        pointsDebited: 67,
        providerReference: "LEGACY-1",
        idempotencyKey: "vtu:purchase:legacy_req",
        createdAt: now,
        updatedAt: now,
      } as any),
    );

    const found: any = await t.query(internal.vtuInternal.findByProviderReference, {
      provider: "pairgate",
      providerReference: "LEGACY-1",
    });
    expect(found).toBe(String(legacyId));
  });
});

// ─── Price precedence ───────────────────────────────────────────────

describe("points cost precedence: route > pointPricing > conversion", () => {
  const costFor = (t: Harness, provider: string | null, serviceCode = SERVICE_CODE) =>
    t.run(async (ctx) =>
      resolvePointsCost(ctx as any, {
        productCode: "airtime-mtn",
        serviceCode,
        provider,
        nairaPrice: 1000,
      }),
    );

  test("all three levels set: the ROUTING row wins", async () => {
    const t = convexTest(schema, modules);
    await seedProvider(t, { name: "aidapay" });
    await seedProduct(t);
    await seedRoute(t, { provider: "aidapay", pointsCostOverride: 42 });
    await t.run(async (ctx) =>
      ctx.db.insert("pointPricing", {
        serviceCode: SERVICE_CODE,
        priceNgn: 1000,
        pointsCost: 55,
        active: true,
        isActive: true,
        createdAt: Date.now(),
      } as any),
    );

    const cost: any = await costFor(t, "aidapay");
    expect(cost.points).toBe(42);
    expect(cost.source).toBe("routing_override");
  });

  test("routing row removed: the pointPricing override takes over", async () => {
    const t = convexTest(schema, modules);
    await seedProvider(t, { name: "aidapay" });
    await seedProduct(t);
    await seedRoute(t, { provider: "aidapay" });
    await t.run(async (ctx) =>
      ctx.db.insert("pointPricing", {
        serviceCode: SERVICE_CODE,
        priceNgn: 1000,
        pointsCost: 55,
        active: true,
        isActive: true,
        createdAt: Date.now(),
      } as any),
    );

    const cost: any = await costFor(t, "aidapay");
    expect(cost.points).toBe(55);
    expect(cost.source).toBe("point_pricing_override");
  });

  test("both removed: the default conversion applies", async () => {
    const t = convexTest(schema, modules);
    await seedProvider(t, { name: "aidapay" });
    await seedProduct(t);
    await seedRoute(t, { provider: "aidapay" });

    // ₦1,000 at 15 naira/point = 66.67, rounded UP to 67.
    const cost: any = await costFor(t, "aidapay");
    expect(cost.points).toBe(67);
    expect(cost.source).toBe("default_conversion");
  });

  test("a route with no provider cannot produce a routing override", async () => {
    // The override is the only level that knows WHICH PROVIDER is selling, so
    // with no provider it is skipped and the next level applies.
    const t = convexTest(schema, modules);
    await seedProduct(t);
    await seedRoute(t, { provider: "aidapay", pointsCostOverride: 42 });

    const cost: any = await costFor(t, null);
    expect(cost.points).toBe(67);
    expect(cost.source).toBe("default_conversion");
  });

  test("an INACTIVE routing row's override is ignored", async () => {
    const t = convexTest(schema, modules);
    await seedProvider(t, { name: "aidapay" });
    await seedProduct(t);
    await seedRoute(t, { provider: "aidapay", pointsCostOverride: 42, active: false });

    const cost: any = await costFor(t, "aidapay");
    expect(cost.points).toBe(67);
  });

  test("an INACTIVE pointPricing row is ignored — `active` is the VTU switch, not `isActive`", async () => {
    // The trap this pins: `pointPricing` carries two flags. `isActive` belongs
    // to the document engine; gating on it would silently kill VTU overrides.
    const t = convexTest(schema, modules);
    await seedProduct(t);
    await t.run(async (ctx) =>
      ctx.db.insert("pointPricing", {
        serviceCode: SERVICE_CODE,
        priceNgn: 1000,
        pointsCost: 55,
        active: false,
        isActive: true,
        createdAt: Date.now(),
      } as any),
    );

    const cost: any = await costFor(t, null);
    expect(cost.points).toBe(67);
    expect(cost.source).toBe("default_conversion");
  });

  test("`isActive: false` with `active: true` is still a LIVE VTU override", async () => {
    const t = convexTest(schema, modules);
    await seedProduct(t);
    await t.run(async (ctx) =>
      ctx.db.insert("pointPricing", {
        serviceCode: SERVICE_CODE,
        priceNgn: 1000,
        pointsCost: 55,
        active: true,
        isActive: false,
        createdAt: Date.now(),
      } as any),
    );

    const cost: any = await costFor(t, null);
    expect(cost.points).toBe(55);
    expect(cost.source).toBe("point_pricing_override");
  });

  test("the purchase mutation charges the ROUTING row's price, not the default", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedProvider(t, { name: "aidapay" });
    await seedProduct(t);
    await seedRoute(t, { provider: "aidapay", pointsCostOverride: 42 });

    const reserved: any = await begin({
      userId,
      clientRequestId: "req_override_charged",
      serviceCode: SERVICE_CODE,
      customerIdentifier: PHONE,
    })(t);

    expect(reserved.pointsDebited).toBe(42);
    // The override is what the POINTS figure comes from — not what the wallet
    // takes. The wallet is debited the naira price of the airtime being bought,
    // so a route whose override only names points no longer discounts the
    // charge. Pinned as-is so the gap is visible rather than assumed away.
    expect(await balanceOf(t, userId)).toBe(START_BALANCE - AIRTIME_PRICE);

    const ledger = await t.run(async (ctx) =>
      ctx.db
        .query("walletLedger")
        .withIndex("by_idempotency", (q: any) =>
          q.eq("idempotencyKey", vtuLedgerPurchaseKey(reserved.transactionId)),
        )
        .first(),
    );
    expect(ledger.amountNgn).toBe(-AIRTIME_PRICE);
  });
});

// ─── Provider product code composition ──────────────────────────────

describe("the provider product code carries the amount", () => {
  test("{amount} is filled in; a code without it is untouched", () => {
    expect(composeProviderProductCode("airtime.mtn.{amount}", 1000)).toBe("airtime.mtn.1000");
    // AidaPay-style fixed codes must pass through byte-for-byte.
    expect(composeProviderProductCode("mtn-data-1gb-30d", 1000)).toBe("mtn-data-1gb-30d");
    expect(composeProviderProductCode("mtn-data-1gb-30d", undefined)).toBe(
      "mtn-data-1gb-30d",
    );
  });

  test("an unresolvable {amount} is thrown on rather than sent to the provider", () => {
    expect(() => composeProviderProductCode("airtime.mtn.{amount}", undefined)).toThrow();
  });

  test("a service code maps to its canonical product", () => {
    expect(canonicalProductCode("airtime.mtn.1000")).toBe("airtime-mtn");
    expect(canonicalProductCode("airtime.glo.500")).toBe("airtime-glo");
    expect(canonicalProductCode("nonsense")).toBeNull();
  });
});

// ─── The migration ──────────────────────────────────────────────────

describe("the catalog migration is idempotent and non-destructive", () => {
  async function adminClient(t: Harness) {
    const adminId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        name: "Root",
        email: "root@example.com",
        role: "admin",
        walletBalanceNgn: 0,
        createdAt: Date.now(),
      }),
    );
    return { client: t.withIdentity({ subject: adminId }), adminId };
  }

  test("it refuses to seed when the provider does not exist yet", async () => {
    const t = convexTest(schema, modules);
    const { client } = await adminClient(t);

    const res: any = await client.mutation(api.vtuServiceAdmin.migrateVtuServiceCatalog, {});
    expect(res.action).toBe("blocked");
    // Nothing was written: a route to a provider that does not exist can never
    // be chosen, so seeding one would only hide the real problem.
    expect(await txCount(t)).toBe(0);
    const routes = await t.run(async (ctx) => ctx.db.query("vtuServiceRouting").collect());
    expect(routes).toHaveLength(0);
  });

  test("inserted, then noop, then noop — and admin edits survive re-runs", async () => {
    const t = convexTest(schema, modules);
    const { client } = await adminClient(t);
    await seedProvider(t, { name: "pairgate", status: "sandbox" });

    const first: any = await client.mutation(api.vtuServiceAdmin.migrateVtuServiceCatalog, {});
    expect(first.action).toBe("inserted");

    const product: any = await t.run(async (ctx) =>
      ctx.db
        .query("vtuServiceCatalog")
        .withIndex("by_productCode", (q: any) => q.eq("productCode", "airtime-mtn"))
        .unique(),
    );
    // The seeded bounds are exactly the ones `parseServiceCode` already
    // enforced in code, so moving them into data widens nothing.
    expect(product.minAmount).toBe(100);
    expect(product.maxAmount).toBe(100_000);
    expect(product.requiresAmount).toBe(true);

    const seededRoute: any = await t.run(async (ctx) =>
      ctx.db
        .query("vtuServiceRouting")
        .withIndex("by_productCode_provider", (q: any) =>
          q.eq("productCode", "airtime-mtn").eq("provider", "pairgate"),
        )
        .unique(),
    );
    // Composes to the exact string slice 1 sent, so the wire bytes are
    // unchanged.
    expect(seededRoute.providerProductCode).toBe("airtime.mtn.{amount}");
    expect(seededRoute.priority).toBe(1);

    // The operator re-points the product at AidaPay…
    await seedProvider(t, { name: "aidapay" });
    await client.mutation(api.vtuServiceAdmin.createRoute, {
      productCode: "airtime-mtn",
      provider: "aidapay",
      providerProductCode: "mtn-airtime",
      priority: 0,
    });

    // …and re-running the migration must not undo that.
    const second: any = await client.mutation(api.vtuServiceAdmin.migrateVtuServiceCatalog, {});
    expect(second.action).toBe("noop");
    const third: any = await client.mutation(api.vtuServiceAdmin.migrateVtuServiceCatalog, {});
    expect(third.action).toBe("noop");

    const routes = await t.run(async (ctx) => ctx.db.query("vtuServiceRouting").collect());
    expect(routes).toHaveLength(2);
    const products = await t.run(async (ctx) => ctx.db.query("vtuServiceCatalog").collect());
    expect(products).toHaveLength(1);

    // The operator's priority-0 route is still the one that wins.
    const decided: any = await route("airtime-mtn")(t);
    expect(decided.winner.provider).toBe("aidapay");
  });

  test("a duplicate (product, provider) pair is refused", async () => {
    const t = convexTest(schema, modules);
    const { client } = await adminClient(t);
    await seedProvider(t, { name: "pairgate" });
    await client.mutation(api.vtuServiceAdmin.migrateVtuServiceCatalog, {});

    await expect(
      client.mutation(api.vtuServiceAdmin.createRoute, {
        productCode: "airtime-mtn",
        provider: "pairgate",
        providerProductCode: "other",
      }),
    ).rejects.toThrow();
  });
});

// ─── The preview runs the real algorithm ────────────────────────────

describe("the admin preview is the real algorithm, read-only", () => {
  test("it reports the same winner the purchase would pick", async () => {
    const t = convexTest(schema, modules);
    await seedProvider(t, { name: "alpha", status: "sandbox" });
    await seedProvider(t, { name: "beta" });
    await seedProduct(t);
    await seedRoute(t, { provider: "alpha", priority: 1 });
    await seedRoute(t, { provider: "beta", priority: 2 });

    const adminId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        name: "Root",
        email: "root@example.com",
        role: "admin",
        walletBalanceNgn: 0,
        createdAt: Date.now(),
      }),
    );
    const preview: any = await t
      .withIdentity({ subject: adminId })
      .query(api.vtuServiceAdmin.previewRoute, { productCode: "airtime-mtn" });

    expect(preview.winner.provider).toBe("beta");
    // Identical to what the purchase path computes, because it IS the same
    // function — not a reimplementation that could drift.
    const direct: any = await route("airtime-mtn")(t);
    expect(preview.winner.provider).toBe(direct.winner.provider);

    // Nothing was written by looking.
    expect(await txCount(t)).toBe(0);
  });
});

// ─── Slice 2 still holds ────────────────────────────────────────────

describe("routing does not reintroduce a hard-coded provider", () => {
  test("a second adapter is selected purely by data, with no code change", async () => {
    const seen: { productCode: string }[] = [];
    const stub: VtuProviderAdapter = {
      name: "aidapay",
      displayName: "StubCo",
      async purchase(req) {
        seen.push({ productCode: req.productCode });
        return { status: "success", providerReference: "AP-1", costNgn: 1000, raw: {} };
      },
      verifyAndParseCallback() {
        return null;
      },
      async verify() {
        return { status: "unknown", message: "stub", raw: {} };
      },
    };
    registerAdapter(stub);

    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedProvider(t, { name: "pairgate" });
    await seedProvider(t, { name: "aidapay" });
    await seedProduct(t);
    // The stub's code is a FIXED id, with no amount token — exactly the shape
    // AidaPay uses, and the shape Pairgate cannot use.
    await seedRoute(t, { provider: "aidapay", priority: 1, providerProductCode: "mtn-airtime" });
    await seedRoute(t, { provider: "pairgate", priority: 2 });

    try {
      const result: any = await t
        .withIdentity({ subject: userId })
        .action(api.vtuHttp.purchaseVtu, {
          clientRequestId: "req_second_provider",
          serviceCode: SERVICE_CODE,
          customerIdentifier: PHONE,
        });

      expect(result.status).toBe("confirmed");
      expect(seen).toHaveLength(1);
      // The adapter is handed ITS OWN product code, not the platform's.
      expect(seen[0].productCode).toBe("mtn-airtime");
      expect(getAdapter("aidapay")).not.toBeNull();
    } finally {
      // Restore the REAL AidaPay adapter. The stub is keyed "aidapay", so
      // re-registering Pairgate would restore the wrong slot and leave the
      // stub in the registry for every later test file in the process —
      // which is how a webhook test ends up verifying callbacks against a
      // stub that does not verify anything.
      registerAdapter(aidapayAdapter);
    }
  });

  test("the package code reaches the adapter untouched when one is configured", async () => {
    const seen: { packageCode?: string }[] = [];
    const stub: VtuProviderAdapter = {
      name: "aidapay",
      displayName: "StubCo",
      async purchase(req) {
        seen.push({ packageCode: req.providerPackageCode });
        return { status: "success", providerReference: "AP-2", costNgn: 1000, raw: {} };
      },
      verifyAndParseCallback() {
        return null;
      },
      async verify() {
        return { status: "unknown", message: "stub", raw: {} };
      },
    };
    registerAdapter(stub);

    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedProvider(t, { name: "aidapay" });
    await seedProduct(t);
    await seedRoute(t, { provider: "aidapay", providerProductCode: "mtn-data" });
    await t.run(async (ctx) => {
      const row = await ctx.db.query("vtuServiceRouting").first();
      await ctx.db.patch(row!._id, { providerPackageCode: "1GB_30D" });
    });

    try {
      await t.withIdentity({ subject: userId }).action(api.vtuHttp.purchaseVtu, {
        clientRequestId: "req_package_code",
        serviceCode: SERVICE_CODE,
        customerIdentifier: PHONE,
      });
      expect(seen[0].packageCode).toBe("1GB_30D");
    } finally {
      registerAdapter(aidapayAdapter);
    }
  });
});

// ─── The catalog bounds are load-bearing ───────────────────────────

describe("the catalog row's amount bounds are enforced, not documented", () => {
  /** Widen or narrow the seeded row's bounds and re-read it. */
  async function setBounds(t: Harness, bounds: { minAmount?: number; maxAmount?: number }) {
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("vtuServiceCatalog")
        .withIndex("by_productCode", (q: any) => q.eq("productCode", "airtime-mtn"))
        .unique();
      await ctx.db.patch(row!._id, bounds);
    });
  }

  test("the seeded bounds match what parseServiceCode already enforced", async () => {
    const t = convexTest(schema, modules);
    const product = await seedProduct(t);
    // If the migration seeds different numbers from these, slice 3 silently
    // widened or narrowed what customers could buy. Pin them.
    const row: any = await t.run(async (ctx) =>
      ctx.db
        .query("vtuServiceCatalog")
        .withIndex("by_productCode", (q: any) => q.eq("productCode", product))
        .unique(),
    );
    expect(row.minAmount).toBe(100);
    expect(row.maxAmount).toBe(100_000);
  });

  test("an amount inside the row's bounds is accepted", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedProvider(t, { name: "pairgate" });
    await seedProduct(t);
    await seedRoute(t, { provider: "pairgate" });
    await setBounds(t, { minAmount: 500, maxAmount: 2000 });

    const reserved: any = await begin({
      userId,
      clientRequestId: "req_within_bounds",
      serviceCode: "airtime.mtn.1000",
      customerIdentifier: PHONE,
    })(t);
    expect(reserved.pointsDebited).toBe(67);
    expect(await balanceOf(t, userId)).toBe(START_BALANCE - AIRTIME_PRICE);
  });

  test("an amount BELOW the row's min is refused and debits nothing", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedProvider(t, { name: "pairgate" });
    await seedProduct(t);
    await seedRoute(t, { provider: "pairgate" });
    // ₦200 is a real slice-1 offer and passes `parseServiceCode`; only the
    // CATALOG row knows this product now starts at ₦500.
    await setBounds(t, { minAmount: 500, maxAmount: 2000 });

    await expect(
      begin({
        userId,
        clientRequestId: "req_below_min",
        serviceCode: "airtime.mtn.200",
        customerIdentifier: PHONE,
      })(t),
    ).rejects.toThrow();

    expect(await balanceOf(t, userId)).toBe(START_BALANCE);
    expect(await txCount(t)).toBe(0);
    expect(await claims(t)).toHaveLength(0);
  });

  test("an amount ABOVE the row's max is refused and debits nothing", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedProvider(t, { name: "pairgate" });
    await seedProduct(t);
    await seedRoute(t, { provider: "pairgate" });
    await setBounds(t, { minAmount: 100, maxAmount: 1000 });

    await expect(
      begin({
        userId,
        clientRequestId: "req_above_max",
        serviceCode: "airtime.mtn.2000",
        customerIdentifier: PHONE,
      })(t),
    ).rejects.toThrow();

    expect(await balanceOf(t, userId)).toBe(START_BALANCE);
    expect(await txCount(t)).toBe(0);
  });

  test("the refusal carries its OWN code, distinct from every routing code", async () => {
    // An operator problem and a customer input problem need different words on
    // the page, so they must not arrive under the same code.
    let thrown: any = null;
    try {
      assertAmountInRange({ minAmount: 100, maxAmount: 100_000 }, 99);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).not.toBeNull();
    expect(thrown.code).toBe("AMOUNT_OUT_OF_RANGE");
    // The three routing codes are the only other things a purchase can be
    // refused with; none of them may be confused with this one.
    for (const code of ["PRODUCT_NOT_FOUND", "PRODUCT_INACTIVE", "NO_ROUTE_AVAILABLE"]) {
      expect(thrown.code).not.toBe(code);
    }
  });

  test("the action reports AMOUNT_OUT_OF_RANGE and debits nothing", async () => {
    // The refusal has to survive the mutation -> action boundary as a CODE,
    // because that is what the page branches on. Convex serialises the thrown
    // error, so only the property survives — which is why it is a plain field.
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedProvider(t, { name: "pairgate" });
    await seedProduct(t);
    await seedRoute(t, { provider: "pairgate" });
    await setBounds(t, { minAmount: 5000, maxAmount: 20000 });

    const result: any = await t
      .withIdentity({ subject: userId })
      .action(api.vtuHttp.purchaseVtu, {
        clientRequestId: "req_range_action",
        serviceCode: "airtime.mtn.1000",
        customerIdentifier: PHONE,
      });

    expect(result.status).toBe("rejected");
    expect(result.code).toBe("AMOUNT_OUT_OF_RANGE");
    expect(await balanceOf(t, userId)).toBe(START_BALANCE);
    expect(await txCount(t)).toBe(0);
  });

  test("absent bounds mean unbounded, not zero-to-zero", async () => {
    // A fixed-price product with no minAmount is not refusing everything.
    expect(() => assertAmountInRange({}, 1)).not.toThrow();
    expect(() => assertAmountInRange({ minAmount: 100 }, 99_999)).not.toThrow();
    expect(() => assertAmountInRange({ maxAmount: 100 }, 1)).not.toThrow();
    expect(() => assertAmountInRange({ minAmount: 100 }, 99)).toThrow();
    expect(() => assertAmountInRange({ maxAmount: 100 }, 101)).toThrow();
  });

  test("an inverted range is treated as unbounded rather than refusing everything", async () => {
    // A configuration mistake that silently blocked all sales would be worse
    // than a configuration mistake that is simply not enforced.
    expect(() => assertAmountInRange({ minAmount: 5000, maxAmount: 100 }, 1000)).not.toThrow();
  });
});

// ─── Display and charge cannot disagree ────────────────────────────

describe("the offer grid and the purchase agree on the price", () => {
  test("a routing-row override shows on the grid AND is charged", async () => {
    // The drift this exists to prevent: an operator sets pointsCostOverride,
    // the grid quotes the old conversion price, and the customer is charged a
    // different number than the one they were shown.
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedProvider(t, { name: "pairgate" });
    await seedProduct(t);
    await seedRoute(t, { provider: "pairgate", pointsCostOverride: 42 });

    const offers: any = await t.query(api.vtu.getAirtimeOffers, {});
    const quoted = offers.offers.find((o: any) => o.serviceCode === SERVICE_CODE);
    expect(quoted.points).toBe(42);
    expect(quoted.costSource).toBe("routing_override");

    const reserved: any = await begin({
      userId,
      clientRequestId: "req_grid_agrees",
      serviceCode: SERVICE_CODE,
      customerIdentifier: PHONE,
    })(t);

    // Quoted == charged. That is the whole assertion.
    expect(reserved.pointsDebited).toBe(quoted.points);
  });

  test("with no override the grid falls back to the conversion, as before", async () => {
    const t = convexTest(schema, modules);
    await seedProvider(t, { name: "pairgate" });
    await seedProduct(t);
    await seedRoute(t, { provider: "pairgate" });

    const offers: any = await t.query(api.vtu.getAirtimeOffers, {});
    const quoted = offers.offers.find((o: any) => o.serviceCode === SERVICE_CODE);
    // ₦1,000 at 15 naira/point = 67.
    expect(quoted.points).toBe(67);
    expect(quoted.costSource).toBe("default_conversion");
    expect(offers.ngnPerPoint).toBe(15);
  });

  test("a network with no live route is omitted rather than advertised", async () => {
    // Offering a product the purchase path will refuse with NO_ROUTE_AVAILABLE
    // is advertising something that does not exist.
    const t = convexTest(schema, modules);
    await seedProvider(t, { name: "pairgate", status: "sandbox" });
    await seedProduct(t, { productCode: "airtime-mtn" });
    await seedRoute(t, { provider: "pairgate" });

    const offers: any = await t.query(api.vtu.getAirtimeOffers, {});
    expect(offers.offers).toHaveLength(0);
  });

  test("a routed network's whole grid is present", async () => {
    const t = convexTest(schema, modules);
    await seedProvider(t, { name: "pairgate" });
    await seedProduct(t);
    await seedRoute(t, { provider: "pairgate" });

    const offers: any = await t.query(api.vtu.getAirtimeOffers, {});
    // 6 fixed amounts for the one routable network.
    expect(offers.offers).toHaveLength(6);
    expect(new Set(offers.offers.map((o: any) => o.network))).toEqual(new Set(["mtn"]));
  });

  test("previewCost quotes the ROUTED price and refuses an unroutable product", async () => {
    const t = convexTest(schema, modules);
    await seedProvider(t, { name: "pairgate" });
    await seedProduct(t);
    await seedRoute(t, { provider: "pairgate", pointsCostOverride: 42 });

    const preview: any = await t.query(api.vtu.previewCost, { serviceCode: SERVICE_CODE });
    expect(preview.points).toBe(42);
    expect(preview.costSource).toBe("routing_override");
    expect(preview.provider).toBe("pairgate");

    await t.run(async (ctx) => {
      const row = await ctx.db.query("vtuServiceRouting").first();
      await ctx.db.patch(row!._id, { active: false });
    });
    // No route means no preview, rather than a confident wrong number.
    const refused: any = await t.query(api.vtu.previewCost, { serviceCode: SERVICE_CODE });
    expect(refused).toBeNull();
  });

  test("only ONE cost function survives — the routing-unaware copy is gone", async () => {
    // A second implementation of a money rule drifts the moment an operator
    // changes the rule. This asserts there is exactly one left.
    const source = await Bun.file(
      new URL("../src/convex/vtuInternal.ts", import.meta.url),
    ).text();
    expect(source).not.toContain("export async function resolveCost");
    expect(source).not.toContain("resolveVtuPointsCost");
  });
});
