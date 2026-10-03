import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../src/convex/schema";
import { api } from "../src/convex/_generated/api";
import { decrypt, encrypt } from "../src/convex/lib/encryption";
import {
  AIDAPAY_PRESET,
  PROVIDER_PRESETS,
  PROVIDER_PRESET_LIST,
} from "../src/lib/vtuProviderPresets";
import { readFileSync } from "node:fs";

/**
 * The AidaPay quick-connect preset.
 *
 * The whole reason `applyPreset` exists is that the eight-field form let an
 * operator type a value that reads as correct and is not: `baseUrl` set to
 * `https://aidapay.ng/api/v1` produces `.../api/v1/api/v1/buy` on every
 * purchase, and surfaced only as a 404 on live traffic.
 *
 * So the constants are pinned here as literal values. A preset is the ONE
 * place a provider's constants live — imported by both the UI that previews
 * them and the mutation that writes them — and these assertions fail loudly if
 * one is ever edited to a value the adapter would reject.
 */

/**
 * Bun has no `import.meta.glob`, so the convex module map is passed
 * explicitly. Only what `vtuProviderAdmin` actually reaches is listed.
 */
const modules = {
  "src/convex/_generated/api.js": () => import("../src/convex/_generated/api.js"),
  "src/convex/_generated/server.js": () => import("../src/convex/_generated/server.js"),
  "src/convex/schema.ts": () => import("../src/convex/schema"),
  "src/convex/vtuProviderAdmin.ts": () => import("../src/convex/vtuProviderAdmin"),
  "src/convex/vtuProviderCall.ts": () => import("../src/convex/vtuProviderCall"),
  "src/convex/vtuProviderConfig.ts": () => import("../src/convex/vtuProviderConfig"),
  "src/convex/vtuRegistry.ts": () => import("../src/convex/vtuRegistry"),
  "src/convex/vtuInternal.ts": () => import("../src/convex/vtuInternal"),
  "src/convex/vtuServiceRouting.ts": () => import("../src/convex/vtuServiceRouting"),
  "src/convex/vtuShared.ts": () => import("../src/convex/vtuShared"),
  "src/convex/vtu.ts": () => import("../src/convex/vtu"),
  "src/convex/points.ts": () => import("../src/convex/points"),
  "src/convex/pricing.ts": () => import("../src/convex/pricing"),
  "src/convex/storage.ts": () => import("../src/convex/storage"),
  "src/convex/lib/encryption.ts": () => import("../src/convex/lib/encryption"),
  "src/convex/adminApi.ts": () => import("../src/convex/adminApi"),
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

async function readAidaPayRow(t: Harness, name = "aidapay"): Promise<any> {
  return t.run(async (ctx) => {
    const row = await ctx.db
      .query("vtuProviders")
      .withIndex("by_name", (q) => q.eq("name", name))
      .unique();
    return row;
  });
}

async function seedAidapay(t: Harness, overrides: Record<string, unknown> = {}) {
  const now = Date.now();
  return t.run(async (ctx) =>
    ctx.db.insert("vtuProviders", {
      name: "aidapay",
      displayName: "AidaPay",
      status: "active",
      // The exact historical misconfiguration this preset exists to prevent.
      baseUrl: "https://aidapay.ng/api/v1",
      healthPath: "/account",
      encryptedApiKey: await encrypt("ap_existing_key_0001"),
      encryptedAccountPin: await encrypt("1234"),
      timeoutMs: 20_000,
      priority: 100,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    } as any),
  );
}

// ─── Preset constants ──────────────────────────────────────────────

describe("AidaPay preset constants", () => {
  test("baseUrl is the BARE ORIGIN — the /api/v1 trap", () => {
    // The adapter composes `baseUrl + purchasePath()`, and `purchasePath()`
    // already carries `/api/v1`. A version-prefixed base double-prefixes to
    // `.../api/v1/api/v1/buy`, which is well-formed and wrong.
    expect(AIDAPAY_PRESET.baseUrl).toBe("https://aidapay.ng");
    expect(AIDAPAY_PRESET.baseUrl).not.toContain("/api");

    // And the health probe, which the Test button GETs, is the FULL path
    // including the prefix — the two fields are read differently.
    expect(AIDAPAY_PRESET.healthPath).toBe("/api/v1/my_account");
  });

  test("auth is a bearer token under `Authorization`", () => {
    expect(AIDAPAY_PRESET.authHeader).toBe("Authorization");
    expect(AIDAPAY_PRESET.authScheme).toBe("bearer");
  });

  test("the callback is signed under the `Signature` header", () => {
    // Capital S. AidaPay's docs spell it that way and verification reads the
    // row's own value, so a lowercase guess fails every callback.
    expect(AIDAPAY_PRESET.callbackSignatureHeader).toBe("Signature");
  });

  test("a 4-digit account PIN is required", () => {
    // `/buy` demands `account_pin`; the adapter refuses to dispatch without
    // one rather than sending a placeholder.
    expect(AIDAPAY_PRESET.requiresAccountPin).toBe(true);
  });

  test("priority sits BELOW Pairgate, so Pairgate stays the fallback", () => {
    // Lower runs first. AidaPay wins for products it has a route for; Pairgate
    // keeps serving the rest. Raising this would shadow the fallback with a
    // provider that may not have the route.
    expect(AIDAPAY_PRESET.priority).toBe(50);
    expect(AIDAPAY_PRESET.priority).toBeLessThan(100);
  });

  test("the preset is reachable by name and in the list", () => {
    expect(PROVIDER_PRESETS["aidapay"]).toBe(AIDAPAY_PRESET);
    expect(PROVIDER_PRESET_LIST.map((p) => p.name)).toContain("aidapay");
    // The registry key must equal the adapter's `name`, which is what routing
    // and resolution join on.
    expect(AIDAPAY_PRESET.name).toBe("aidapay");
  });

  test("webhookPath is a route that is actually registered", () => {
    // The path is the only place the provider identity can live: AidaPay's
    // dashboard cannot attach a custom header to its callbacks.
    expect(AIDAPAY_PRESET.webhookPath).toBe("/api/webhooks/vtu/aidapay");

    // Asserted against the router source so the preset cannot name a path that
    // nothing serves.
    const http = readFileSync("src/convex/http.ts", "utf8");
    expect(http).toContain(`path: "${AIDAPAY_PRESET.webhookPath}"`);
  });

  test("timeoutMs is a real bound, not a placeholder", () => {
    expect(AIDAPAY_PRESET.timeoutMs).toBe(20_000);
  });
});

// ─── Creating from the preset ──────────────────────────────────────

describe("applyPreset creates a correct row from two fields", () => {
  test("API key + PIN produce a complete, sealed row", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);

      const result: any = await t.withIdentity({ subject: adminId }).mutation(
        api.vtuProviderAdmin.applyPreset,
        { preset: "aidapay", apiKey: "ap_live_key_12345", accountPin: "1234" },
      );
      expect(result.created).toBe(true);

      const row = await readAidaPayRow(t);
      expect(row.name).toBe("aidapay");
      expect(row.displayName).toBe("AidaPay");
      // Every constant came from the preset, not from the operator.
      expect(row.baseUrl).toBe(AIDAPAY_PRESET.baseUrl);
      expect(row.healthPath).toBe(AIDAPAY_PRESET.healthPath);
      expect(row.authHeader).toBe(AIDAPAY_PRESET.authHeader);
      expect(row.authScheme).toBe(AIDAPAY_PRESET.authScheme);
      expect(row.callbackSignatureHeader).toBe(AIDAPAY_PRESET.callbackSignatureHeader);
      expect(row.timeoutMs).toBe(AIDAPAY_PRESET.timeoutMs);
      expect(row.priority).toBe(AIDAPAY_PRESET.priority);

      // Both secrets are sealed at the boundary and open to the right values.
      expect(await decrypt(row.encryptedApiKey)).toBe("ap_live_key_12345");
      expect(await decrypt(row.encryptedAccountPin)).toBe("1234");
    });
  });

  test("a new row is SANDBOX unless the operator ticks go-live", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);
      const client = t.withIdentity({ subject: adminId });

      await client.mutation(api.vtuProviderAdmin.applyPreset, {
        preset: "aidapay",
        apiKey: "ap_live_key_12345",
        accountPin: "1234",
      });
      // Default: a provider that has never answered a connection test does not
      // belong in the live routing table.
      expect((await readAidaPayRow(t)).status).toBe("sandbox");

      // Explicit go-live, on a second provider, is honoured.
      await client.mutation(api.vtuProviderAdmin.applyPreset, {
        preset: "aidapay",
        apiKey: "ap_live_key_12345",
        accountPin: "1234",
        activate: true,
      });
      expect((await readAidaPayRow(t)).status).toBe("active");
    });
  });

  test("the preset is case- and whitespace-insensitive by name", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);

      await t.withIdentity({ subject: adminId }).mutation(
        api.vtuProviderAdmin.applyPreset,
        { preset: "  AidaPay ", apiKey: "k", accountPin: "1234" },
      );
      expect((await readAidaPayRow(t)).baseUrl).toBe(AIDAPAY_PRESET.baseUrl);
    });
  });

  test("an unknown preset names the known ones instead of guessing", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);

      await expect(
        t.withIdentity({ subject: adminId }).mutation(api.vtuProviderAdmin.applyPreset, {
          preset: "aidapai",
          apiKey: "k",
          accountPin: "1234",
        }),
      ).rejects.toThrow(/aidapay/);
    });
  });

  test("a blank API key is refused when there is no stored one", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);

      await expect(
        t.withIdentity({ subject: adminId }).mutation(api.vtuProviderAdmin.applyPreset, {
          preset: "aidapay",
          apiKey: "   ",
          accountPin: "1234",
        }),
      ).rejects.toThrow();

      // The refusal is inert: nothing was half-created.
      const rows = await t.run(async (ctx) => ctx.db.query("vtuProviders").collect());
      expect(rows).toHaveLength(0);
    });
  });

  test("a non-admin cannot apply a preset", async () => {
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
        t.withIdentity({ subject: userId }).mutation(api.vtuProviderAdmin.applyPreset, {
          preset: "aidapay",
          apiKey: "k",
          accountPin: "1234",
        }),
      ).rejects.toThrow();

      const rows = await t.run(async (ctx) => ctx.db.query("vtuProviders").collect());
      expect(rows).toHaveLength(0);
    });
  });

  test("the apply is audited without the secret", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);

      await t.withIdentity({ subject: adminId }).mutation(
        api.vtuProviderAdmin.applyPreset,
        { preset: "aidapay", apiKey: "ap_live_key_12345", accountPin: "1234" },
      );

      const audits: any[] = await t.run(async (ctx) =>
        ctx.db.query("auditLogs").collect(),
      );
      const entry = audits.find((a) => a.action === "vtu_provider_preset_applied");
      expect(entry).toBeDefined();
      expect(entry?.resourceId).toBe("aidapay");
      expect(entry?.after?.hasApiKey).toBe(true);
      // The audit log is readable by every admin; a secret in it is a secret
      // on the page.
      expect(JSON.stringify(audits)).not.toContain("ap_live_key_12345");
      expect(JSON.stringify(audits)).not.toContain("1234");
    });
  });
});

