import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../src/convex/schema";
import { internal, api } from "../src/convex/_generated/api";
import { getAdapter, registerAdapter } from "../src/convex/vtuRegistry";
import { encrypt } from "../src/convex/lib/encryption";
import { routeProduct } from "../src/convex/vtuServiceRouting";
import type { VtuProviderAdapter } from "../src/convex/vtuShared";

/**
 * Slice 2 tests: providers are runtime DATA, not env vars.
 *
 * These run against a real Convex implementation (`convex-test`) using the
 * same harness pattern as `documentChargingConvex.test.ts` — an explicit module
 * map, because Bun has no `import.meta.glob`.
 *
 * What they are really pinning down:
 *   - resolution reads the table and has NO env fallback
 *   - a second provider resolves through the IDENTICAL code path, which is the
 *     entire justification for this slice
 *   - every failure is a TYPED code, never a silent fallback and never an
 *     unhandled crypto exception
 */

const modules = {
  "src/convex/_generated/api.js": () => import("../src/convex/_generated/api.js"),
  "src/convex/_generated/server.js": () => import("../src/convex/_generated/server.js"),
  "src/convex/schema.ts": () => import("../src/convex/schema"),
  "src/convex/vtuProviderConfig.ts": () => import("../src/convex/vtuProviderConfig"),
  "src/convex/vtuProviderAdmin.ts": () => import("../src/convex/vtuProviderAdmin"),
  "src/convex/vtuInternal.ts": () => import("../src/convex/vtuInternal"),
  "src/convex/vtuServiceRouting.ts": () => import("../src/convex/vtuServiceRouting"),
  "src/convex/vtu.ts": () => import("../src/convex/vtu"),
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

type Row = {
  name: string;
  status: "active" | "sandbox" | "disabled";
  encryptedApiKey: string;
  encryptedWebhookSecret?: string;
  [key: string]: unknown;
};

async function seedProvider(
  t: Harness,
  row: Partial<Row> & { name: string; encryptedApiKey: string },
) {
  const now = Date.now();
  return t.run(async (ctx) =>
    ctx.db.insert("vtuProviders", {
      displayName: row.name,
      status: "active",
      baseUrl: "https://api.example.com",
      timeoutMs: 20_000,
      priority: 100,
      createdAt: now,
      updatedAt: now,
      ...row,
    } as any),
  );
}

const resolvePurchase = (name: string) => (t: Harness) =>
  t.query(internal.vtuProviderConfig.resolveForPurchase, { name });

const resolveVerify = (name: string) => (t: Harness) =>
  t.query(internal.vtuProviderConfig.resolveForVerification, { name });

// ─── Resolution reads the table ────────────────────────────────────

describe("provider resolution reads the table, never env", () => {
  test("Pairgate resolves from a seeded row", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const sealed = await encrypt("pg_live_key_12345");
      await seedProvider(t, {
        name: "pairgate",
        status: "sandbox",
        encryptedApiKey: sealed,
        encryptedWebhookSecret: await encrypt("whsec_pairgate"),
      });

      const result: any = await resolvePurchase("pairgate")(t);

      // `sandbox` deliberately does NOT resolve for a new purchase: a sandbox
      // key is for integration work, not live customer money.
      expect(result.ok).toBe(false);
      expect(result.code).toBe("PROVIDER_DISABLED");

      // …but it DOES resolve for webhook verification, so transactions
      // dispatched before a status change can still complete.
      const verify: any = await resolveVerify("pairgate")(t);
      expect(verify.ok).toBe(true);
      expect(verify.provider.name).toBe("pairgate");
    });
  });

  test("an active row resolves and exposes only SEALED values", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const sealed = await encrypt("pg_live_key_12345");
      await seedProvider(t, { name: "pairgate", encryptedApiKey: sealed });

      const result: any = await resolvePurchase("pairgate")(t);
      expect(result.ok).toBe(true);
      expect(result.provider.encryptedApiKey).toBe(sealed);

      // The secret must not appear anywhere in the resolved payload.
      const serialised = JSON.stringify(result);
      expect(serialised).not.toContain("pg_live_key_12345");
    });
  });

  test("a missing row is PROVIDER_NOT_FOUND — never an env fallback", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      // Point the env var at a real-looking credential. Resolution must still
      // fail: a deleted row must fail loudly rather than resurrect a secret.
      process.env.PAIRGATE_API_KEY = "should-never-be-used";
      try {
        const result: any = await resolvePurchase("pairgate")(t);
        expect(result.ok).toBe(false);
        expect(result.code).toBe("PROVIDER_NOT_FOUND");
      } finally {
        delete process.env.PAIRGATE_API_KEY;
      }
    });
  });
});

