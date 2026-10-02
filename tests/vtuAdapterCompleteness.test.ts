import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../src/convex/schema";
import { api, internal } from "../src/convex/_generated/api";
import { encrypt } from "../src/convex/lib/encryption";
import { getAdapter, listAdapterNames, registerAdapter } from "../src/convex/vtuRegistry";
import { pairgateAdapter } from "../src/convex/vtuPairgate";
import type { VtuProviderAdapter } from "../src/convex/vtuShared";

/**
 * TypeScript's `VtuProviderAdapter` is erased at runtime.
 *
 * Every test here removes one method and asserts the failure is typed, fast,
 * and financially harmless — no dispatch, no stranded debit, no retry storm —
 * because those are the three ways a missing method can actually hurt: a
 * purchase that throws after the money moved, a webhook the aggregator retries
 * forever, and a poll that spends a rate-limited call to discover the method is
 * not there.
 *
 * The registry refuses an incomplete adapter at registration; the call sites
 * keep their own guard behind it, so both layers are exercised — registration
 * refusal below, and the call-site guard by removing a method *after* a
 * validated registration, which is the shape a factory or a mutated object
 * produces.
 *
 * `convex-test` is normally driven by Vitest, which supplies the module map via
 * `import.meta.glob`. Bun has no `import.meta.glob`, so the map is passed
 * explicitly as the second argument.
 */

const modules = {
  "src/convex/_generated/api.js": () => import("../src/convex/_generated/api.js"),
  "src/convex/_generated/server.js": () => import("../src/convex/_generated/server.js"),
  "src/convex/schema.ts": () => import("../src/convex/schema"),
  "src/convex/vtuHttp.ts": () => import("../src/convex/vtuHttp"),
  // The real HTTP router, so the webhook test can assert the STATUS CODE the
  // aggregator receives — "retries forever" versus "gives up with a typed
  // reason" is not visible from the action alone.
  "src/convex/http.ts": () => import("../src/convex/http"),
  "src/convex/vtuProviderCall.ts": () => import("../src/convex/vtuProviderCall"),
  "src/convex/vtuProviderConfig.ts": () => import("../src/convex/vtuProviderConfig"),
  "src/convex/vtuRegistry.ts": () => import("../src/convex/vtuRegistry"),
  "src/convex/vtuInternal.ts": () => import("../src/convex/vtuInternal"),
  "src/convex/vtuServiceRouting.ts": () => import("../src/convex/vtuServiceRouting"),
  "src/convex/vtuShared.ts": () => import("../src/convex/vtuShared"),
  "src/convex/lib/encryption.ts": () => import("../src/convex/lib/encryption"),
  "src/convex/points.ts": () => import("../src/convex/points"),
  "src/convex/pricing.ts": () => import("../src/convex/pricing"),
  "src/convex/adminApi.ts": () => import("../src/convex/adminApi"),
  "src/convex/storage.ts": () => import("../src/convex/storage"),
};

type Harness = ReturnType<typeof convexTest>;

const MASTER = "test-master-key-0123456789abcdef";

async function withMasterKey<T>(fn: () => Promise<T>): Promise<T> {
  const previous = process.env.APP_MASTER_KEY;
  process.env.APP_MASTER_KEY = MASTER;
  try {
    return await fn();
  } finally {
    if (previous === undefined) delete process.env.APP_MASTER_KEY;
    else process.env.APP_MASTER_KEY = previous;
  }
}