// ─── Repairing an existing row ─────────────────────────────────────

describe("applyPreset repairs an existing row without rotating secrets", () => {
  test("the /api/v1 misconfiguration is corrected in place", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);
      await seedAidapay(t);

      const result: any = await t.withIdentity({ subject: adminId }).mutation(
        api.vtuProviderAdmin.applyPreset,
        { preset: "aidapay", apiKey: "ap_live_key_12345", accountPin: "1234" },
      );
      expect(result.created).toBe(false);

      const row = await readAidaPayRow(t);
      expect(row.baseUrl).toBe("https://aidapay.ng");
      expect(row.healthPath).toBe("/api/v1/my_account");
      expect(row.callbackSignatureHeader).toBe("Signature");
      expect(row.authScheme).toBe("bearer");
      // Priority is NOT a constant: it belongs to the operator, so a repair
      // leaves it exactly as it was. The preset's 50 is the default for a NEW
      // row, not something a repair overwrites.
      expect(row.priority).toBe(100);
    });
  });

  test("an omitted PIN leaves the sealed PIN untouched", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);
      await seedAidapay(t);
      const before = await readAidaPayRow(t);

      // Repairing the constants of a configured provider must not demand the
      // operator re-type a secret they already saved.
      await t.withIdentity({ subject: adminId }).mutation(
        api.vtuProviderAdmin.applyPreset,
        { preset: "aidapay", apiKey: "ap_live_key_12345" },
      );

      const after = await readAidaPayRow(t);
      expect(after.encryptedAccountPin).toBe(before.encryptedAccountPin);
      expect(await decrypt(after.encryptedAccountPin!)).toBe("1234");
    });
  });

  test("an explicitly supplied PIN does rotate it", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);
      await seedAidapay(t);

      await t.withIdentity({ subject: adminId }).mutation(
        api.vtuProviderAdmin.applyPreset,
        { preset: "aidapay", apiKey: "ap_live_key_12345", accountPin: "9090" },
      );

      const after = await readAidaPayRow(t);
      expect(await decrypt(after.encryptedAccountPin!)).toBe("9090");
    });
  });

  test("status and priority are operator choices, left alone unless passed", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);
      await seedAidapay(t, { status: "active", priority: 7 });

      // A live provider must not be silently dropped back to sandbox by
      // re-running the quick-connect form.
      await t.withIdentity({ subject: adminId }).mutation(
        api.vtuProviderAdmin.applyPreset,
        { preset: "aidapay", apiKey: "ap_live_key_12345" },
      );

      const row = await readAidaPayRow(t);
      expect(row.status).toBe("active");
      expect(row.priority).toBe(7);

      // …and both can still be changed deliberately.
      await t.withIdentity({ subject: adminId }).mutation(
        api.vtuProviderAdmin.applyPreset,
        { preset: "aidapay", apiKey: "ap_live_key_12345", status: "sandbox", priority: 50 },
      );
      const after = await readAidaPayRow(t);
      expect(after.status).toBe("sandbox");
      expect(after.priority).toBe(50);
    });
  });

  test("re-running is idempotent — one row, constants unchanged", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);
      // A SANDBOX row, so `activate` is never passed and status is untouched.
      await seedAidapay(t, { status: "sandbox" });
      const client = t.withIdentity({ subject: adminId });

      await client.mutation(api.vtuProviderAdmin.applyPreset, {
        preset: "aidapay",
        apiKey: "ap_live_key_12345",
      });
      const first = await readAidaPayRow(t);
      await client.mutation(api.vtuProviderAdmin.applyPreset, {
        preset: "aidapay",
        apiKey: "ap_live_key_12345",
      });
      const second = await readAidaPayRow(t);

      const rows = await t.run(async (ctx) => ctx.db.query("vtuProviders").collect());
      expect(rows).toHaveLength(1);
      expect(second._id).toBe(first._id);
      expect(second.baseUrl).toBe(first.baseUrl);
      expect(second.priority).toBe(first.priority);
      expect(second.status).toBe("sandbox");
    });
  });

  test("an omitted API key repairs the constants without re-typing the secret", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);
      await seedAidapay(t);
      const before = await readAidaPayRow(t);

      // The case this form exists for: the endpoint was wrong and only the
      // endpoint needs fixing. Demanding the key again would reintroduce the
      // friction the preset path removes.
      const result: any = await t.withIdentity({ subject: adminId }).mutation(
        api.vtuProviderAdmin.applyPreset,
        { preset: "aidapay", accountPin: "1234" },
      );
      expect(result.created).toBe(false);

      const after = await readAidaPayRow(t);
      expect(after.baseUrl).toBe("https://aidapay.ng");
      expect(after.healthPath).toBe("/api/v1/my_account");
      expect(after.encryptedApiKey).toBe(before.encryptedApiKey);
      expect(await decrypt(after.encryptedApiKey!)).toBe("ap_existing_key_0001");
    });
  });

  test("an omitted API key on a row whose key was cleared is refused", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);
      await seedAidapay(t, { encryptedApiKey: "" });

      // No key supplied and none stored: refusing is the only safe answer,
      // because writing the constants would produce a row that looks
      // configured and fails on the first purchase.
      await expect(
        t.withIdentity({ subject: adminId }).mutation(api.vtuProviderAdmin.applyPreset, {
          preset: "aidapay",
          accountPin: "1234",
        }),
      ).rejects.toThrow(/API key/i);
    });
  });

  test("ticking go-live on an existing sandbox row promotes it", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);
      await seedAidapay(t, { status: "sandbox" });

      // The checkbox has to work on the row being repaired, not only on the
      // insert path — otherwise ticking it during a repair silently does
      // nothing and the operator believes the provider went live.
      await t.withIdentity({ subject: adminId }).mutation(
        api.vtuProviderAdmin.applyPreset,
        { preset: "aidapay", apiKey: "ap_live_key_12345", activate: true },
      );

      expect((await readAidaPayRow(t)).status).toBe("active");
    });
  });
});

