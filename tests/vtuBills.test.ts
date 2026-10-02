import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../src/convex/schema";
import { api, internal } from "../src/convex/_generated/api";
import { registerAdapter } from "../src/convex/vtuRegistry";
import { encrypt } from "../src/convex/lib/encryption";
import { aidapayAdapter } from "../src/convex/providers/aidapay";
import type { ProviderPurchaseRequest, VtuProviderAdapter } from "../src/convex/vtuShared";

/**
 * The bill-payment slice: electricity, data and cable, end to end.
 *
 * What these tests are for, in one line: before this slice the purchase path
 * accepted `airtime.<network>.<amount>` and NOTHING else, so a catalogue row
 * for a disco or a data plan was a product nobody could buy. The grammar now
 * has two shapes — an amount tail and a package tail — and the catalog decides
 * which products exist.
 *
 * Driven against a real Convex implementation with a STUB adapter registered
 * under AidaPay's name, so the assertions are about the money path (routing,
 * composition, pricing, the ledger) rather than about AidaPay's HTTP.
 *
 * `convex-test` is normally driven by Vitest, which supplies the module map
 * via `import.meta.glob`. Bun has no `import.meta.glob`, so the map is passed
 * explicitly as the second argument.
 */

const modules = {
  "src/convex/_generated/api.js": () => import("../src/convex/_generated/api.js"),
  "src/convex/_generated/server.js": () => import("../src/convex/_generated/server.js"),
  "src/convex/schema.ts": () => import("../src/convex/schema"),
  "src/convex/vtuHttp.ts": () => import("../src/convex/vtuHttp"),
  "src/convex/vtuCatalog.ts": () => import("../src/convex/vtuCatalog"),
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
const PHONE = "08031234567";
const METER = "45012345678";

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

/**
 * A user with a balance, an active AidaPay row, and the two products this
 * slice sells: one amount-priced (electricity) and one fixed-package (data).
 */
async function seed(t: Harness) {
  const now = Date.now();
  const balance = 10_000;
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
      name: "aidapay",
      displayName: "AidaPay",
      status: "active",
      baseUrl: "https://aidapay.ng",
      authHeader: "Authorization",
      authScheme: "bearer",
      encryptedApiKey: await encrypt("ap_access_token"),
      encryptedWebhookSecret: await encrypt("ap_webhook_secret"),
      encryptedAccountPin: await encrypt("1234"),
      priority: 100,
      createdAt: now,
      updatedAt: now,
    } as any);

    await ctx.db.insert("vtuServiceCatalog", {
      serviceType: "electricity",
      productCode: "electricity-ikeja-electric",
      displayName: "Ikeja Electric (prepaid)",
      customerIdentifierLabel: "Meter number",
      requiresAmount: true,
      requiresPackageCode: false,
      minAmount: 500,
      maxAmount: 50_000,
      active: true,
      createdAt: now,
      updatedAt: now,
    } as any);

    await ctx.db.insert("vtuServiceCatalog", {
      serviceType: "data",
      productCode: "data-mtn-1gb-30-days",
      displayName: "MTN 1GB — 30 days",
      customerIdentifierLabel: "Phone number",
      requiresAmount: false,
      requiresPackageCode: false,
      // The provider's price for the plan, which is what the ledger's naira
      // snapshot is built from when the customer has no amount to give.
      priceNgn: 1000,
      active: true,
      createdAt: now,
      updatedAt: now,
    } as any);

    await ctx.db.insert("vtuServiceRouting", {
      productCode: "electricity-ikeja-electric",
      provider: "aidapay",
      providerProductCode: "ikeja-electric",
      priority: 1,
      active: true,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.db.insert("vtuServiceRouting", {
      productCode: "data-mtn-1gb-30-days",
      provider: "aidapay",
      providerProductCode: "mtn-data",
      providerPackageCode: "DATA-01",
      priority: 1,
      active: true,
      createdAt: now,
      updatedAt: now,
    });
  });

  return { userId, balance };
}

/** A method-complete stub, plus the requests it was handed. */
function stubAidaPay(result: unknown) {
  const seen: ProviderPurchaseRequest[] = [];
  const stub: any = {
    name: "aidapay",
    displayName: "AidaPay (stub)",
    async purchase(req: ProviderPurchaseRequest) {
      seen.push(req);
      return result;
    },
    verifyAndParseCallback() {
      return null;
    },
    async verify() {
      return { status: "unknown" as const, message: "unused", raw: {} };
    },
  } as VtuProviderAdapter;
  registerAdapter(stub);
  return { seen };
}

