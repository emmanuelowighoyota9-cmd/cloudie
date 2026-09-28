import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { convexTest } from "convex-test";
import schema from "../src/convex/schema";
import { api, internal } from "../src/convex/_generated/api";
import { registerAdapter } from "../src/convex/vtuRegistry";
import { encrypt } from "../src/convex/lib/encryption";
import {
  PAIRGATE_STATUS_VOCABULARY,
  mapPurchaseResponse,
  pairgateAdapter,
} from "../src/convex/vtuPairgate";
import { mapProviderStatus } from "../src/convex/vtuProviderStatus";
import type { ProviderStatusVerdict } from "../src/convex/vtuProviderStatus";
import { AIDAPAY_STATUS_VOCABULARY, aidapayAdapter, mapAidaPayStatus } from "../src/convex/providers/aidapay";
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
// The AidaPay vocabulary is imported from the ADAPTER (see the imports above),
// not restated here. A local copy was a transcription that could drift from
// the mapping the adapter actually ships: these tests would keep passing
// against a stale vocabulary while production used a different one.
//
// The `mapProviderStatus(...)` call sites below are left in place deliberately.
// They exercise the SHARED classifier with AidaPay's words, and a separate
// suite asserts that `mapAidaPayStatus` — the function the adapter itself
// calls — agrees with them on every word. Two paths, one mapping.

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

  test("the adapter's own mapAidaPayStatus agrees with the shared classifier", () => {
    // The rest of this suite calls the SHARED `mapProviderStatus` with
    // AidaPay's vocabulary; production calls `mapAidaPayStatus`, the wrapper
    // inside the adapter. If those two ever diverge, every assertion above
    // would still pass while the adapter mapped statuses differently.
    //
    // This walks the published words AND a pile of noise, so a vocabulary
    // change in `aidapay.ts` cannot silently disagree with the contract.
    const words = [
      ...AIDAPAY_STATUS_VOCABULARY.confirmed,
      ...AIDAPAY_STATUS_VOCABULARY.failed,
      ...AIDAPAY_STATUS_VOCABULARY.cancelled,
      ...AIDAPAY_STATUS_VOCABULARY.processing,
      "Completed",
      "completed",
      "  COMPLETED  ",
      "Refund",
      "Cancelled",
      "Pending",
      "Processing",
      "Queued",
      "",
      undefined,
      42,
      { status: "Completed" },
    ];
    for (const word of words) {
      expect(mapAidaPayStatus(word)).toEqual(
        mapProviderStatus(word, AIDAPAY_STATUS_VOCABULARY),
      );
    }
  });

  test("the adapter's mapper still cannot produce a reversal", () => {
    // Same guarantee as the shared classifier, asserted through the function
    // production actually calls.
    for (const word of ["Completed", "Refund", "Cancelled", "Pending", "Queued"]) {
      expect(mapAidaPayStatus(word).kind).not.toBe("reversed");
    }
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

  test("AidaPay forwards the PHYSICAL attempt id as its ref", async () => {
    // The real adapter now exists, so this asserts the wire bytes rather than
    // a stub's intentions. AidaPay 403s a duplicate `ref`, and our own rule
    // releases the idempotency key on failure so a customer can retry with the
    // SAME client request id — forwarding that upstream would 403 every
    // legitimate retry.
    const { impl, bodies } = recordingFetch();
    const opts = makeOptions(impl, {
      accountPin: "1234",
      authHeader: "Authorization",
      authScheme: "bearer",
    });

    await aidapayAdapter.purchase(
      makeRequest({ requestId: "req_same", attemptId: "tx_one" }),
      opts,
    );

    const sent = JSON.parse(bodies[0]);
    expect(sent.ref).toBe("tx_one");
    // The logical id must appear NOWHERE in the payload.
    expect(bodies[0]).not.toContain("req_same");
  });

  test("two attempts of the same logical purchase carry two distinct AidaPay refs", async () => {
    const { impl, bodies } = recordingFetch();
    const opts = makeOptions(impl, { accountPin: "1234" });

    await aidapayAdapter.purchase(
      makeRequest({ requestId: "req_same", attemptId: "tx_one" }),
      opts,
    );
    await aidapayAdapter.purchase(
      makeRequest({ requestId: "req_same", attemptId: "tx_two" }),
      opts,
    );

    // Same logical purchase, two physical dispatches, two distinct refs — so
    // AidaPay 403s neither.
    expect(JSON.parse(bodies[0]).ref).toBe("tx_one");
    expect(JSON.parse(bodies[1]).ref).toBe("tx_two");
  });

  test("the ref clears AidaPay's 5-character minimum", async () => {
    // A Convex transaction id is ~30 chars. This is the property that makes
    // the attempt id the right ref, so it is pinned explicitly rather than
    // left to the reader to infer.
    const { impl, bodies } = recordingFetch();
    await aidapayAdapter.purchase(
      makeRequest({ attemptId: "tx_physical_0001" }),
      makeOptions(impl, { accountPin: "1234" }),
    );
    expect(JSON.parse(bodies[0]).ref.length).toBeGreaterThanOrEqual(5);
  });

  test("AidaPay sends the PIN and the amount; Pairgate sends neither", async () => {
    const aid = recordingFetch();
    await aidapayAdapter.purchase(
      makeRequest({ amountNgn: 1000 }),
      makeOptions(aid.impl, { accountPin: "1234" }),
    );
    const sent = JSON.parse(aid.bodies[0]);
    expect(sent.account_pin).toBe("1234");
    expect(sent.amount).toBe(1000);
    expect(sent.provider_code).toBe("mtn");

    // Pairgate must not gain either field: its code already carries the amount
    // and it has no PIN concept.
    const pg = recordingFetch();
    await pairgateAdapter.purchase(
      makeRequest({ amountNgn: 1000 }),
      makeOptions(pg.impl, { accountPin: "1234" }),
    );
    expect(pg.bodies[0]).not.toContain("account_pin");
    // Scoped to the PIN's own field, not the raw string: "1234" occurs by
    // coincidence inside `product_code: "airtime.mtn.1000"`, so a substring
    // check on the whole body would fail for a reason unrelated to secrets.
    expect(JSON.parse(pg.bodies[0]).account_pin).toBeUndefined();
    expect(JSON.parse(pg.bodies[0]).amount).toBeUndefined();
  });

  test("a row with no PIN fails cleanly instead of dispatching an empty one", async () => {
    const { impl, bodies } = recordingFetch();
    const result = await aidapayAdapter.purchase(makeRequest(), makeOptions(impl));

    expect(result.status).toBe("failed");
    if (result.status === "failed") {
      // Distinct from a provider rejection, so an operator can tell a config
      // mistake from an AidaPay-side refusal.
      expect(result.code).toBe("ACCOUNT_PIN_NOT_CONFIGURED");
    }
    // Nothing was sent, so there is nothing to reconcile.
    expect(bodies).toHaveLength(0);
  });

  test("AidaPay authenticates with the bearer header composed from the row", async () => {
    const { impl, headers } = recordingFetch();
    await aidapayAdapter.purchase(
      makeRequest(),
      makeOptions(impl, {
        accountPin: "1234",
        authHeader: "Authorization",
        authScheme: "bearer",
        apiKey: "tok_abc",
      }),
    );
    // Composed by the shared rule, not hand-built, so the probe and the real
    // call cannot authenticate differently.
    expect(headers[0].Authorization).toBe("Bearer tok_abc");
    expect(headers[0]["x-api-key"]).toBeUndefined();
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
          healthPath: "/account",
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
          healthPath: "/account",
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
        expect(calls[0].url).toBe("https://aidapay.ng/api/v1/account");
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
        healthPath: "/account",
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

/**
 * A transaction that reached `processing`, ready for a terminal verdict.
 *
 * `settleTransaction` replaced `recordOutcome` + `refundAndRelease` in slice 5:
 * the status write and the ledger movement are now one mutation, and these
 * tests exercise that single entry point rather than the pair it replaced.
 */
async function toProcessing(t: Harness, userId: any, requestId: string) {
  await seedRoute(t);
  const reserved: any = await t.mutation(internal.vtuInternal.beginPurchase, {
    userId,
    clientRequestId: requestId,
    serviceCode: "airtime.mtn.1000",
    customerIdentifier: "08031234567",
  });
  await t.mutation(internal.vtuInternal.markProcessing, {
    transactionId: reserved.transactionId,
  });
  return reserved;
}

describe("a reversed transaction always records why", () => {
  test("the verdict's reason is REQUIRED by the argument validator, not the schema", async () => {
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

      const reserved: any = await toProcessing(t, userId, "req_for_reversal");

      // Omitting the reason is rejected by the ARGUMENT VALIDATOR. This is the
      // invariant the user asked for: enforced at the one mutation that writes
      // the transition, so a `reversed` row without a reason cannot exist.
      await expect(
        t.mutation(internal.vtuInternal.settleTransaction, {
          transactionId: reserved.transactionId,
          source: "dispatch",
          verdict: { status: "failed", code: "X", message: "nope" },
        }),
      ).rejects.toThrow();

      // And an invented reason outside the enum is equally rejected.
      await expect(
        t.mutation(internal.vtuInternal.settleTransaction, {
          transactionId: reserved.transactionId,
          source: "dispatch",
          verdict: {
            status: "failed",
            reversalReason: "because_i_said_so",
            code: "X",
            message: "nope",
          },
        }),
      ).rejects.toThrow();

      const row: any = await t.mutation(internal.vtuInternal.settleTransaction, {
        transactionId: reserved.transactionId,
        source: "dispatch",
        verdict: {
          status: "failed",
          reversalReason: "provider_cancelled",
          code: "X",
          message: "provider said no",
        },
      });
      expect(row.settled).toBe(true);
      expect(row.status).toBe("reversed");

      const stored: any = await t.run(async (ctx) => ctx.db.get(reserved.transactionId));
      expect(stored.status).toBe("reversed");
      // Non-null on the reversed row, which is the invariant.
      expect(stored.reversalReason).toBe("provider_cancelled");
    });
  });

  test("all four reasons are reachable, so the table does not have to move later", async () => {
    // Three arrive as failure verdicts (the provider told us), one as an
    // operator refund of an escalated transaction. Every member of the enum is
    // reachable through `settleTransaction`, which is the property that made
    // baking the enum in early worthwhile.
    const viaProvider = ["provider_failed", "provider_cancelled", "reconciliation"] as const;

    for (const reversalReason of viaProvider) {
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
        const reserved: any = await toProcessing(t, userId, `req_${reversalReason}`);
        await t.mutation(internal.vtuInternal.settleTransaction, {
          transactionId: reserved.transactionId,
          source: "reconciliation",
          verdict: { status: "failed", reversalReason, code: "X", message: "no" },
        });
        const stored: any = await t.run(async (ctx) => ctx.db.get(reserved.transactionId));
        expect(stored.reversalReason).toBe(reversalReason);
      });
    }

    // `admin_override` needs an escalated row: the operator path only accepts
    // `unresolved`, so a refund cannot be issued for a transaction the system
    // is still trying to resolve.
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
      const reserved: any = await toProcessing(t, userId, "req_admin_override");
      await t.mutation(internal.vtuInternal.settleTransaction, {
        transactionId: reserved.transactionId,
        source: "reconciliation",
        verdict: { status: "unresolved", unresolvedReason: "max_attempts_exceeded" },
      });
      const refunded = await t.mutation(internal.vtuInternal.settleTransaction, {
        transactionId: reserved.transactionId,
        source: "admin",
        verdict: { status: "reversed", reversalReason: "admin_override", reason: "refund" },
      });
      expect(refunded.settled).toBe(true);

      const stored: any = await t.run(async (ctx) => ctx.db.get(reserved.transactionId));
      expect(stored.reversalReason).toBe("admin_override");
      expect(stored.status).toBe("reversed");
    });
  });
});