// ─── The PIN requirement ───────────────────────────────────────────

describe("a PIN-required preset refuses to configure without one", () => {
  test("no PIN and no stored PIN is an error, and writes nothing", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);

      await expect(
        t.withIdentity({ subject: adminId }).mutation(api.vtuProviderAdmin.applyPreset, {
          preset: "aidapay",
          apiKey: "ap_live_key_12345",
        }),
      ).rejects.toThrow(/PIN/i);

      // Refused BEFORE any write: a half-configured row would look configured
      // in the admin table and fail only on the first live purchase.
      const rows = await t.run(async (ctx) => ctx.db.query("vtuProviders").collect());
      expect(rows).toHaveLength(0);
    });
  });

  test("an existing row whose PIN was cleared also refuses", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);
      await seedAidapay(t, { encryptedAccountPin: undefined });

      await expect(
        t.withIdentity({ subject: adminId }).mutation(api.vtuProviderAdmin.applyPreset, {
          preset: "aidapay",
          apiKey: "ap_live_key_12345",
        }),
      ).rejects.toThrow(/PIN/i);

      // And the row is untouched — the refused call did not half-repair it.
      const row = await readAidaPayRow(t);
      expect(row.baseUrl).toBe("https://aidapay.ng/api/v1");
    });
  });

  test("the error names the provider so the admin knows which field is missing", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);

      let message = "";
      try {
        await t.withIdentity({ subject: adminId }).mutation(
          api.vtuProviderAdmin.applyPreset,
          { preset: "aidapay", apiKey: "k" },
        );
      } catch (error) {
        message = String((error as Error).message ?? error);
      }
      expect(message).toContain("AidaPay");
      expect(message).toContain("PIN");
    });
  });
});