const buy = (
  t: Harness,
  userId: any,
  args: { clientRequestId: string; serviceCode: string; customerIdentifier: string },
) => t.withIdentity({ subject: userId }).action(api.vtuHttp.purchaseVtu, args);

const firstTransaction = (t: Harness) =>
  t.run(async (ctx) => ctx.db.query("vtuTransactions").first());

const balanceOf = (t: Harness, userId: any) =>
  t.run(async (ctx) => (await ctx.db.get(userId))?.pointsBalance ?? -1);

describe("bills are purchasable", () => {
  test("an electricity top-up sends the meter number and the amount, and no package", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const { userId, balance } = await seed(t);
      const { seen } = stubAidaPay({
        status: "success",
        providerReference: "TX-ELEC-1",
        costNgn: 5000,
        raw: {},
      });

      try {
        const result: any = await buy(t, userId, {
          clientRequestId: "vtu_elec_0001",
          serviceCode: "electricity.ikeja-electric.5000",
          customerIdentifier: METER,
        });

        expect(result.status).toBe("confirmed");
        expect(seen).toHaveLength(1);
        // The ROUTE's provider code, not our canonical one.
        expect(seen[0].productCode).toBe("ikeja-electric");
        expect(seen[0].serviceType).toBe("electricity");
        expect(seen[0].amountNgn).toBe(5000);
        // No package: an electricity purchase is priced by its amount.
        expect(seen[0].providerPackageCode).toBeUndefined();
        expect(seen[0].customerIdentifier).toBe(METER);

        const row: any = await firstTransaction(t);
        expect(row.serviceCode).toBe("electricity.ikeja-electric.5000");
        expect(row.network).toBe("ikeja-electric");
        expect(row.amountNgn).toBe(5000);
        expect(row.nairaPrice).toBe(5000);
        // The charge is the conversion of the amount at the frozen rate — the
        // row's own rate, so this cannot pass against a different one.
        expect(row.pointsDebited).toBe(Math.ceil(5000 / row.ngnPerPoint));
        expect(await balanceOf(t, userId)).toBe(balance - row.pointsDebited);
      } finally {
        registerAdapter(aidapayAdapter);
      }
    });
  });

  test("a data bundle is priced from the catalog and sends the package code", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const { userId, balance } = await seed(t);
      const { seen } = stubAidaPay({
        status: "success",
        providerReference: "TX-DATA-1",
        costNgn: 1000,
        raw: {},
      });

      try {
        const result: any = await buy(t, userId, {
          clientRequestId: "vtu_data_0001",
          serviceCode: "data.mtn.1gb-30-days",
          customerIdentifier: PHONE,
        });

        expect(result.status).toBe("confirmed");
        expect(seen).toHaveLength(1);
        expect(seen[0].productCode).toBe("mtn-data");
        expect(seen[0].serviceType).toBe("data");
        expect(seen[0].providerPackageCode).toBe("DATA-01");
        // No amount: the plan carries the price, and a data purchase that sent
        // one would be a number the provider did not ask for.
        expect(seen[0].amountNgn).toBeUndefined();

        const row: any = await firstTransaction(t);
        expect(row.serviceCode).toBe("data.mtn.1gb-30-days");
        expect(row.amountNgn).toBeUndefined();
        expect(row.nairaPrice).toBe(1000);
        expect(row.pointsDebited).toBe(Math.ceil(1000 / row.ngnPerPoint));
        expect(await balanceOf(t, userId)).toBe(balance - row.pointsDebited);
      } finally {
        registerAdapter(aidapayAdapter);
      }
    });
  });

  test("a destination that does not match the service type is refused before any charge", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const { userId, balance } = await seed(t);
      const { seen } = stubAidaPay({
        status: "success",
        providerReference: "TX-NEVER",
        costNgn: 5000,
        raw: {},
      });

      try {
        // Four digits is not a meter number. The point is WHERE it is refused:
        // before the reservation, so no transaction exists and no points move.
        await expect(
          buy(t, userId, {
            clientRequestId: "vtu_elec_bad",
            serviceCode: "electricity.ikeja-electric.5000",
            customerIdentifier: "1234",
          }),
        ).rejects.toThrow();

        expect(seen).toHaveLength(0);
        expect(await firstTransaction(t)).toBeNull();
        expect(await balanceOf(t, userId)).toBe(balance);
      } finally {
        registerAdapter(aidapayAdapter);
      }
    });
  });

  test("a product addressed without the amount it requires is refused, not priced from nothing", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const { userId, balance } = await seed(t);
      const { seen } = stubAidaPay({
        status: "success",
        providerReference: "TX-NEVER",
        costNgn: 5000,
        raw: {},
      });

      try {
        // A package-shaped address for an amount-priced product resolves to
        // `electricity-ikeja-electric-5000-kwh`, which nobody configured — so
        // the failure is the TYPED routing refusal, surfaced rather than
        // thrown: the page has to be able to say "that product is not in the
        // catalog" and the idempotency key was never burned.
        const result: any = await buy(t, userId, {
          clientRequestId: "vtu_elec_slug",
          serviceCode: "electricity.ikeja-electric.5000-kwh",
          customerIdentifier: METER,
        });

        expect(result.status).toBe("rejected");
        expect(result.code).toBe("PRODUCT_NOT_FOUND");
        expect(seen).toHaveLength(0);
        expect(await balanceOf(t, userId)).toBe(balance);
      } finally {
        registerAdapter(aidapayAdapter);
      }
    });
  });
});