// ─── The two-provider generalisation ───────────────────────────────

/**
 * A second provider, registered from the TEST FILE ONLY.
 *
 * This is the whole justification for slice 2: if a second provider needs
 * different resolution code, the registry was a hard-coded branch and slice 4
 * would be a rewrite. Here it resolves through the identical path.
 */
const stubAdapter: VtuProviderAdapter = {
  name: "stubco",
  displayName: "StubCo",
  async purchase(req) {
    stubAdapterAttempts.push({ requestId: req.requestId, attemptId: req.attemptId });
    return { status: "success", providerReference: "STUB-1", costNgn: 100, raw: {} };
  },
  verifyAndParseCallback() {
    return null;
  },
  async verify() {
    return { status: "unknown", message: "stub", raw: {} };
  },
};

/** What the stub was handed, so a test can assert on the request it received. */
const stubAdapterAttempts: { requestId: string; attemptId: string }[] = [];

describe("registry generalises to a second provider", () => {
  test("a stub adapter registers and resolves by name", () => {
    // The registry is a lookup against a SET, not a hard-coded branch.
    expect(getAdapter("pairgate")).not.toBeNull();

    registerAdapter(stubAdapter);
    const resolved = getAdapter("stubco");
    expect(resolved).not.toBeNull();
    expect(resolved?.name).toBe("stubco");
  });

  test("both providers resolve through the identical code path", async () => {
    await withMasterKey(async () => {
      registerAdapter(stubAdapter);
      const t = convexTest(schema, modules);

      await seedProvider(t, {
        name: "pairgate",
        encryptedApiKey: await encrypt("pg_live_key_12345"),
      });
      await seedProvider(t, {
        name: "stubco",
        displayName: "StubCo",
        encryptedApiKey: await encrypt("stub_live_key_99999"),
      });

      // Same function, two different names. No branching, no special case.
      const pairgate: any = await resolvePurchase("pairgate")(t);
      const stub: any = await resolvePurchase("stubco")(t);

      expect(pairgate.ok).toBe(true);
      expect(stub.ok).toBe(true);
      expect(pairgate.provider.name).toBe("pairgate");
      expect(stub.provider.name).toBe("stubco");

      // And both have a registered adapter, which is the join the resolver
      // depends on at call time.
      expect(getAdapter(pairgate.provider.name)).not.toBeNull();
      expect(getAdapter(stub.provider.name)).not.toBeNull();

      // Neither leaks plaintext.
      expect(JSON.stringify(pairgate)).not.toContain("pg_live_key_12345");
      expect(JSON.stringify(stub)).not.toContain("stub_live_key_99999");
    });
  });

  test("both providers are handed the SAME request type, attemptId included", async () => {
    // The point of `attemptId` living on `ProviderPurchaseRequest` rather than
    // on one adapter: a second aggregator must not need its own plumbing to
    // receive a per-dispatch reference. Adding it to the shared type is all
    // that bought, and this is the test that says so.
    registerAdapter(stubAdapter);
    stubAdapterAttempts.length = 0;

    const bodies: string[] = [];
    const recordingFetch = (async (_url: any, init: any) => {
      bodies.push(String(init?.body ?? ""));
      return new Response(JSON.stringify({ status: "success", reference: "PG-1", cost: 100 }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }) as unknown as typeof fetch;

    const request = {
      requestId: "req_shared_0001",
      attemptId: "tx_shared_0001",
      serviceType: "airtime",
      productCode: "airtime.mtn.1000",
      customerIdentifier: "08031234567",
      network: "MTN",
    } as any;

    const opts = {
      baseUrl: "https://api.pairgate.com",
      apiKey: "pg_live_key_12345",
      timeoutMs: 5_000,
      fetchImpl: recordingFetch,
    } as any;

    // Identical call against two different providers, resolved from the
    // registry. No branch, no special case, no per-provider argument list.
    const viaPairgate = await getAdapter("pairgate")!.purchase(request, opts);
    const viaStub = await getAdapter("stubco")!.purchase(request, opts);

    expect(viaPairgate.status).toBe("success");
    expect(viaStub.status).toBe("success");

    // Pairgate uses the logical id and ignores the physical one.
    expect(JSON.parse(bodies[0]).reference).toBe("req_shared_0001");
    expect(bodies[0]).not.toContain("tx_shared_0001");

    // The second provider received the physical id and can use it as a
    // never-repeating upstream ref.
    expect(stubAdapterAttempts).toEqual([
      { requestId: "req_shared_0001", attemptId: "tx_shared_0001" },
    ]);
  });

  test("the two-provider claim holds with ROUTING in the path", async () => {
    // Slice 3 puts a routing table between the purchase and the registry, so
    // the question is no longer "can two providers share a request type" but
    // "does routing reintroduce a per-provider branch". It does not: one
    // canonical product, two routes, two DIFFERENT provider product codes,
    // and both adapters are handed the same request shape.
    await withMasterKey(async () => {
      registerAdapter(stubAdapter);
      stubAdapterAttempts.length = 0;

      const t = convexTest(schema, modules);
      await seedProvider(t, { name: "pairgate", encryptedApiKey: await encrypt("pg_key") });
      await seedProvider(t, {
        name: "stubco",
        displayName: "StubCo",
        encryptedApiKey: await encrypt("stub_key"),
      });
      const now = Date.now();
      await t.run(async (ctx) => {
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
        // The two providers disagree about the product code — Pairgate embeds
        // the amount, StubCo uses a fixed id. Neither knows about the other.
        await ctx.db.insert("vtuServiceRouting", {
          productCode: "airtime-mtn",
          provider: "pairgate",
          providerProductCode: "airtime.mtn.{amount}",
          priority: 1,
          active: true,
          createdAt: now,
          updatedAt: now,
        });
        await ctx.db.insert("vtuServiceRouting", {
          productCode: "airtime-mtn",
          provider: "stubco",
          providerProductCode: "mtn-airtime",
          priority: 2,
          active: true,
          createdAt: now,
          updatedAt: now,
        });
      });

      const before: any = await t.run((ctx) => routeProduct(ctx as any, "airtime-mtn"));

      // Same product, same algorithm; the winner changes only because a DATA
      // row changed, never because a branch in the code did.
      expect(before.ok).toBe(true);
      expect(before.winner.provider).toBe("pairgate");

      await t.run(async (ctx) => {
        const rows = await ctx.db.query("vtuProviders").collect();
        await ctx.db.patch(rows.find((r) => r.name === "pairgate")!._id, { status: "disabled" });
      });
      const afterDisable: any = await t.run((ctx) => routeProduct(ctx as any, "airtime-mtn"));
      expect(afterDisable.winner.provider).toBe("stubco");
      // And the winning row supplies a DIFFERENT product code with no code
      // change anywhere — which is the whole point of the routing table.
      expect(afterDisable.winner.providerProductCode).toBe("mtn-airtime");
      expect(before.winner.providerProductCode).toBe("airtime.mtn.{amount}");
    });
  });

  test("a row with no registered adapter still resolves — the CALL fails closed", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      // No adapter is registered for this name.
      await seedProvider(t, {
        name: "unimplemented",
        encryptedApiKey: await encrypt("some_key"),
      });

      const result: any = await resolvePurchase("unimplemented")(t);
      // Resolution succeeds; `getAdapter` returns null and the Node layer
      // converts that into ADAPTER_UNKNOWN. Failing here instead would break
      // the admin flow of staging a provider before its adapter is written.
      expect(result.ok).toBe(true);
      expect(getAdapter("unimplemented")).toBeNull();
    });
  });
});

