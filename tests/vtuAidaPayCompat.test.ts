import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../src/convex/schema";
import { api, internal } from "../src/convex/_generated/api";
import { registerAdapter } from "../src/convex/vtuRegistry";
import { encrypt } from "../src/convex/lib/encryption";
import {
  PAIRGATE_STATUS_VOCABULARY,
  mapProviderStatus,
  pairgateAdapter,
} from "../src/convex/vtuPairgate";
import type { ProviderStatusVerdict } from "../src/convex/vtuPairgate";
import { composeAuthHeader } from "../src/convex/vtuShared";
import type {
  ProviderCallOptions,
  ProviderPurchaseRequest,
  VtuProviderAdapter,
} from "../src/convex/vtuShared";

/**
 * AidaPay compatibility, expressed as tests against the SHARED classifier.
 *
 * The AidaPay adapter itself is slice 4 and deliberately does not exist yet.
 * What exists now is the part that decides whether slice 4 is a small file or
 * a rewrite: a pure, vocabulary-driven status classifier, plus the request
 * fields AidaPay needs (`attemptId`, `accountPin`) and a closed auth-scheme
 * enum.
 *
 * So these tests fix the CONTRACT rather than the implementation. The
 * vocabulary below is transcribed from AidaPay's published statuses and is
 * the only AidaPay-specific thing in the repository so far.
 */