// ─── The probe that runs after connecting ──────────────────────────

/**
 * The inline connection test.
 *
 * Connecting and then probing is only useful if the row the PRESET produced
 * is probeable. These drive the real action over a row created by the real
 * mutation — no hand-seeded row — because the failure that matters is a
 * mismatch between the two: a preset that writes a base URL the probe cannot
 * compose would report a healthy-looking connect followed by a 404.
 *
 * The probe is GET-only and never touches the purchase path; that is asserted
 * here rather than assumed, because a test button wired to a spending path
 * holds a live key.
 */
describe("a row created from the preset probes correctly", () => {
  /** Apply the preset, then run the real probe action with fetch captured. */
  async function connectAndProbe(respond: () => Response) {
    const t = convexTest(schema, modules);
    const adminId = await seedAdmin(t);
    const client = t.withIdentity({ subject: adminId });

    await client.mutation(api.vtuProviderAdmin.applyPreset, {
      preset: "aidapay",
      apiKey: "ap_live_token_0001",
      accountPin: "1234",
    });

    const calls: { url: string; init: any }[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: any, init: any) => {
      calls.push({ url: String(url), init });
      return respond();
    }) as unknown as typeof fetch;

    try {
      const result: any = await client.action(
        api.vtuProviderCall.testProviderConnection,
        { name: "aidapay" },
      );
      return { result, calls, row: await readAidaPayRow(t) };
    } finally {
      globalThis.fetch = realFetch;
    }
  }

  test("the probe hits the health path on the bare origin, with bearer auth", async () => {
    await withMasterKey(async () => {
      const { result, calls } = await connectAndProbe(
        () =>
          new Response("{}", {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      );

      expect(result.ok).toBe(true);
      expect(calls).toHaveLength(1);
      // The composition trap, asserted end to end: base + healthPath must be
      // `https://aidapay.ng/api/v1/my_account`, never `.../api/v1/api/v1/...`.
      expect(calls[0].url).toBe("https://aidapay.ng/api/v1/my_account");
      // GET only, and with the row's own auth scheme.
      expect(calls[0].init.method).toBe("GET");
      expect(calls[0].init.headers.Authorization).toBe("Bearer ap_live_token_0001");
    });
  });

  test("the probe is recorded on the row for the admin table", async () => {
    await withMasterKey(async () => {
      const { row } = await connectAndProbe(
        () =>
          new Response("{}", {
            status: 200,
            headers: { "content-type": "application/json" },
          }),
      );

      // The provider table renders lastTestedAt/lastTestOk, so a probe that
      // did not record would leave the card's success contradicted by the row
      // moments later.
      expect(row.lastTestOk).toBe(true);
      expect(typeof row.lastTestedAt).toBe("number");
    });
  });

  test("a rejected key reports CREDENTIALS_REJECTED, not a generic failure", async () => {
    await withMasterKey(async () => {
      const { result, calls } = await connectAndProbe(
        () => new Response("nope", { status: 401 }),
      );

      // The admin's most important distinction: wrong key vs unreachable
      // host. They have completely different fixes.
      expect(result.ok).toBe(false);
      expect(result.error).toBe("CREDENTIALS_REJECTED");
      expect(calls).toHaveLength(1);
    });
  });

  test("a 404 from a wrongly-composed base is reported as HTTP_404", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);
      const client = t.withIdentity({ subject: adminId });

      // The historical misconfiguration, still a real possibility on a row
      // this feature did not create.
      await seedAidapay(t, { status: "sandbox" });

      const calls: string[] = [];
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async (url: any) => {
        calls.push(String(url));
        return new Response("nope", { status: 404 });
      }) as unknown as typeof fetch;

      try {
        const result: any = await client.action(
          api.vtuProviderCall.testProviderConnection,
          { name: "aidapay" },
        );
        // Asserted precisely: this double-prefixed URL is the exact shape
        // that produced the original live 404.
        expect(calls[0]).toBe("https://aidapay.ng/api/v1/account");
        expect(result.ok).toBe(false);
        expect(result.error).toBe("HTTP_404");
      } finally {
        globalThis.fetch = realFetch;
      }
    });
  });

  test("a repaired row probes the corrected URL", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);
      const client = t.withIdentity({ subject: adminId });
      await seedAidapay(t, { status: "sandbox" });

      // Apply the preset to repair the constants...
      await client.mutation(api.vtuProviderAdmin.applyPreset, {
        preset: "aidapay",
        accountPin: "1234",
      });

      // …and confirm the probe now goes to the right place. This is the
      // repair loop the card exists to support, closed end to end.
      const calls: string[] = [];
      const realFetch = globalThis.fetch;
      globalThis.fetch = (async (url: any) => {
        calls.push(String(url));
        return new Response("{}", {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }) as unknown as typeof fetch;

      try {
        const result: any = await client.action(
          api.vtuProviderCall.testProviderConnection,
          { name: "aidapay" },
        );
        expect(calls[0]).toBe("https://aidapay.ng/api/v1/my_account");
        expect(result.ok).toBe(true);
      } finally {
        globalThis.fetch = realFetch;
      }
    });
  });

  test("a network failure is reported, not thrown", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);
      const client = t.withIdentity({ subject: adminId });
      await client.mutation(api.vtuProviderAdmin.applyPreset, {
        preset: "aidapay",
        apiKey: "ap_live_token_0001",
        accountPin: "1234",
      });

      const realFetch = globalThis.fetch;
      globalThis.fetch = (async () => {
        throw new Error("getaddrinfo ENOTFOUND aidapay.ng");
      }) as unknown as typeof fetch;

      try {
        const result: any = await client.action(
          api.vtuProviderCall.testProviderConnection,
          { name: "aidapay" },
        );
        // A returned failure, because a thrown message is redacted in
        // production and would reach the card as "Server Error".
        expect(result.ok).toBe(false);
        expect(result.error).toContain("ENOTFOUND");
      } finally {
        globalThis.fetch = realFetch;
      }
    });
  });
});