// ─── AidaPay webhook signature ──────────────────────────────────────

describe("AidaPay callback verification is timing-safe and total", () => {
  const SECRET = "ap_access_token_material";
  const RAW = JSON.stringify({
    status: "Completed",
    hash: "AP-HASH-1",
    amount: 1000,
    reference: "AP-REF-1",
  });

  /** The exact digest AidaPay computes: HMAC-SHA256 over the raw body. */
  function sign(rawBody: string, secret = SECRET): string {
    return createHmac("sha256", secret).update(rawBody).digest("hex");
  }

  /** Headers as `vtuHttp` delivers them: lowercased. */
  function headersWith(signature: string | undefined): Record<string, string> {
    return signature === undefined ? {} : { signature };
  }

  test("a correctly signed body parses to a terminal event", () => {
    const event = aidapayAdapter.verifyAndParseCallback(RAW, headersWith(sign(RAW)), SECRET);
    expect(event).not.toBeNull();
    expect(event?.providerReference).toBe("AP-HASH-1");
    expect(event?.outcome).toBe("confirmed");
    expect(event?.costNgn).toBe(1000);
  });

  test("a TAMPERED body returns null even though the signature is well formed", () => {
    // The signature is valid for the ORIGINAL bytes. Verifying the tampered
    // body against it must fail — this is the whole point of hashing the raw
    // bytes rather than a re-serialised object.
    const goodSignature = sign(RAW);
    const tampered = JSON.stringify({
      status: "Completed",
      hash: "AP-HASH-1",
      amount: 999_999,
      reference: "AP-REF-1",
    });
    expect(
      aidapayAdapter.verifyAndParseCallback(tampered, headersWith(goodSignature), SECRET),
    ).toBeNull();
  });

  test("the WRONG secret returns null", () => {
    expect(
      aidapayAdapter.verifyAndParseCallback(
        RAW,
        headersWith(sign(RAW, "some_other_token")),
        SECRET,
      ),
    ).toBeNull();
  });

  test("a MISSING signature header returns null", () => {
    expect(aidapayAdapter.verifyAndParseCallback(RAW, headersWith(undefined), SECRET)).toBeNull();
  });

  test("an EMPTY secret returns null rather than matching anything", () => {
    // A provider row with no sealed webhook secret must not accept callbacks
    // signed with the empty string.
    expect(aidapayAdapter.verifyAndParseCallback(RAW, headersWith(sign(RAW, "")), "")).toBeNull();
  });

  test("a valid signature over a NON-JSON body returns null", () => {
    const garbage = "not json at all";
    expect(
      aidapayAdapter.verifyAndParseCallback(garbage, headersWith(sign(garbage)), SECRET),
    ).toBeNull();
  });

  test("a valid signature with no reference returns null", () => {
    const noRef = JSON.stringify({ status: "Completed", amount: 1000 });
    expect(
      aidapayAdapter.verifyAndParseCallback(noRef, headersWith(sign(noRef)), SECRET),
    ).toBeNull();
  });

  test("a non-terminal status resolves nothing", () => {
    // A Processing/Pending callback is a real delivery but not a resolution;
    // returning an event would settle a transaction that is still in flight.
    for (const status of ["Processing", "Pending"]) {
      const body = JSON.stringify({ status, hash: "AP-HASH-1" });
      expect(
        aidapayAdapter.verifyAndParseCallback(body, headersWith(sign(body)), SECRET),
      ).toBeNull();
    }
  });

  test("Refund and Cancelled settle as failures, and stay distinguishable", () => {
    const refund = JSON.stringify({ status: "Refund", hash: "AP-1", amount: 1000 });
    const cancelled = JSON.stringify({ status: "Cancelled", hash: "AP-1", amount: 1000 });

    const r = aidapayAdapter.verifyAndParseCallback(refund, headersWith(sign(refund)), SECRET);
    const c = aidapayAdapter.verifyAndParseCallback(cancelled, headersWith(sign(cancelled)), SECRET);

    expect(r?.outcome).toBe("failed");
    expect(c?.outcome).toBe("failed");
    // The distinction survives to the event, which is what selects
    // `provider_cancelled` as the reversal reason for one and not the other.
    expect(r?.failureKind).toBe("rejected");
    expect(c?.failureKind).toBe("cancelled");
  });

  test("a base64-encoded signature is also accepted", () => {
    const b64 = Buffer.from(sign(RAW), "hex").toString("base64");
    const event = aidapayAdapter.verifyAndParseCallback(RAW, headersWith(b64), SECRET);
    expect(event?.providerReference).toBe("AP-HASH-1");
  });

  test("a sha256=-prefixed signature is accepted", () => {
    const event = aidapayAdapter.verifyAndParseCallback(
      RAW,
      headersWith(`sha256=${sign(RAW)}`),
      SECRET,
    );
    expect(event?.providerReference).toBe("AP-HASH-1");
  });
});