const modules = {
  "src/convex/_generated/api.js": () => import("../src/convex/_generated/api.js"),
  "src/convex/_generated/server.js": () => import("../src/convex/_generated/server.js"),
  "src/convex/schema.ts": () => import("../src/convex/schema"),
  "src/convex/vtuHttp.ts": () => import("../src/convex/vtuHttp"),
  "src/convex/vtuProviderCall.ts": () => import("../src/convex/vtuProviderCall"),
  "src/convex/vtuProviderConfig.ts": () => import("../src/convex/vtuProviderConfig"),
  "src/convex/vtuProviderAdmin.ts": () => import("../src/convex/vtuProviderAdmin"),
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

/**
 * The catalog row and the one route slice 3 ships with.
 *
 * Every purchase in this file routes through `routeProduct` before it debits,
 * so a purchase with no catalog row and no route is refused with
 * NO_ROUTE_AVAILABLE rather than charged. These tests are about the AidaPay
 * compatibility surface, not about routing, so the route is seeded with no
 * price override — the cost still comes from the default conversion, exactly
 * as it did in slice 1.
 */
async function seedRoute(t: Harness) {
  const now = Date.now();
  await t.run(async (ctx) => {
    // Routing joins to `vtuProviders` and only accepts an `active` row, so a
    // route with no provider behind it is never chosen. Some tests in this
    // file already insert their own richer `pairgate` row; only add one when
    // it is missing, so the two never compete.
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

// ─── AidaPay status vocabulary ─────────────────────────────────────

/**
 * AidaPay's published transaction states, as data.
 *
 * The mapping that matters most and is easiest to get wrong:
 *
 *   Refund  -> `failed`, NOT `reversed`.
 *
 * AidaPay uses the word "Refund" to mean the top-up was undone. Mapping that
 * onto our `reversed` status would be a category error: `reversed` is OUR
 * ledger decision to credit points back and release the idempotency key, and
 * it is reachable only from `failed`. A provider status word must never be
 * able to set it. The classifier has no way to express it, which is exactly
 * the property these tests pin down.
 */
const AIDAPAY_STATUS_VOCABULARY = {
  confirmed: ["completed"],
  failed: ["refund"],
  cancelled: ["cancelled"],
  processing: ["pending", "processing"],
} as const;

/** How a verdict becomes a row status, once the provider has been consulted. */
function toTransactionStatus(verdict: ProviderStatusVerdict): string {
  switch (verdict.kind) {
    case "confirmed":
      return "confirmed";
    case "processing":
      return "processing";
    case "failed":
      return "failed";
    case "unknown":
      return "unknown";
  }
}

describe("AidaPay status words map onto our vocabulary", () => {
  const cases: [string, string][] = [
    ["Completed", "confirmed"],
    ["Processing", "processing"],
    ["Pending", "processing"],
    ["Refund", "failed"],
    ["Cancelled", "failed"],
  ];

  for (const [aidapay, expected] of cases) {
    test(`${aidapay} -> ${expected}`, () => {
      const verdict = mapProviderStatus(aidapay, AIDAPAY_STATUS_VOCABULARY);
      expect(toTransactionStatus(verdict)).toBe(expected);
    });
  }

  test("Cancelled is distinguishable from a rejection", () => {
    const verdict = mapProviderStatus("Cancelled", AIDAPAY_STATUS_VOCABULARY);
    // Both refund the customer, but "accepted then withdrawn" and "refused
    // outright" are different facts and must survive to the transaction row.
    expect(verdict).toEqual({ kind: "failed", failureKind: "cancelled" });

    const refund = mapProviderStatus("Refund", AIDAPAY_STATUS_VOCABULARY);
    expect(refund).toEqual({ kind: "failed", failureKind: "rejected" });
  });

  test("no AidaPay status can ever produce a reversal", () => {
    // Exhaustively, over every word AidaPay publishes plus a pile of noise.
    const words = [
      ...AIDAPAY_STATUS_VOCABULARY.confirmed,
      ...AIDAPAY_STATUS_VOCABULARY.failed,
      ...AIDAPAY_STATUS_VOCABULARY.cancelled,
      ...AIDAPAY_STATUS_VOCABULARY.processing,
      "",
      "  ",
      "weird", "SUCCESS", "success", "Reversed", "REVERSED", "reversed",
      "Refund", "REFUND", "cancelled", "pending", "1", "null", "undefined",
    ];

    for (const word of words) {
      const status = toTransactionStatus(mapProviderStatus(word, AIDAPAY_STATUS_VOCABULARY));
      expect(status).not.toBe("reversed");
    }
  });

  test("status matching is case- and whitespace-insensitive", () => {
    // A vendor that changes "Completed" to "COMPLETED" between API versions
    // must not silently start resolving purchases to `unknown`.
    for (const variant of ["Completed", "completed", "COMPLETED", "  completed  ", "\tCompleted\n"]) {
      expect(mapProviderStatus(variant, AIDAPAY_STATUS_VOCABULARY).kind).toBe("confirmed");
    }
  });

  test("an unrecognised AidaPay status stays unknown rather than guessing", () => {
    // Guessing "confirmed" marks undelivered airtime as paid for; guessing
    // "failed" refunds airtime that actually landed.
    expect(mapProviderStatus("Queued", AIDAPAY_STATUS_VOCABULARY).kind).toBe("unknown");
    expect(mapProviderStatus(undefined, AIDAPAY_STATUS_VOCABULARY).kind).toBe("unknown");
    expect(mapProviderStatus(42, AIDAPAY_STATUS_VOCABULARY).kind).toBe("unknown");
  });

  test("a Processing callback is not terminal, so it resolves nothing", () => {
    // The purchase path treats `processing` as `unknown`: the top-up may still
    // land, so points stay debited and the row waits for a webhook.
    expect(toTransactionStatus(mapProviderStatus("Processing", AIDAPAY_STATUS_VOCABULARY))).toBe(
      "processing",
    );
  });

  test("Pairgate's own vocabulary is unaffected by AidaPay's words", () => {
    // The two providers share a classifier, not a vocabulary. AidaPay's
    // "Completed" must not accidentally confirm a Pairgate response, because
    // Pairgate has never been documented to send it.
    expect(mapProviderStatus("Completed", PAIRGATE_STATUS_VOCABULARY).kind).toBe("unknown");
    expect(mapProviderStatus("Refund", PAIRGATE_STATUS_VOCABULARY).kind).toBe("unknown");
    expect(mapProviderStatus("success", PAIRGATE_STATUS_VOCABULARY).kind).toBe("confirmed");
    expect(mapProviderStatus("failed", PAIRGATE_STATUS_VOCABULARY)).toEqual({
      kind: "failed",
      failureKind: "rejected",
    });
  });
});

// ─── attemptId ─────────────────────────────────────────────────────

/** A request shaped the way `vtuHttp` builds one, with both identities set. */
function makeRequest(
  overrides: Partial<ProviderPurchaseRequest> = {},
): ProviderPurchaseRequest {
  return {
    requestId: "req_logical_0001",
    attemptId: "tx_physical_0001",
    serviceType: "airtime",
    productCode: "airtime.mtn.1000",
    customerIdentifier: "08031234567",
    network: "MTN",
    ...overrides,
  } as ProviderPurchaseRequest;
}

function makeOptions(
  fetchImpl: typeof fetch,
  overrides: Partial<ProviderCallOptions> = {},
): ProviderCallOptions {
  return {
    baseUrl: "https://api.pairgate.com",
    apiKey: "pg_test_key",
    timeoutMs: 5_000,
    fetchImpl,
    ...overrides,
  } as ProviderCallOptions;
}

/** Capture what the adapter put on the wire. */
function recordingFetch() {
  const bodies: string[] = [];
  const headers: Record<string, string>[] = [];
  const impl = (async (_url: any, init: any) => {
    bodies.push(String(init?.body ?? ""));
    headers.push((init?.headers ?? {}) as Record<string, string>);
    return new Response(JSON.stringify({ status: "success", reference: "PG-1", cost: 100 }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }) as unknown as typeof fetch;
  return { impl, bodies, headers };
}

describe("attemptId is carried on the request and ignored by Pairgate", () => {
  test("the request type carries both the logical and the physical identity", () => {
    const req = makeRequest();
    // Compile-time contract, asserted at runtime so the field cannot be
    // quietly dropped from the type later.
    expect(req.requestId).toBe("req_logical_0001");
    expect(req.attemptId).toBe("tx_physical_0001");
    expect(req.requestId).not.toBe(req.attemptId);
  });

  test("Pairgate's wire body is byte-for-byte identical across attempts", async () => {
    const { impl, bodies } = recordingFetch();
    const opts = makeOptions(impl);

    await pairgateAdapter.purchase(makeRequest({ attemptId: "attempt_A" }), opts);
    await pairgateAdapter.purchase(makeRequest({ attemptId: "attempt_B" }), opts);

    expect(bodies).toHaveLength(2);
    // The committed promise: Pairgate gains nothing from a per-call id, so
    // changing it must not change a single byte on the wire.
    expect(bodies[1]).toBe(bodies[0]);
  });

  test("Pairgate sends the logical request id as its reference, never the attempt id", async () => {
    const { impl, bodies } = recordingFetch();
    await pairgateAdapter.purchase(
      makeRequest({ requestId: "req_same", attemptId: "tx_one" }),
      makeOptions(impl),
    );

    const sent = JSON.parse(bodies[0]);
    expect(sent.reference).toBe("req_same");
    // Neither spelling of the field appears anywhere in the payload.
    expect(bodies[0]).not.toContain("attemptId");
    expect(bodies[0]).not.toContain("attempt_id");
    expect(bodies[0]).not.toContain("tx_one");
  });

  test("an adapter that needs a never-repeating ref reads attemptId", async () => {
    // This is the AidaPay case: it 403s a duplicate `ref`, so a released-key
    // retry must forward a fresh one. Proven here with a stub, because the
    // real adapter is slice 4.
    const seen: string[] = [];
    const aidapayish: VtuProviderAdapter = {
      name: "aidapay",
      displayName: "AidaPay",
      async purchase(req) {
        seen.push(req.attemptId);
        return { status: "success", providerReference: "AP-1", costNgn: 100, raw: {} };
      },
      verifyAndParseCallback() {
        return null;
      },
      async verify() {
        return { status: "unknown", message: "unused", raw: {} };
      },
    };

    await aidapayish.purchase(makeRequest({ attemptId: "attempt_A" }), makeOptions(recordingFetch().impl));
    await aidapayish.purchase(makeRequest({ attemptId: "attempt_B" }), makeOptions(recordingFetch().impl));

    // Same logical purchase, two physical dispatches, two distinct refs.
    expect(seen).toEqual(["attempt_A", "attempt_B"]);
  });
});

// ─── Auth scheme composition ───────────────────────────────────────

describe("auth scheme composes exactly one header", () => {
  test("an unset scheme sends the raw token under the default header", () => {
    expect(composeAuthHeader({ apiKey: "tok_123" })).toEqual({ "x-api-key": "tok_123" });
  });

  test("bearer produces Authorization: Bearer <token>", () => {
    expect(
      composeAuthHeader({ authHeader: "Authorization", authScheme: "bearer", apiKey: "tok_123" }),
    ).toEqual({ Authorization: "Bearer tok_123" });
  });

  test("basic prefixes the token without re-encoding it", () => {
    expect(
      composeAuthHeader({ authHeader: "Authorization", authScheme: "basic", apiKey: "dXNlcjpwdw==" }),
    ).toEqual({ Authorization: "Basic dXNlcjpwdw==" });
  });

  test("a blank auth header falls back to the default rather than sending an empty name", () => {
    expect(composeAuthHeader({ authHeader: "   ", apiKey: "tok_123" })).toEqual({
      "x-api-key": "tok_123",
    });
  });

  test("Pairgate's shipped configuration still sends x-api-key verbatim", async () => {
    // The row carries no authHeader and no scheme, so the header is unchanged
    // from before this was generalised.
    const { impl, headers } = recordingFetch();
    await pairgateAdapter.purchase(makeRequest(), makeOptions(impl));
    expect(headers[0]["x-api-key"]).toBe("pg_test_key");
    expect(headers[0].Authorization).toBeUndefined();
  });
});

// ─── End to end: the physical id is the transaction id ──────────────

describe("purchaseAirtime forwards the transaction id as attemptId", () => {
  test("the adapter receives the Convex transaction id, not the client request id", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const now = Date.now();

      const userId = await t.run(async (ctx) =>
        ctx.db.insert("users", {
          name: "Ada",
          email: "ada@example.com",
          pointsBalance: 5_000,
          createdAt: now,
        }),
      );

      await t.run(async (ctx) =>
        ctx.db.insert("vtuProviders", {
          // The name the action resolves today. Per-product routing (slice 3)
          // is what makes the provider selectable; until then the row must
          // carry the name the action asks for.
          name: "pairgate",
          displayName: "AidaPay (under the default route)",
          status: "active",
          baseUrl: "https://aidapay.ng/api/v1",
          encryptedApiKey: await encrypt("ap_live_token"),
          // AidaPay requires a provider-level PIN on every purchase.
          encryptedAccountPin: await encrypt("1234"),
          authHeader: "Authorization",
          authScheme: "bearer",
          healthPath: "/balance",
          createdAt: now,
          updatedAt: now,
        } as any),
      );
      await seedRoute(t);

      const seen: { attemptId: string; requestId: string; accountPin?: string }[] = [];
      const stub: VtuProviderAdapter = {
        name: "pairgate",
        displayName: "Stub",
        async purchase(req, opts) {
          seen.push({
            attemptId: req.attemptId,
            requestId: req.requestId,
            accountPin: opts.accountPin,
          });
          return { status: "success", providerReference: "AP-1", costNgn: 100, raw: {} };
        },
        verifyAndParseCallback() {
          return null;
        },
        async verify() {
          return { status: "unknown", message: "unused", raw: {} };
        },
      };
      registerAdapter(stub);

      try {
        const CLIENT_REQUEST_ID = "client_req_0001";
        const result: any = await t
          .withIdentity({ subject: userId })
          .action(api.vtuHttp.purchaseAirtime, {
            clientRequestId: CLIENT_REQUEST_ID,
            serviceCode: "airtime.mtn.1000",
            customerIdentifier: "08031234567",
          });

        expect(seen).toHaveLength(1);
        // The whole point of the field: the ref the aggregator sees is unique
        // per dispatch, while our own idempotency key stays the logical one.
        expect(seen[0].attemptId).toBe(result.transactionId);
        expect(seen[0].attemptId).not.toBe(CLIENT_REQUEST_ID);
        expect(seen[0].requestId).toBe(CLIENT_REQUEST_ID);
        // The third secret reached the adapter, opened from the row.
        expect(seen[0].accountPin).toBe("1234");
      } finally {
        // Put the real adapter back so the rest of the file is unaffected.
        registerAdapter(pairgateAdapter);
      }
    });
  });

  test("a provider with no PIN configured sends none at all", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const now = Date.now();

      const userId = await t.run(async (ctx) =>
        ctx.db.insert("users", {
          name: "Bo",
          email: "bo@example.com",
          pointsBalance: 5_000,
          createdAt: now,
        }),
      );

      await t.run(async (ctx) =>
        ctx.db.insert("vtuProviders", {
          name: "pairgate",
          displayName: "Pinless",
          status: "active",
          baseUrl: "https://example.com",
          encryptedApiKey: await encrypt("k"),
          createdAt: now,
          updatedAt: now,
        } as any),
      );
      await seedRoute(t);

      let hadPin: string | undefined = "unset";
      registerAdapter({
        name: "pairgate",
        displayName: "Pinless",
        async purchase(_req, opts) {
          hadPin = opts.accountPin;
          return { status: "success", providerReference: "P-1", costNgn: 100, raw: {} };
        },
        verifyAndParseCallback() {
          return null;
        },
        async verify() {
          return { status: "unknown", message: "unused", raw: {} };
        },
      } as VtuProviderAdapter);

      try {
        await t.withIdentity({ subject: userId }).action(api.vtuHttp.purchaseAirtime, {
          clientRequestId: "client_req_pinless",
          serviceCode: "airtime.mtn.1000",
          customerIdentifier: "08031234567",
        });
      } finally {
        registerAdapter(pairgateAdapter);
      }

      // Absent, not an empty string: an adapter must be able to tell "this
      // provider has no PIN" from "the PIN failed to open".
      expect(hadPin).toBeUndefined();
    });
  });
});