// ─── The callback URL the operator pastes ──────────────────────────

describe("getPresetSetup", () => {
  test("returns the constants and a full callback URL", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);
      const previous = process.env.CONVEX_SITE_URL;
      process.env.CONVEX_SITE_URL = "https://example.convex.site/";
      try {
        const setup: any = await t
          .withIdentity({ subject: adminId })
          .query(api.vtuProviderAdmin.getPresetSetup, { preset: "aidapay" });

        expect(setup.baseUrl).toBe(AIDAPAY_PRESET.baseUrl);
        expect(setup.healthPath).toBe(AIDAPAY_PRESET.healthPath);
        expect(setup.webhookPath).toBe(AIDAPAY_PRESET.webhookPath);
        expect(setup.requiresAccountPin).toBe(true);
        // Trailing slash on the site URL must not double up before the path.
        expect(setup.callbackUrl).toBe(
          `https://example.convex.site${AIDAPAY_PRESET.webhookPath}`,
        );
      } finally {
        if (previous === undefined) delete process.env.CONVEX_SITE_URL;
        else process.env.CONVEX_SITE_URL = previous;
      }
    });
  });

  test("falls back to the bare path when the site URL is unknown", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);
      const previous = process.env.CONVEX_SITE_URL;
      delete process.env.CONVEX_SITE_URL;
      try {
        const setup: any = await t
          .withIdentity({ subject: adminId })
          .query(api.vtuProviderAdmin.getPresetSetup, { preset: "aidapay" });
        // A path-only value is still copy-pasteable and still tells the admin
        // which route to register; it never fabricates a host.
        expect(setup.callbackUrl).toBe(AIDAPAY_PRESET.webhookPath);
      } finally {
        if (previous !== undefined) process.env.CONVEX_SITE_URL = previous;
      }
    });
  });

  test("an unknown preset is null, not a throw", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const adminId = await seedAdmin(t);
      const setup: any = await t
        .withIdentity({ subject: adminId })
        .query(api.vtuProviderAdmin.getPresetSetup, { preset: "nope" });
      expect(setup).toBeNull();
    });
  });

  test("a non-admin cannot read the setup", async () => {
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
        t.withIdentity({ subject: userId }).query(api.vtuProviderAdmin.getPresetSetup, {
          preset: "aidapay",
        }),
      ).rejects.toThrow();
    });
  });
});