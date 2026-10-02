import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import { convexTest } from "convex-test";
import schema from "../src/convex/schema";
import { encrypt } from "../src/convex/lib/encryption";

/**
 * The per-provider VTU webhook path.
 *
 * AidaPay's dashboard cannot attach a custom request header to its callbacks,
 * so the provider has to be nameable from the URL the aggregator itself
 * configures. What is asserted here is the RESOLUTION ORDER — path beats
 * header beats the `pairgate` default — and that order only exists at the HTTP
 * layer, so these tests drive the real router (`t.fetch`) rather than calling
 * the verification action directly.
 *
 * Every callback below is deliberately UNMATCHED (no transaction carries the
 * reference), so a 200 proves exactly one thing: the payload authenticated
 * against the secret of the provider the route named. A settlement would prove
 * the same thing with more moving parts.
 *
 * Each provider is signed with its OWN envelope: AidaPay says
 * `status: "Completed"` and echoes `hash`, Pairgate says `status: "success"`
 * and echoes `reference`. A well-signed body in the wrong dialect still fails
 * verification, because the adapter only reports an event for a status word it
 * recognises — a real property of this system, and the reason both shapes are
 * spelled out rather than stubbed with a generic one.
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
  // The real HTTP router: the resolution order lives in its route table and
  // its handler, and neither is reachable from an action call.
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
const AIDAPAY_WEBHOOK_SECRET = "ap_webhook_secret";
const PAIRGATE_WEBHOOK_SECRET = "pg_webhook_secret";

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
 * Both provider rows, REALLY sealed, with distinct webhook secrets.
 *
 * Distinct secrets are the whole test: a signature that verifies proves which
 * row supplied the key, and a shared secret would make every route look
 * correct.
 */
async function seedProviders(t: Harness) {
  const now = Date.now();
  await t.run(async (ctx) => {
    await ctx.db.insert("vtuProviders", {
      name: "pairgate",
      displayName: "Pairgate",
      status: "active",
      baseUrl: "https://api.pairgate.com",
      encryptedApiKey: await encrypt("pg_api_key"),
      encryptedWebhookSecret: await encrypt(PAIRGATE_WEBHOOK_SECRET),
      priority: 100,
      createdAt: now,
      updatedAt: now,
    } as any);
    await ctx.db.insert("vtuProviders", {
      name: "aidapay",
      displayName: "AidaPay",
      status: "active",
      baseUrl: "https://aidapay.ng",
      authHeader: "Authorization",
      authScheme: "bearer",
      callbackSignatureHeader: "Signature",
      encryptedApiKey: await encrypt("ap_access_token"),
      encryptedWebhookSecret: await encrypt(AIDAPAY_WEBHOOK_SECRET),
      priority: 100,
      createdAt: now,
      updatedAt: now,
    } as any);
  });
}

/** Both providers sign the raw body with HMAC-SHA256, keyed on their secret. */
const sign = (secret: string, body: string) =>
  createHmac("sha256", secret).update(body).digest("hex");

const AIDAPAY_BODY = JSON.stringify({ status: "Completed", hash: "AP-REF-1", cost: 100 });
const PAIRGATE_BODY = JSON.stringify({ status: "success", reference: "PG-REF-1", cost: 100 });

describe("per-provider VTU webhook path", () => {
  test("the path names the provider, verified against AidaPay's own secret", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      await seedProviders(t);

      const response = await t.fetch("/api/webhooks/vtu/aidapay", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          signature: sign(AIDAPAY_WEBHOOK_SECRET, AIDAPAY_BODY),
        },
        body: AIDAPAY_BODY,
      });

      // Authenticated. An unmatched reference is still a 200 by design: a 4xx
      // would make the aggregator retry something that will never resolve.
      expect(response.status).toBe(200);
      expect((await response.json()).outcome).toBe("unmatched");

      // The audit row names the provider the PATH selected — the proof this
      // ran as AidaPay rather than as the default.
      const audit: any = await t.run(async (ctx) => ctx.db.query("auditLogs").first());
      expect(audit.action).toBe("vtu_callback_unmatched");
      expect(audit.after.provider).toBe("aidapay");
    });
  });

  test("Pairgate's secret does not authenticate a request to AidaPay's path", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      await seedProviders(t);

      const response = await t.fetch("/api/webhooks/vtu/aidapay", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          signature: sign(PAIRGATE_WEBHOOK_SECRET, AIDAPAY_BODY),
        },
        body: AIDAPAY_BODY,
      });

      expect(response.status).toBe(401);
      const body: any = await response.json();
      expect(body.reason).toBe("signature_mismatch");
    });
  });

  test("the path beats a conflicting header", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      await seedProviders(t);

      // A header naming the WRONG provider must not move verification: the
      // path is what the operator pinned on AidaPay's side, and it is what
      // AidaPay actually signs for.
      const response = await t.fetch("/api/webhooks/vtu/aidapay", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-vtu-provider": "pairgate",
          signature: sign(AIDAPAY_WEBHOOK_SECRET, AIDAPAY_BODY),
        },
        body: AIDAPAY_BODY,
      });

      expect(response.status).toBe(200);
    });
  });

  test("the bare route still resolves the provider from the header", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      await seedProviders(t);

      const response = await t.fetch("/api/webhooks/vtu", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-vtu-provider": "aidapay",
          signature: sign(AIDAPAY_WEBHOOK_SECRET, AIDAPAY_BODY),
        },
        body: AIDAPAY_BODY,
      });

      expect(response.status).toBe(200);
    });
  });

  test("the bare route with no header still defaults to pairgate", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      await seedProviders(t);

      // Same body, two different keys: only the key decides here, so the pair
      // isolates WHICH secret the default resolved to.
      const pairgateSigned = await t.fetch("/api/webhooks/vtu", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          signature: sign(PAIRGATE_WEBHOOK_SECRET, PAIRGATE_BODY),
        },
        body: PAIRGATE_BODY,
      });
      expect(pairgateSigned.status).toBe(200);

      // And the same body signed by AidaPay is refused: the default really is
      // Pairgate, not "try every secret until one verifies".
      const aidapaySigned = await t.fetch("/api/webhooks/vtu", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          signature: sign(AIDAPAY_WEBHOOK_SECRET, PAIRGATE_BODY),
        },
        body: PAIRGATE_BODY,
      });
      expect(aidapaySigned.status).toBe(401);
    });
  });

  test("an unregistered provider path is a 404, not a fallback", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      await seedProviders(t);

      const response = await t.fetch("/api/webhooks/vtu/nosuchprovider", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          signature: sign(AIDAPAY_WEBHOOK_SECRET, AIDAPAY_BODY),
        },
        body: AIDAPAY_BODY,
      });

      // Routes are registered one provider at a time on purpose: a wildcard
      // would answer for a provider nobody configured, and a 404 on the
      // callback URL is the honest answer.
      expect(response.status).toBe(404);
    });
  });
});