// ─── Test connection uses the row's scheme ─────────────────────────

describe("test connection authenticates the way the provider is really called", () => {
  test("a bearer row is probed with Authorization: Bearer, not x-api-key", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await t.run(async (ctx) =>
        ctx.db.insert("users", {
          name: "Root",
          email: "root@example.com",
          role: "admin",
          pointsBalance: 0,
          createdAt: Date.now(),
        }),
      );

      await t.run(async (ctx) =>
        ctx.db.insert("vtuProviders", {
          name: "aidapay",
          displayName: "AidaPay",
          status: "active",
          baseUrl: "https://aidapay.ng/api/v1",
          encryptedApiKey: await encrypt("ap_live_token_0001"),
          authHeader: "Authorization",
          authScheme: "bearer",
          healthPath: "/balance",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as any),
      );

      const calls: { url: string; init: any }[] = [];
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async (url: any, init: any) => {
        calls.push({ url: String(url), init });
        return new Response("{}", { status: 200, headers: { "content-type": "application/json" } });
      }) as unknown as typeof fetch;

      try {
        const result: any = await t
          .withIdentity({ subject: adminId })
          .action(api.vtuProviderCall.testProviderConnection, { name: "aidapay" });

        expect(result.ok).toBe(true);
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe("https://aidapay.ng/api/v1/balance");
        // GET only. A test button wired to a spending path is a foot-gun
        // holding a live key.
        expect(calls[0].init.method).toBe("GET");
        // Probing with a hand-built header would report a healthy provider as
        // broken, so the probe composes auth exactly as an adapter does.
        expect(calls[0].init.headers.Authorization).toBe("Bearer ap_live_token_0001");
        expect(calls[0].init.headers["x-api-key"]).toBeUndefined();
      } finally {
        globalThis.fetch = realFetch;
      }
    });
  });

  test("a Pairgate-shaped row is still probed with x-api-key", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await t.run(async (ctx) =>
        ctx.db.insert("users", {
          name: "Root",
          email: "root@example.com",
          role: "admin",
          pointsBalance: 0,
          createdAt: Date.now(),
        }),
      );

      await t.run(async (ctx) =>
        ctx.db.insert("vtuProviders", {
          name: "pairgate",
          displayName: "Pairgate",
          status: "sandbox",
          baseUrl: "https://api.pairgate.com",
          encryptedApiKey: await encrypt("pg_live_key_12345"),
          authHeader: "x-api-key",
          healthPath: "/api/v1/balance",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as any),
      );

      const calls: any[] = [];
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async (_url: any, init: any) => {
        calls.push(init);
        return new Response("{}", { status: 200 });
      }) as unknown as typeof fetch;

      try {
        const result: any = await t
          .withIdentity({ subject: adminId })
          .action(api.vtuProviderCall.testProviderConnection, { name: "pairgate" });
        expect(result.ok).toBe(true);
        expect(calls[0].headers["x-api-key"]).toBe("pg_live_key_12345");
        expect(calls[0].headers.Authorization).toBeUndefined();
      } finally {
        globalThis.fetch = realFetch;
      }
    });
  });
});