/** The catalog row and the one route slice 3 ships with. */
async function seedRoute(t: Harness) {
  const now = Date.now();
  await t.run(async (ctx) => {
    const existing = await ctx.db
      .query("vtuProviders")
      .withIndex("by_name", (q: any) => q.eq("name", "pairgate"))
      .first();
    if (!existing) {
      await ctx.db.insert("vtuProviders", {
        name: "pairgate",
        displayName: "Pairgate",
        status: "active",
        baseUrl: "https://api.pairgate.com",
        encryptedApiKey: "sealed-not-opened-by-this-test",
        priority: 100,
        createdAt: now,
        updatedAt: now,
      } as any);
    }
    await ctx.db.insert("vtuServiceCatalog", {
      serviceType: "airtime",
      productCode: "airtime-mtn",
      displayName: "MTN Airtime",
      customerIdentifierLabel: "Phone number",
      requiresAmount: true,
      requiresPackageCode: false,
      minAmount: 100,
      maxAmount: 100_000,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
    await ctx.db.insert("vtuServiceRouting", {
      productCode: "airtime-mtn",
      provider: "pairgate",
      providerProductCode: "airtime.mtn.{amount}",
      priority: 1,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  });
}

/** A method-complete adapter, so each test can remove exactly one method. */
const complete = () =>
  ({
    name: "probe",
    displayName: "Probe",
    async purchase() {
      return { status: "failed" as const, code: "X", message: "unused", raw: {} };
    },
    verifyAndParseCallback() {
      return null;
    },
    async verify() {
      return { status: "unknown" as const, message: "unused", raw: {} };
    },
  }) as VtuProviderAdapter;

/** A user, a really-sealed provider row, and the route. */
async function seedPurchase(t: Harness, extra: Record<string, unknown> = {}) {
  const now = Date.now();
  const balance = 5_000;
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      pointsBalance: balance,
      createdAt: now,
    }),
  );
  await t.run(async (ctx) => {
    await ctx.db.insert("vtuProviders", {
      name: "pairgate",
      displayName: "Pairgate",
      status: "active",
      baseUrl: "https://api.pairgate.com",
      // Really sealed: the purchase path opens it before dispatching.
      encryptedApiKey: await encrypt("pg_live_key"),
      encryptedWebhookSecret: await encrypt("pg_webhook_secret"),
      priority: 100,
      createdAt: now,
      updatedAt: now,
      ...extra,
    } as any);
  });
  await seedRoute(t);
  return { userId, balance };
}

const balanceOf = (t: Harness, userId: any) =>
  t.run(async (ctx) => (await ctx.db.get(userId))?.pointsBalance ?? -1);

const ledgerFor = (t: Harness, userId: any) =>
  t.run(async (ctx) =>
    ctx.db
      .query("pointLedger")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .collect(),
  );

const firstTransaction = (t: Harness) =>
  t.run(async (ctx) => ctx.db.query("vtuTransactions").first());

const buy = (t: Harness, userId: any, requestId: string) =>
  t.withIdentity({ subject: userId }).action(api.vtuHttp.purchaseVtu, {
    clientRequestId: requestId,
    serviceCode: "airtime.mtn.1000",
    customerIdentifier: "08031234567",
  });

describe("adapter completeness", () => {
  test("registration refuses an adapter missing any interface method", () => {
    const before = listAdapterNames();

    for (const method of ["purchase", "verifyAndParseCallback", "verify"]) {
      const broken: any = complete();
      broken.name = `probe-${method}`;
      delete broken[method];

      let error: any;
      try {
        registerAdapter(broken);
      } catch (e) {
        error = e;
      }

      // Registration-time, with the defect NAMED rather than producing a
      // symptom at whichever call site happens to touch it first.
      expect(error).toBeDefined();
      expect(error.code).toBe("ADAPTER_INCOMPLETE");
      expect(error.missing).toContain(method);
      expect(error.message).toContain(`probe-${method}`);
      // And the registry is untouched: a refused registration never replaces
      // a working adapter under the same name.
      expect(listAdapterNames()).not.toContain(`probe-${method}`);
    }

    expect(listAdapterNames()).toEqual(before);

    // A refused registration never replaces a working adapter under the SAME
    // name. Proved against our own probe rather than the shipped adapters:
    // this registry is process-wide and other test files leave stubs in it,
    // so asserting the identity of a shared entry would be asserting somebody
    // else's cleanup.
    const good: any = complete();
    good.name = "probe-good";
    registerAdapter(good);
    expect(getAdapter("probe-good")).toBe(good);

    const rejected: any = complete();
    rejected.name = "probe-good";
    delete rejected.purchase;
    expect(() => registerAdapter(rejected)).toThrow();
    expect(getAdapter("probe-good")).toBe(good);
  });

  test("a purchase method removed after registration fails fast and refunds", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const { userId, balance } = await seedPurchase(t);

      let dispatched = 0;
      const stub: any = complete();
      stub.name = "pairgate";
      stub.displayName = "Stub";
      stub.purchase = async () => {
        dispatched++;
        return { status: "success", providerReference: "P-1", costNgn: 999, raw: {} };
      };
      registerAdapter(stub);
      // Registration validated it; then the method disappears. That is the
      // shape a factory or a mutated object produces, and the reason the call
      // site keeps its own guard behind the registry's.
      delete stub.purchase;

      try {
        const result: any = await buy(t, userId, "vtu_incomplete_purchase");

        // Fast: nothing was dispatched, so no provider saw a request we then
        // failed to interpret.
        expect(dispatched).toBe(0);
        // Typed, not a 500 and not a generic provider rejection.
        expect(result.code).toBe("ADAPTER_INCOMPLETE");
        // And the debit did not strand: the reserve is settled and refunded in
        // the same action that discovered the defect.
        expect(result.status).toBe("reversed");
        expect(await balanceOf(t, userId)).toBe(balance);
        expect(
          (await ledgerFor(t, userId)).filter((l: any) => l.type === "vtu_refund"),
        ).toHaveLength(1);

        const row = await firstTransaction(t);
        expect(row.status).toBe("reversed");
        expect(row.source).toBe("dispatch");
        expect(row.reversalReason).toBe("provider_failed");
      } finally {
        registerAdapter(pairgateAdapter);
      }
    });
  });

  test("a purchase that throws lands in unknown, with the debit intact", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const { userId, balance } = await seedPurchase(t);

      let dispatched = 0;
      const stub: any = complete();
      stub.name = "pairgate";
      stub.displayName = "Thrower";
      // Deliberately NOT async: a synchronous throw never produces a promise
      // for `.catch` to attach to, so only a `try` around the call covers it.
      stub.purchase = () => {
        dispatched++;
        throw new Error("helper is not a function");
      };
      registerAdapter(stub);

      try {
        const result: any = await buy(t, userId, "vtu_throwing_purchase");

        expect(dispatched).toBe(1);
        // The action answers instead of exploding — a 500 here would leave the
        // client with no transaction id and no way to learn what happened.
        expect(result.status).toBe("unknown");

        const row = await firstTransaction(t);
        expect(row.status).toBe("unknown");
        // Honest: the request may have gone out before the throw, so the points
        // stay debited and the row becomes pollable by reconciliation. A refund
        // here would hand back money for airtime that may have landed.
        expect(row.reversalLedgerId).toBeUndefined();
        expect(await balanceOf(t, userId)).toBe(balance - row.pointsDebited);
        expect(
          (await ledgerFor(t, userId)).filter((l: any) => l.type === "vtu_refund"),
        ).toHaveLength(0);
      } finally {
        registerAdapter(pairgateAdapter);
      }
    });
  });

  test("a webhook whose adapter cannot verify gets a typed reason and a 4xx", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      await seedPurchase(t);

      const stub: any = complete();
      stub.name = "pairgate";
      stub.displayName = "No callback";
      registerAdapter(stub);
      delete stub.verifyAndParseCallback;

      try {
        // The action answers instead of throwing…
        const verification: any = await t.action(internal.vtuHttp.verifyCallback, {
          rawBody: JSON.stringify({ status: "Completed", hash: "H1", cost: 100 }),
          headers: { "x-signature": "deadbeef" },
          provider: "pairgate",
        });
        expect(verification.verified).toBe(false);
        expect(verification.reason).toBe("adapter_incomplete");

        // …and the aggregator sees a status that stops the retries while
        // naming our defect: not a 500 it would retry forever, not a 401 that
        // would send it rotating a key that is fine.
        const response = await t.fetch("/api/webhooks/vtu", {
          method: "POST",
          headers: { "content-type": "application/json", "x-signature": "deadbeef" },
          body: JSON.stringify({ status: "Completed", hash: "H1", cost: 100 }),
        });
        expect(response.status).toBe(422);
        const body: any = await response.json();
        expect(body.reason).toBe("adapter_incomplete");
      } finally {
        registerAdapter(pairgateAdapter);
      }
    });
  });

  test("a parser that throws on an authentic payload gets a 4xx, not a retry storm", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      await seedPurchase(t);

      const stub: any = complete();
      stub.name = "pairgate";
      stub.displayName = "Thrower";
      // The method exists — registration accepts it — and throws on a body it
      // did not guard. This is the shape a bad classifier produces, which is
      // how a missing shared helper would actually surface here.
      stub.verifyAndParseCallback = () => {
        throw new Error("classifier is not a function");
      };
      registerAdapter(stub);

      try {
        const verification: any = await t.action(internal.vtuHttp.verifyCallback, {
          rawBody: JSON.stringify({ status: "Completed", hash: "H1", cost: 100 }),
          headers: { "x-signature": "deadbeef" },
          provider: "pairgate",
        });
        expect(verification.verified).toBe(false);
        // Typed, and named as OUR defect rather than as a bad signature.
        expect(verification.reason).toBe("adapter_error");

        const response = await t.fetch("/api/webhooks/vtu", {
          method: "POST",
          headers: { "content-type": "application/json", "x-signature": "deadbeef" },
          body: JSON.stringify({ status: "Completed", hash: "H1", cost: 100 }),
        });
        expect(response.status).toBe(422);
        const body: any = await response.json();
        expect(body.reason).toBe("adapter_error");
      } finally {
        registerAdapter(pairgateAdapter);
      }
    });
  });
});