// ─── The operator's AidaPay onboarding, end to end ─────────────────

/**
 * The exact sequence an operator performs in `/admin/vtu/providers` when
 * adding AidaPay: no deploy, no code change, no migration.
 *
 * This is the step-3 claim stated as a test rather than a screenshot. Every
 * value below is one an operator types, and the assertion is that the
 * resulting row is complete enough to (a) authenticate a real call and
 * (b) pass a connection test.
 */
describe("an operator can add AidaPay entirely from the admin page", () => {
  async function seedAdminUser(t: Harness) {
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

  test("the row is created, sealed, and probed with the configured values", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdminUser(t);
      const client = t.withIdentity({ subject: adminId });

      // Exactly the fields the operator fills in.
      await client.mutation(api.vtuProviderAdmin.createProvider, {
        name: "aidapay",
        displayName: "AidaPay",
        baseUrl: "https://aidapay.ng/api/v1",
        // The access token, sealed TWICE: once as the API credential and once
        // as the webhook secret, because AidaPay keys its HMAC with the same
        // material. Sealed separately so either can be rotated alone.
        apiKey: "ap_access_token_x",
        webhookSecret: "ap_access_token_x",
        accountPin: "1234",
        authHeader: "Authorization",
        authScheme: "bearer",
        callbackSignatureHeader: "Signature",
        healthPath: "/account",
        status: "sandbox",
      });

      // 1. The row reads back with booleans, never values.
      const rows: any[] = await client.query(api.vtuProviderAdmin.listProviders, {});
      expect(rows).toHaveLength(1);
      expect(rows[0].name).toBe("aidapay");
      expect(rows[0].authScheme).toBe("bearer");
      expect(rows[0].authHeader).toBe("Authorization");
      expect(rows[0].callbackSignatureHeader).toBe("Signature");
      expect(rows[0].healthPath).toBe("/account");
      expect(rows[0].hasApiKey).toBe(true);
      expect(rows[0].hasWebhookSecret).toBe(true);
      expect(rows[0].hasAccountPin).toBe(true);

      // 2. No secret is recoverable from the admin surface.
      const serialised = JSON.stringify(rows);
      expect(serialised).not.toContain("ap_access_token_x");
      expect(serialised).not.toContain("1234");
      expect(serialised).not.toContain("cex1.");

      // 3. Test connection hits GET /account with the bearer header.
      const calls: { url: string; init: any }[] = [];
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async (url: any, init: any) => {
        calls.push({ url: String(url), init });
        return new Response(
          JSON.stringify({ name: "Crestline", email: "ops@example.com", balance: 5000 }),
          { status: 200, headers: { "content-type": "application/json" } },
        );
      }) as unknown as typeof fetch;

      try {
        const result: any = await client.action(api.vtuProviderCall.testProviderConnection, {
          name: "aidapay",
        });
        expect(result.ok).toBe(true);
        expect(calls).toHaveLength(1);
        expect(calls[0].url).toBe("https://aidapay.ng/api/v1/account");
        expect(calls[0].init.method).toBe("GET");
        expect(calls[0].init.headers.Authorization).toBe("Bearer ap_access_token_x");
        // The PIN is a PURCHASE credential and must not be spent on a health
        // probe. A test button that shipped the PIN would leak it to a
        // read-only endpoint for no benefit.
        expect(JSON.stringify(calls[0])).not.toContain("1234");
      } finally {
        globalThis.fetch = realFetch;
      }
    });
  });

  test("a sandbox row is refused for purchases until the operator activates it", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdminUser(t);

      await t.run(async (ctx) =>
        ctx.db.insert("vtuProviders", {
          name: "aidapay",
          displayName: "AidaPay",
          status: "sandbox",
          baseUrl: "https://sandbox.aidapay.ng/api/v1",
          encryptedApiKey: await encrypt("ap_sandbox_token"),
          encryptedWebhookSecret: await encrypt("ap_sandbox_token"),
          encryptedAccountPin: await encrypt("1234"),
          authHeader: "Authorization",
          authScheme: "bearer",
          callbackSignatureHeader: "Signature",
          healthPath: "/account",
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as any),
      );

      // The resolver, not the UI, is the gate. A sandbox row must never serve
      // a customer purchase.
      const resolved: any = await t.run(async (ctx: any) =>
        ctx.runQuery(internal.vtuProviderConfig.resolveForPurchase, { name: "aidapay" }),
      );
      expect(resolved.ok).toBe(false);
      expect(resolved.code).toBe("PROVIDER_DISABLED");

      // Verification still resolves: transactions dispatched before the row
      // was switched must still be able to complete.
      const verify: any = await t.run(async (ctx: any) =>
        ctx.runQuery(internal.vtuProviderConfig.resolveForVerification, { name: "aidapay" }),
      );
      expect(verify.ok).toBe(true);
    });
  });
});