// ─── Admin surface: three secrets, one closed enum ─────────────────

describe("admin provider surface handles the third secret", () => {
  async function seedAdmin(t: Harness) {
    return t.run(async (ctx) =>
      ctx.db.insert("users", {
        name: "Root",
        email: "root@example.com",
        role: "admin",
        pointsBalance: 0,
        createdAt: Date.now(),
      }),
    );
  }

  test("a provider is created with a sealed PIN and a bearer scheme", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);
      const client = t.withIdentity({ subject: adminId });

      await client.mutation(api.vtuProviderAdmin.createProvider, {
        name: "aidapay",
        displayName: "AidaPay",
        baseUrl: "https://aidapay.ng/api/v1",
        apiKey: "ap_live_token_0001",
        webhookSecret: "ap_webhook_secret",
        accountPin: "1234",
        authHeader: "Authorization",
        authScheme: "bearer",
        healthPath: "/balance",
        status: "sandbox",
      });

      const rows: any[] = await client.query(api.vtuProviderAdmin.listProviders, {});
      expect(rows).toHaveLength(1);
      expect(rows[0].authScheme).toBe("bearer");
      expect(rows[0].hasAccountPin).toBe(true);
      expect(rows[0].hasApiKey).toBe(true);
      expect(rows[0].hasWebhookSecret).toBe(true);

      // The write-only rule extends to the third secret. A Convex query is
      // subscribable, so a PIN in a result is a PIN in every admin's page.
      const serialised = JSON.stringify(rows);
      expect(serialised).not.toContain("1234");
      expect(serialised).not.toContain("ap_live_token_0001");
      expect(serialised).not.toContain("ap_webhook_secret");
      expect(serialised).not.toContain("cex1.");

      // Sealed on the row, and readable only by the Node layer that opens it.
      const stored: any = await t.run(async (ctx) => {
        const all = await ctx.db.query("vtuProviders").collect();
        return all[0];
      });
      expect(stored.encryptedAccountPin).toBeTruthy();
      expect(stored.encryptedAccountPin).not.toBe("1234");
      expect(stored.encryptedAccountPin).not.toBe(stored.encryptedApiKey);
    });
  });

  test("replacing the API key leaves the PIN alone; clearing is explicit", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);
      const client = t.withIdentity({ subject: adminId });

      await client.mutation(api.vtuProviderAdmin.createProvider, {
        name: "aidapay",
        displayName: "AidaPay",
        baseUrl: "https://aidapay.ng/api/v1",
        apiKey: "ap_live_token_0001",
        accountPin: "1234",
      });

      const pinBefore: any = await t.run(async (ctx) => {
        const all = await ctx.db.query("vtuProviders").collect();
        return all[0].encryptedAccountPin;
      });

      // An unrelated edit must not re-seal the PIN. The UI shows a mask and
      // offers "Replace", and is never handed the plaintext to write back.
      await client.mutation(api.vtuProviderAdmin.updateProvider, {
        name: "aidapay",
        displayName: "AidaPay NG",
      });

      const pinAfter: any = await t.run(async (ctx) => {
        const all = await ctx.db.query("vtuProviders").collect();
        return all[0].encryptedAccountPin;
      });
      expect(pinAfter).toBe(pinBefore);

      // And clearing it is a separate, deliberate act.
      await client.mutation(api.vtuProviderAdmin.updateProvider, {
        name: "aidapay",
        clearAccountPin: true,
      });
      const rows: any[] = await client.query(api.vtuProviderAdmin.listProviders, {});
      expect(rows[0].hasAccountPin).toBe(false);
    });
  });

  test("an auth scheme outside the enum is rejected at the mutation", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);
      const client = t.withIdentity({ subject: adminId });

      // A free string would let a typo through and produce a well-formed
      // request with a nonsense header, answered by a 401 that reads like a
      // bad key. The closed union makes that value unpassable.
      await expect(
        client.mutation(api.vtuProviderAdmin.createProvider, {
          name: "aidapay",
          displayName: "AidaPay",
          baseUrl: "https://aidapay.ng/api/v1",
          apiKey: "k",
          authScheme: "Bearer ",
        }),
      ).rejects.toThrow();

      // The empty member is a real, valid choice: it means "raw token".
      await client.mutation(api.vtuProviderAdmin.createProvider, {
        name: "rawtoken",
        displayName: "Raw Token",
        baseUrl: "https://example.com",
        apiKey: "k",
        authScheme: "",
      });
      const rows: any[] = await client.query(api.vtuProviderAdmin.listProviders, {});
      const raw = rows.find((r) => r.name === "rawtoken");
      expect(raw.authScheme).toBe("");
    });
  });
});