describe("the purchase page is served from one place", () => {
  test("a fixed-package product reports its exact price and its buyable code", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      await seed(t);

      const detail: any = await t.query(api.vtuCatalog.getPurchaseDetail, {
        productCode: "data-mtn-1gb-30-days",
      });

      expect(detail.serviceCodeTemplate).toBe("data.mtn.1gb-30-days");
      expect(detail.requiresAmount).toBe(false);
      // Exact, not indicative: the naira price is the provider's, so the
      // conversion is the final number rather than an estimate.
      expect(detail.fixedPoints).toBe(Math.ceil(1000 / detail.ngnPerPoint));
      expect(detail.providerAvailable).toBe(true);
    });
  });

  test("an amount-priced product reports a template with the amount token", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      await seed(t);

      const detail: any = await t.query(api.vtuCatalog.getPurchaseDetail, {
        productCode: "electricity-ikeja-electric",
      });

      expect(detail.serviceCodeTemplate).toBe("electricity.ikeja-electric.{amount}");
      expect(detail.amountToken).toBe("{amount}");
      expect(detail.requiresAmount).toBe(true);
      expect(detail.fixedPoints).toBeNull();
      expect(detail.minAmount).toBe(500);
    });
  });

  test("the catalogue lists both shapes as buyable", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      await seed(t);

      const catalog: any = await t.query(api.vtuCatalog.listCatalog, {});
      const products = catalog.groups.flatMap((g: any) => g.products);
      const byCode = new Map(products.map((p: any) => [p.productCode, p]));

      expect(byCode.get("data-mtn-1gb-30-days")?.purchasable).toBe(true);
      expect(byCode.get("electricity-ikeja-electric")?.purchasable).toBe(true);
    });
  });
});

describe("delivery values survive to the customer", () => {
  test("a webhook's meter token is written onto the transaction it settles", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const { userId } = await seed(t);
      // `unknown` — accepted and not yet answered — so the row has a provider
      // reference for the callback to match, which is exactly the state a real
      // electricity purchase sits in while the token is being generated.
      stubAidaPay({
        status: "unknown",
        message: "AidaPay is still processing this purchase",
        providerReference: "TX-ELEC-TOKEN",
        raw: {},
      });

      try {
        await buy(t, userId, {
          clientRequestId: "vtu_elec_token",
          serviceCode: "electricity.ikeja-electric.5000",
          customerIdentifier: METER,
        });

        const applied: any = await t.action(internal.vtuHttp.applyCallback, {
          provider: "aidapay",
          event: {
            providerReference: "TX-ELEC-TOKEN",
            outcome: "confirmed",
            costNgn: 5000,
            delivery: { token: "1234-5678-9012-3456-7890", units: "12.3" },
            eventId: "EV-1",
          },
        });

        expect(applied.applied).toBe(true);
        const row: any = await firstTransaction(t);
        expect(row.status).toBe("confirmed");
        expect(row.delivery?.token).toBe("1234-5678-9012-3456-7890");
        expect(row.delivery?.units).toBe("12.3");
      } finally {
        registerAdapter(aidapayAdapter);
      }
    });
  });
});