// ─── Status semantics ──────────────────────────────────────────────

describe("provider status", () => {
  test("disabled blocks new purchases but still verifies webhooks", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      await seedProvider(t, {
        name: "pairgate",
        status: "disabled",
        encryptedApiKey: await encrypt("k"),
        encryptedWebhookSecret: await encrypt("w"),
      });

      const purchase: any = await resolvePurchase("pairgate")(t);
      expect(purchase.ok).toBe(false);
      expect(purchase.code).toBe("PROVIDER_DISABLED");

      // A disabled provider must still verify callbacks, or transactions
      // dispatched before the change strand in `unknown` with no way out.
      const verify: any = await resolveVerify("pairgate")(t);
      expect(verify.ok).toBe(true);
    });
  });

  test("a row with no webhook secret cannot verify", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      await seedProvider(t, {
        name: "pairgate",
        encryptedApiKey: await encrypt("k"),
      });

      const verify: any = await resolveVerify("pairgate")(t);
      expect(verify.ok).toBe(false);
      expect(verify.code).toBe("CREDENTIAL_MISSING");
    });
  });

  test("a missing credential is CREDENTIAL_MISSING, not a null deref", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      await seedProvider(t, { name: "pairgate", encryptedApiKey: "" });

      const result: any = await resolvePurchase("pairgate")(t);
      expect(result.ok).toBe(false);
      expect(result.code).toBe("CREDENTIAL_MISSING");
    });
  });
});