// ─── Reversal reason ───────────────────────────────────────────────

describe("a reversed transaction always records why", () => {
  test("refundAndRelease requires a reason — the mutation, not the schema, enforces it", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const now = Date.now();

      const userId = await t.run(async (ctx) =>
        ctx.db.insert("users", {
          name: "Cyd",
          email: "cyd@example.com",
          pointsBalance: 5_000,
          createdAt: now,
        }),
      );

      await seedRoute(t);

      const reserved: any = await t.mutation(internal.vtuInternal.beginPurchase, {
        userId,
        clientRequestId: "req_for_reversal",
        serviceCode: "airtime.mtn.1000",
        customerIdentifier: "08031234567",
      });

      await t.mutation(internal.vtuInternal.markProcessing, {
        transactionId: reserved.transactionId,
      });
      await t.mutation(internal.vtuInternal.recordOutcome, {
        transactionId: reserved.transactionId,
        source: "provider_response",
        outcome: { status: "failed", code: "X", message: "nope" },
      });

      // Omitting the reason is rejected by the ARGUMENT VALIDATOR. This is the
      // invariant the user asked for: enforced at the mutation that writes the
      // transition, so a `reversed` row without a reason cannot exist.
      await expect(
        t.mutation(internal.vtuInternal.refundAndRelease, {
          transactionId: reserved.transactionId,
          reason: "provider said no",
        }),
      ).rejects.toThrow();

      // And an invented reason outside the enum is equally rejected.
      await expect(
        t.mutation(internal.vtuInternal.refundAndRelease, {
          transactionId: reserved.transactionId,
          reason: "provider said no",
          reversalReason: "because_i_said_so",
        }),
      ).rejects.toThrow();

      const row: any = await t.mutation(internal.vtuInternal.refundAndRelease, {
        transactionId: reserved.transactionId,
        reason: "provider said no",
        reversalReason: "provider_cancelled",
      });
      expect(row.reversed).toBe(true);

      const stored: any = await t.run(async (ctx) => ctx.db.get(reserved.transactionId));
      expect(stored.status).toBe("reversed");
      // Non-null on the reversed row, which is the invariant.
      expect(stored.reversalReason).toBe("provider_cancelled");
    });
  });

  test("the reserved reasons are accepted now so the table does not have to move later", async () => {
    for (const reversalReason of ["provider_failed", "provider_cancelled", "admin_override", "reconciliation"] as const) {
      await withMasterKey(async () => {
        const t = convexTest(schema, modules);
        const now = Date.now();
        const userId = await t.run(async (ctx) =>
          ctx.db.insert("users", {
            name: "Dee",
            email: "dee@example.com",
            pointsBalance: 5_000,
            createdAt: now,
          }),
        );
        await seedRoute(t);
        const reserved: any = await t.mutation(internal.vtuInternal.beginPurchase, {
          userId,
          clientRequestId: `req_${reversalReason}`,
          serviceCode: "airtime.mtn.1000",
          customerIdentifier: "08031234567",
        });
        await t.mutation(internal.vtuInternal.markProcessing, {
          transactionId: reserved.transactionId,
        });
        await t.mutation(internal.vtuInternal.recordOutcome, {
          transactionId: reserved.transactionId,
          source: "provider_response",
          outcome: { status: "failed", code: "X", message: "no" },
        });
        await t.mutation(internal.vtuInternal.refundAndRelease, {
          transactionId: reserved.transactionId,
          reason: "no",
          reversalReason,
        });
        const stored: any = await t.run(async (ctx) => ctx.db.get(reserved.transactionId));
        expect(stored.reversalReason).toBe(reversalReason);
      });
    }
  });
});
