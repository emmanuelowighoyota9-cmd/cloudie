import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../src/convex/schema";
import { api } from "../src/convex/_generated/api";
import { encrypt } from "../src/convex/lib/encryption";
import { routeProduct } from "../src/convex/vtuServiceRouting";
import {
  AIRTIME_SEED_NETWORKS,
  AIRTIME_SEED_PROVIDER_CODES,
  airtimeSeedProducts,
  airtimeSeedRoutes,
} from "../src/lib/vtuCatalogSeed";

/**
 * The starter airtime catalog.
 *
 * The bug these pin down: the only seed that existed required a `pairgate`
 * provider row and refused to write anything without one, so an AidaPay-only
 * deployment had a live provider, a working connection test, and a customer
 * shop that was permanently empty. The failure mode is INVISIBLE — nothing
 * errors, the page just says nothing is on sale — so it is worth a test that
 * fails loudly if the seed ever goes back to depending on one provider name.
 *
 * What is asserted, in order of how much money it protects:
 *   - the four networks are seeded against CONFIGURED providers, not a
 *     hard-coded one
 *   - each provider gets the id shape IT expects (`{amount}` vs bare slug),
 *     because a wrong one 400s only after a customer has been charged
 *   - a provider with no known convention is skipped, not guessed at
 *   - re-running is a no-op and never overwrites an operator's re-pointed route
 *   - the seeded products are actually PURCHASABLE, which is the whole point
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
  "src/convex/vtuCatalog.ts": () => import("../src/convex/vtuCatalog"),
  "src/convex/vtuShared.ts": () => import("../src/convex/vtuShared"),
  "src/convex/lib/encryption.ts": () => import("../src/convex/lib/encryption"),
  "src/convex/points.ts": () => import("../src/convex/points"),
  "src/convex/pricing.ts": () => import("../src/convex/pricing"),
  "src/convex/adminApi.ts": () => import("../src/convex/adminApi"),
  "src/convex/storage.ts": () => import("../src/convex/storage"),
};

type Harness = ReturnType<typeof convexTest>;

const MASTER = "test-master-key-0123456789abcdef";

beforeAll(() => {
  process.env.APP_MASTER_KEY = MASTER;
});

afterAll(() => {
  delete process.env.APP_MASTER_KEY;
});

async function adminClient(t: Harness) {
  const adminId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      name: "Root",
      email: "root@example.com",
      role: "admin",
      pointsBalance: 0,
      createdAt: Date.now(),
    }),
  );
  return { client: t.withIdentity({ subject: adminId }), adminId };
}

async function seedProvider(
  t: Harness,
  row: { name: string; status?: "active" | "sandbox" | "disabled"; priority?: number },
) {
  const now = Date.now();
  const sealed = await encrypt(`key_${row.name}`);
  await t.run(async (ctx) =>
    ctx.db.insert("vtuProviders", {
      name: row.name,
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

// ─── The pure description ───────────────────────────────────────────

describe("the seed description", () => {
  test("it covers all four Nigerian networks with the bounds the parser already enforced", () => {
    const products = airtimeSeedProducts();
    expect(products.map((p) => p.productCode)).toEqual([
      "airtime-mtn",
      "airtime-airtel",
      "airtime-glo",
      "airtime-9mobile",
    ]);
    // 100–100,000 is what `parseServiceCode` already rejected outside of, so
    // moving the bounds into data widens nothing that was previously buyable.
    for (const p of products) {
      expect(p.minAmount).toBe(100);
      expect(p.maxAmount).toBe(100_000);
      expect(p.requiresAmount).toBe(true);
      expect(p.requiresPackageCode).toBe(false);
    }
  });

  test("each provider gets the id shape IT expects", () => {
    // Pairgate encodes the size INTO the code…
    expect(AIRTIME_SEED_PROVIDER_CODES.pairgate("mtn")).toBe("airtime.mtn.{amount}");
    // …and AidaPay names the network and sends the size as its own field.
    expect(AIRTIME_SEED_PROVIDER_CODES.aidapay("mtn")).toBe("mtn");
  });

  test("an unknown provider is skipped, never given an invented code", () => {
    // A wrong providerProductCode fails only once a customer has been charged;
    // a missing route fails closed and is flagged on the admin screen.
    expect(airtimeSeedRoutes(["some-aggregator-we-do-not-know"])).toEqual([]);
    expect(airtimeSeedRoutes([])).toEqual([]);
  });

  test("AidaPay outranks Pairgate on every network", () => {
    const routes = airtimeSeedRoutes(["pairgate", "aidapay"]);
    expect(routes).toHaveLength(AIRTIME_SEED_NETWORKS.length * 2);
    for (const network of AIRTIME_SEED_NETWORKS) {
      const forProduct = routes.filter((r) => r.productCode === `airtime-${network}`);
      const aidapay = forProduct.find((r) => r.provider === "aidapay")!;
      const pairgate = forProduct.find((r) => r.provider === "pairgate")!;
      expect(aidapay.priority).toBeLessThan(pairgate.priority);
    }
  });
});

// ─── The mutation ───────────────────────────────────────────────────

describe("seeding the airtime catalog", () => {
  test("an AidaPay-only deployment gets a full shop — the regression that mattered", async () => {
    const t = convexTest(schema, modules);
    const { client } = await adminClient(t);
    await seedProvider(t, { name: "aidapay" });

    const res: any = await client.mutation(api.vtuServiceAdmin.seedAirtimeCatalog, {});
    expect(res.action).toBe("inserted");
    expect(res.productsInserted).toBe(4);
    expect(res.routesInserted).toBe(4);
    expect(res.routedProviders).toEqual(["aidapay"]);

    // This is the assertion the empty shop would have failed: the customer's
    // browse query returns four groups' worth of products, each buyable.
    const catalog: any = await t.run(
      async (ctx) => await ctx.runQuery(api.vtuCatalog.listCatalog, {}),
    );
    const airtime = catalog.groups.find((g: any) => g.serviceType === "airtime");
    expect(airtime.products).toHaveLength(4);
    for (const p of airtime.products) {
      expect(p.purchasable).toBe(true);
    }
    expect(airtime.products.map((p: any) => p.airtimeNetwork).sort()).toEqual(
      [...AIRTIME_SEED_NETWORKS].sort(),
    );
  });

  test("both providers configured means the live one wins and the fallback stays", async () => {
    const t = convexTest(schema, modules);
    const { client } = await adminClient(t);
    await seedProvider(t, { name: "aidapay" });
    await seedProvider(t, { name: "pairgate" });

    const res: any = await client.mutation(api.vtuServiceAdmin.seedAirtimeCatalog, {});
    expect(res.routesInserted).toBe(8);

    const decided: any = await t.run(
      async (ctx) => await routeProduct(ctx as any, "airtime-glo"),
    );
    expect(decided.ok).toBe(true);
    expect(decided.winner.provider).toBe("aidapay");
    // The fallback is routed, not merely reachable in principle.
    expect(decided.candidates.map((c: any) => c.provider).sort()).toEqual([
      "aidapay",
      "pairgate",
    ]);
  });

  test("re-running is a no-op and an operator's re-pointed route survives", async () => {
    const t = convexTest(schema, modules);
    const { client } = await adminClient(t);
    await seedProvider(t, { name: "aidapay" });
    await seedProvider(t, { name: "pairgate" });

    const first: any = await client.mutation(api.vtuServiceAdmin.seedAirtimeCatalog, {});
    expect(first.action).toBe("inserted");

    // The operator disables the seeded AidaPay route for MTN and puts Pairgate
    // on it instead.
    const routeId: any = await t.run(async (ctx) => {
      const row: any = await ctx.db
        .query("vtuServiceRouting")
        .withIndex("by_productCode_provider", (q: any) =>
          q.eq("productCode", "airtime-mtn").eq("provider", "aidapay"),
        )
        .unique();
      await ctx.db.patch(row._id, { active: false, priority: 50 });
      return row._id;
    });
    void routeId;

    const second: any = await client.mutation(api.vtuServiceAdmin.seedAirtimeCatalog, {});
    expect(second.action).toBe("noop");
    expect(second.productsInserted).toBe(0);
    expect(second.routesInserted).toBe(0);

    const products = await t.run(async (ctx) => ctx.db.query("vtuServiceCatalog").collect());
    expect(products).toHaveLength(4);
    const routes = await t.run(async (ctx) => ctx.db.query("vtuServiceRouting").collect());
    expect(routes).toHaveLength(8);

    // Still disabled — the seed repairs nothing and overrides nothing.
    const mtn: any = await t.run(async (ctx) => {
      const row: any = await ctx.db
        .query("vtuServiceRouting")
        .withIndex("by_productCode_provider", (q: any) =>
          q.eq("productCode", "airtime-mtn").eq("provider", "aidapay"),
        )
        .unique();
      return { active: row.active, priority: row.priority };
    });
    expect(mtn.active).toBe(false);
    expect(mtn.priority).toBe(50);
  });

  test("a provider with no known convention is reported, not guessed at", async () => {
    const t = convexTest(schema, modules);
    const { client } = await adminClient(t);
    await seedProvider(t, { name: "aidapay" });
    await seedProvider(t, { name: "mystery-aggregator" });

    const res: any = await client.mutation(api.vtuServiceAdmin.seedAirtimeCatalog, {});
    expect(res.routedProviders).toEqual(["aidapay"]);
    expect(res.unroutableProviders).toEqual(["mystery-aggregator"]);
    // The products still exist, so the shop lists something the operator can
    // fix, rather than being empty with nothing pointing at the cause.
    expect(res.productsInserted).toBe(4);
    expect(res.routesInserted).toBe(4);
  });

  test("no providers at all seeds the products and reports zero routes", async () => {
    const t = convexTest(schema, modules);
    const { client } = await adminClient(t);

    const res: any = await client.mutation(api.vtuServiceAdmin.seedAirtimeCatalog, {});
    expect(res.productsInserted).toBe(4);
    expect(res.routesInserted).toBe(0);
    expect(res.routedProviders).toEqual([]);

    // An active product with no route fails CLOSED — no points debited, a
    // refusal the customer can understand.
    const decided: any = await t.run(
      async (ctx) => await routeProduct(ctx as any, "airtime-mtn"),
    );
    expect(decided.ok).toBe(false);
    expect(decided.code).toBe("NO_ROUTE_AVAILABLE");
  });

  test("it refuses a non-admin", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.run(async (ctx) =>
      ctx.db.insert("users", {
        name: "Customer",
        email: "cust@example.com",
        role: "customer",
        pointsBalance: 0,
        createdAt: Date.now(),
      }),
    );
    const client = t.withIdentity({ subject: userId });
    await expect(
      client.mutation(api.vtuServiceAdmin.seedAirtimeCatalog, {}),
    ).rejects.toThrow();
  });
});