// ─── Admin surface ─────────────────────────────────────────────────

describe("admin provider surface", () => {
  test("the list query never returns a sealed or plaintext credential", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);
      const sealed = await encrypt("pg_live_key_12345");
      await seedProvider(t, {
        name: "pairgate",
        encryptedApiKey: sealed,
        encryptedWebhookSecret: await encrypt("whsec_abc"),
      });

      const rows: any = await t.withIdentity({ subject: adminId }).query(
        api.vtuProviderAdmin.listProviders,
        {},
      );

      expect(rows).toHaveLength(1);
      // Booleans, never values. This is the property that keeps a decrypted
      // key out of every subscribed admin browser.
      expect(rows[0].hasApiKey).toBe(true);
      expect(rows[0].hasWebhookSecret).toBe(true);
      expect(rows[0].encryptedApiKey).toBeUndefined();
      expect(rows[0].encryptedWebhookSecret).toBeUndefined();

      const serialised = JSON.stringify(rows);
      expect(serialised).not.toContain("pg_live_key_12345");
      expect(serialised).not.toContain("whsec_abc");
      expect(serialised).not.toContain(sealed);
    });
  });

  test("a non-admin cannot list providers", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const userId = await t.run(async (ctx) =>
        ctx.db.insert("users", {
          name: "Ada",
          email: "ada@example.com",
          role: "user",
          pointsBalance: 0,
          createdAt: Date.now(),
        }),
      );

      await expect(
        t.withIdentity({ subject: userId }).query(api.vtuProviderAdmin.listProviders, {}),
      ).rejects.toThrow();
    });
  });

  test("the migration is idempotent — re-running creates no duplicate", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);
      const previous = process.env.PAIRGATE_API_KEY;
      process.env.PAIRGATE_API_KEY = "pg_env_key_0001";
      try {
        const client = t.withIdentity({ subject: adminId });

        const first: any = await client.mutation(
          api.vtuProviderAdmin.migratePairgateFromEnv,
          {},
        );
        expect(first.action).toBe("inserted");

        // Second and third runs must be no-ops, and must NOT overwrite an
        // admin-set credential.
        const second: any = await client.mutation(
          api.vtuProviderAdmin.migratePairgateFromEnv,
          {},
        );
        expect(second.action).toBe("noop");
        const third: any = await client.mutation(
          api.vtuProviderAdmin.migratePairgateFromEnv,
          {},
        );
        expect(third.action).toBe("noop");

        const rows = await t.run(async (ctx) => ctx.db.query("vtuProviders").collect());
        expect(rows).toHaveLength(1);
        expect(rows[0].name).toBe("pairgate");
        // The env-seeded key survived both no-op runs.
        expect(await t.run(async (ctx) =>
          (await ctx.db.get(rows[0]._id)).encryptedApiKey,
        )).toBeTruthy();

        // ── Across the schema change ──────────────────────────────
        // The migration was NOT edited for the account-PIN and auth-scheme
        // columns, and that is the point: it is still a no-op against a row
        // shape that gained two optional fields. These assertions fail if a
        // future change starts writing them, duplicates them, or starts
        // stamping a second row on a re-run.
        const after: any = await t.run(async (ctx) => ctx.db.get(rows[0]._id));
        expect(after.encryptedAccountPin).toBeUndefined();
        expect(after.authScheme).toBeUndefined();
        // The fields the migration DOES own are untouched by re-running.
        expect(after.status).toBe("sandbox");
        expect(after.authHeader).toBe("x-api-key");
        expect(after.callbackSignatureHeader).toBe("x-pairgate-signature");

        // A FOURTH run, after the schema change, is still a no-op. Proves
        // idempotency is a property of the mutation rather than of a run
        // count.
        const fourth: any = await client.mutation(
          api.vtuProviderAdmin.migratePairgateFromEnv,
          {},
        );
        expect(fourth.action).toBe("noop");
        expect(await t.run(async (ctx) => ctx.db.query("vtuProviders").collect())).toHaveLength(1);
      } finally {
        if (previous === undefined) delete process.env.PAIRGATE_API_KEY;
        else process.env.PAIRGATE_API_KEY = previous;
      }
    });
  });

  test("the migration seeds sandbox, matching what slice 1 actually ran", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);
      const previous = process.env.PAIRGATE_API_KEY;
      process.env.PAIRGATE_API_KEY = "pg_env_key_0001";
      try {
        await t
          .withIdentity({ subject: adminId })
          .mutation(api.vtuProviderAdmin.migratePairgateFromEnv, {});

        const row: any = await t.run(async (ctx) => {
          const rows = await ctx.db.query("vtuProviders").collect();
          return rows[0];
        });
        // Sandbox, not active: nothing changes for existing users, and a
        // sandbox key can never be routed live by accident.
        expect(row.status).toBe("sandbox");
      } finally {
        if (previous === undefined) delete process.env.PAIRGATE_API_KEY;
        else process.env.PAIRGATE_API_KEY = previous;
      }
    });
  });

  test("a missing PAIRGATE_API_KEY is reported, not thrown", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);
      const previous = process.env.PAIRGATE_API_KEY;
      delete process.env.PAIRGATE_API_KEY;
      try {
        const result: any = await t
          .withIdentity({ subject: adminId })
          .mutation(api.vtuProviderAdmin.migratePairgateFromEnv, {});

        // Returned rather than thrown: Convex redacts the message of a thrown
        // error in a production deployment, so a throw reached the admin as
        // "Server Error / Called by client" and the explanation never left the
        // server. The button looked broken while it was working as intended.
        expect(result.action).toBe("no_env");

        // And the refusal is inert — a missing key cannot half-create a row —
        // but it is still audited, because an operator pressing the button is a
        // thing that happened.
        const { rows, audits } = await t.run(async (ctx) => ({
          rows: await ctx.db.query("vtuProviders").collect(),
          audits: await ctx.db.query("auditLogs").collect(),
        }));
        expect(rows).toHaveLength(0);
        expect(
          audits.some((a) => a.action === "vtu_provider_migration_skipped"),
        ).toBe(true);
      } finally {
        if (previous !== undefined) process.env.PAIRGATE_API_KEY = previous;
      }
    });
  });
});

// ─── Corrupt credentials ───────────────────────────────────────────

describe("corrupt credentials fail cleanly", () => {
  test("a truncated payload does not throw an unhandled crypto error", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      await seedProvider(t, { name: "pairgate", encryptedApiKey: "cex1.aes-256-gcm" });

      // Resolution succeeds — the row is structurally fine.
      const result: any = await resolvePurchase("pairgate")(t);
      expect(result.ok).toBe(true);

      // The Node layer converts this into CREDENTIAL_CORRUPT via tryDecrypt,
      // which never rethrows. Asserted here at the unit level so the
      // behaviour is pinned even though the action itself needs a network.
      const { tryDecrypt } = await import("../src/convex/lib/encryption");
      const opened = await tryDecrypt("cex1.aes-256-gcm");
      expect(opened.ok).toBe(false);
      expect((opened as any).code).toBe("MALFORMED_CIPHERTEXT");
    });
  });

  test("a payload sealed under a different master key fails cleanly", async () => {
    const t = convexTest(schema, modules);

    // Sealed under a key that is NOT the current one.
    process.env.APP_MASTER_KEY = "some-other-master-key-9999";
    const foreign = await encrypt("pg_live_key_12345");
    process.env.APP_MASTER_KEY = MASTER;

    const { tryDecrypt } = await import("../src/convex/lib/encryption");
    const opened = await tryDecrypt(foreign);
    expect(opened.ok).toBe(false);
    // The kid resolves to a real key, so the failure is a tag mismatch —
    // reported as DECRYPTION_FAILED rather than an unhandled exception.
    expect((opened as any).code).toBe("DECRYPTION_FAILED");

    // And the row is still storable, so admin can replace the key.
    await seedProvider(t, { name: "pairgate", encryptedApiKey: foreign });
    const result: any = await resolvePurchase("pairgate")(t);
    expect(result.ok).toBe(true);
  });
});
