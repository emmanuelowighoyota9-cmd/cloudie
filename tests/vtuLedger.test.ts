import { describe, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import {
  airtimeServiceCode,
  isValidRequestId,
  maskIdentifier,
  parseServiceCode,
  pointsForNaira,
  resolveVtuPointsCost,
  validatePhone,
  vtuPurchaseKey,
  vtuRefundKey,
} from "../src/lib/vtu";
import { sanitizeForLog } from "../src/convex/vtuShared";
import { decrypt, encrypt, isSecretError } from "../src/convex/lib/encryption";
import { mapPurchaseResponse, pairgateAdapter } from "../src/convex/vtuPairgate";

// ─── Idempotency keys ──────────────────────────────────────────────

describe("VTU idempotency keys", () => {
  test("purchase and refund keys are namespaced differently", () => {
    // `pointLedger` keys on ONE global index, so a shared namespace would let
    // a refund collide with its own debit.
    expect(vtuPurchaseKey("abc")).toBe("vtu:purchase:abc");
    expect(vtuRefundKey("abc")).toBe("vtu:refund:abc");
    expect(vtuPurchaseKey("abc")).not.toBe(vtuRefundKey("abc"));
  });

  test("keys do not collide with the document engine's namespaces", () => {
    expect(vtuPurchaseKey("x")).not.toContain("docrender");
    expect(vtuRefundKey("x")).not.toContain("docrender");
  });

  test("purchase keys are never namespaced by provider", () => {
    // A retry must dedupe even when slice 3 routes it to a different
    // aggregator, which is why the key is derived from the request id alone.
    expect(vtuPurchaseKey("r1")).toBe(vtuPurchaseKey("r1"));
    expect(vtuPurchaseKey("r1")).toBe("vtu:purchase:r1");
  });

  test("refund keys vary per transaction", () => {
    // Each attempt is its own transaction, so a distinct key per row needs no
    // further guarding beyond the `failed -> reversed` status check.
    expect(vtuRefundKey("t1")).not.toBe(vtuRefundKey("t2"));
  });

  test("requestId validation rejects weak or malformed ids", () => {
    expect(isValidRequestId("vtu_abc123xy")).toBe(true);
    expect(isValidRequestId("short")).toBe(false);
    expect(isValidRequestId("has spaces in it")).toBe(false);
    expect(isValidRequestId("")).toBe(false);
  });
});

// ─── Naira → points ────────────────────────────────────────────────

describe("naira to points conversion", () => {
  test("converts at the configured rate", () => {
    expect(pointsForNaira(1500, 15)).toBe(100);
    expect(pointsForNaira(1000, 15)).toBe(67); // 66.67
  });

  test("rounds UP so a customer never underpays for delivered airtime", () => {
    expect(pointsForNaira(100, 15)).toBe(7); // 6.67
    expect(pointsForNaira(1, 15)).toBe(1);
    expect(pointsForNaira(31, 15)).toBe(3); // 2.07
  });

  test("rejects nonsense inputs instead of returning a wrong price", () => {
    expect(() => pointsForNaira(0, 15)).toThrow();
    expect(() => pointsForNaira(Number.NaN, 15)).toThrow();
    expect(() => pointsForNaira(100, 0)).toThrow();
  });

  test("an active override wins outright over the conversion", () => {
    expect(resolveVtuPointsCost(1000, 15, 50)).toBe(50);
    expect(resolveVtuPointsCost(1000, 15, undefined)).toBe(67);
    expect(resolveVtuPointsCost(1000, 15, null)).toBe(67);
    expect(resolveVtuPointsCost(1000, 15, 0)).toBe(67);
  });
});

// ─── Service codes ─────────────────────────────────────────────────

describe("airtime service codes", () => {
  test("round-trips", () => {
    const code = airtimeServiceCode("MTN", 1000);
    expect(code).toBe("airtime.mtn.1000");
    expect(parseServiceCode(code)).toEqual({
      serviceType: "airtime",
      network: "mtn",
      amountNgn: 1000,
    });
  });

  test("rejects unknown networks and out-of-range amounts", () => {
    expect(() => airtimeServiceCode("vodafone", 1000)).toThrow();
    expect(() => airtimeServiceCode("mtn", 50)).toThrow();
    expect(() => airtimeServiceCode("mtn", 100_001)).toThrow();
  });

  test("parses unknown shapes to null rather than guessing", () => {
    expect(parseServiceCode("data.mtn.1")).toBeNull();
    expect(parseServiceCode("airtime.vodafone.1000")).toBeNull();
    expect(parseServiceCode("")).toBeNull();
  });
});

// ─── Destination numbers ───────────────────────────────────────────

describe("phone validation and masking", () => {
  test("accepts and normalises Nigerian mobile numbers", () => {
    expect(validatePhone("08031234567").ok).toBe(true);
    expect(validatePhone("+2348031234567").ok).toBe(true);
    const spaced = validatePhone("0803 123 4567");
    expect(spaced.ok && spaced.value).toBe("08031234567");
  });

  test("rejects numbers that cannot receive airtime", () => {
    expect(validatePhone("12345").ok).toBe(false);
    expect(validatePhone("").ok).toBe(false);
  });

  test("masking keeps only the last four digits", () => {
    const masked = maskIdentifier("08031234567");
    expect(masked.endsWith("4567")).toBe(true);
    expect(masked).not.toContain("0803");
  });

  test("masking hides short values entirely", () => {
    expect(maskIdentifier("123")).toBe("***");
  });
});

// ─── Log sanitisation ──────────────────────────────────────────────

describe("payload sanitisation", () => {
  test("redacts anything that looks like a credential", () => {
    const out = sanitizeForLog({
      phone: "08031234567",
      api_key: "sk-live-123",
      apiKey: "sk-live-456",
      authorization: "Bearer abc",
      nested: { secret: "s3cr3t", password: "hunter2", signature: "sig" },
    }) as Record<string, any>;

    expect(out.phone).toBe("08031234567");
    expect(out.api_key).toBe("[redacted]");
    expect(out.apiKey).toBe("[redacted]");
    expect(out.authorization).toBe("[redacted]");
    expect(out.nested.secret).toBe("[redacted]");
    expect(out.nested.password).toBe("[redacted]");
    expect(out.nested.signature).toBe("[redacted]");
  });

  test("caps oversized strings and arrays", () => {
    const out = sanitizeForLog({
      long: "x".repeat(5_000),
      many: Array.from({ length: 200 }, (_, i) => i),
    }) as Record<string, any>;

    expect(String(out.long).length).toBeLessThan(2_100);
    expect(out.many.length).toBe(50);
  });

  test("bounds recursion depth", () => {
    let deep: any = { value: "bottom" };
    for (let i = 0; i < 12; i++) deep = { child: deep };
    expect(() => sanitizeForLog(deep)).not.toThrow();
  });
});

// ─── Credential sealing ────────────────────────────────────────────
//
// Now async and reading APP_MASTER_KEY from the environment, because the
// platform helper is shared by V8 mutations (which seal) and Node actions
// (which open), so it must run on WebCrypto in both runtimes.

describe("credential sealing", () => {
  const PRIMARY = "primary-master-key-for-tests-0001";
  const OTHER = "a-completely-different-master-key-0002";

  function withMasterKey<T>(fn: () => Promise<T>, value = PRIMARY): Promise<T> {
    const previous = process.env.APP_MASTER_KEY;
    const previousLegacy = process.env.VTU_ENCRYPTION_SECRET;
    process.env.APP_MASTER_KEY = value;
    delete process.env.VTU_ENCRYPTION_SECRET;
    return fn().finally(() => {
      if (previous === undefined) delete process.env.APP_MASTER_KEY;
      else process.env.APP_MASTER_KEY = previous;
      if (previousLegacy !== undefined) {
        process.env.VTU_ENCRYPTION_SECRET = previousLegacy;
      }
    });
  }

  test("round-trips a credential", async () => {
    await withMasterKey(async () => {
      const sealed = await encrypt("pg_live_key_12345");
      expect(sealed).not.toContain("pg_live_key_12345");
      expect(await decrypt(sealed)).toBe("pg_live_key_12345");
    });
  });

  test("the format is self-describing and carries a key id", async () => {
    await withMasterKey(async () => {
      const sealed = await encrypt("pg_live_key_12345");
      const parts = sealed.split(".");
      // cex1 | alg | kid | iv | tag | ct
      expect(parts).toHaveLength(6);
      expect(parts[0]).toBe("cex1");
      expect(parts[1]).toBe("aes-256-gcm");
      // The kid is what makes a later rotation possible without downtime.
      expect(parts[2]).toBe("master");
    });
  });

  test("a different master key cannot open the payload", async () => {
    await withMasterKey(async () => {
      const sealed = await encrypt("pg_live_key_12345");
      process.env.APP_MASTER_KEY = OTHER;
      await expect(decrypt(sealed)).rejects.toThrow();
    });
  });

  test("a tampered payload is rejected, not silently mis-decrypted", async () => {
    await withMasterKey(async () => {
      const sealed = await encrypt("pg_live_key_12345");
      const parts = sealed.split(".");
      parts[5] = Buffer.from("tampered").toString("base64");
      await expect(decrypt(parts.join("."))).rejects.toThrow();
    });
  });

  test("a truncated payload is a typed failure, not a crash", async () => {
    await withMasterKey(async () => {
      const sealed = await encrypt("pg_live_key_12345");
      await expect(decrypt(sealed.slice(0, 20))).rejects.toThrow();
      const err = await decrypt("nonsense").catch((e) => e);
      expect(isSecretError(err)).toBe(true);
    });
  });

  test("refuses to seal without a master key", async () => {
    const previous = process.env.APP_MASTER_KEY;
    delete process.env.APP_MASTER_KEY;
    try {
      await expect(encrypt("x")).rejects.toThrow();
    } finally {
      if (previous !== undefined) process.env.APP_MASTER_KEY = previous;
    }
  });
});

// ─── Provider response mapping ────────────────────────────────────

describe("Pairgate response mapping", () => {
  test("maps a success payload", () => {
    const result = mapPurchaseResponse(
      { status: "success", reference: "PG-1", cost: 1000 },
      "req-1",
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.providerReference).toBe("PG-1");
      expect(result.costNgn).toBe(1000);
    }
  });

  test("unwraps a nested data envelope", () => {
    const result = mapPurchaseResponse(
      { data: { status: "successful", reference: "PG-2", amount: "500" } },
      "req-2",
    );
    expect(result.status).toBe("success");
    if (result.status === "success") expect(result.costNgn).toBe(500);
  });

  test("maps a definitive rejection to `failed`", () => {
    const result = mapPurchaseResponse(
      { status: "failed", code: "INVALID_METER", message: "Bad meter" },
      "req-3",
    );
    expect(result.status).toBe("failed");
    if (result.status === "failed") expect(result.code).toBe("INVALID_METER");
  });

  test("success without a price is `unknown`, never a bogus success", () => {
    const result = mapPurchaseResponse({ status: "success", reference: "PG-4" }, "req-4");
    expect(result.status).toBe("unknown");
  });

  test("an unrecognised payload is `unknown`, not an optimistic guess", () => {
    expect(mapPurchaseResponse({ weird: true }, "req-5").status).toBe("unknown");
  });

  test("every branch carries `raw` for the audit trail", () => {
    // Stripping `raw` deletes the only record of what the aggregator said.
    for (const body of [
      { status: "success", reference: "PG", cost: 10 },
      { status: "failed", message: "no" },
      { nonsense: 1 },
    ]) {
      expect(mapPurchaseResponse(body, "r")).toHaveProperty("raw");
    }
  });
});

// ─── verifyAndParseCallback ────────────────────────────────────────

describe("verifyAndParseCallback (single call)", () => {
  const SECRET = "callback-secret-value";
  const BODY = JSON.stringify({ reference: "PG-1", status: "success" });
  const sign = (body: string, secret = SECRET) =>
    createHmac("sha256", secret).update(body).digest("hex");

  test("returns the event for a correctly signed body", () => {
    const event = pairgateAdapter.verifyAndParseCallback(
      BODY,
      { "x-pairgate-signature": sign(BODY) },
      SECRET,
    );
    expect(event?.providerReference).toBe("PG-1");
    expect(event?.outcome).toBe("confirmed");
  });

  test("accepts a `sha256=` prefixed signature", () => {
    expect(
      pairgateAdapter.verifyAndParseCallback(
        BODY,
        { "x-signature": `sha256=${sign(BODY)}` },
        SECRET,
      )?.providerReference,
    ).toBe("PG-1");
  });

  test("a tampered body yields null — never a parsed event", () => {
    const tampered = JSON.stringify({ reference: "PG-1", status: "failed" });
    expect(
      pairgateAdapter.verifyAndParseCallback(
        tampered,
        { "x-signature": sign(BODY) },
        SECRET,
      ),
    ).toBeNull();
  });

  test("a wrong secret yields null", () => {
    expect(
      pairgateAdapter.verifyAndParseCallback(BODY, { "x-signature": sign(BODY) }, "nope"),
    ).toBeNull();
  });

  test("no signature yields null", () => {
    expect(pairgateAdapter.verifyAndParseCallback(BODY, {}, SECRET)).toBeNull();
  });

  test("no configured secret yields null", () => {
    expect(
      pairgateAdapter.verifyAndParseCallback(BODY, { "x-signature": sign(BODY) }, ""),
    ).toBeNull();
  });

  test("a length-mismatched signature yields null without throwing", () => {
    expect(
      pairgateAdapter.verifyAndParseCallback(BODY, { "x-signature": "abc" }, SECRET),
    ).toBeNull();
  });

  test("a signed but unparseable body yields null", () => {
    const raw = "not json at all";
    expect(
      pairgateAdapter.verifyAndParseCallback(raw, { "x-signature": sign(raw) }, SECRET),
    ).toBeNull();
  });

  test("a signed payload with no outcome signal yields null", () => {
    // Resolving a transaction on a guess would be worse than doing nothing.
    const raw = JSON.stringify({ reference: "PG-3" });
    expect(
      pairgateAdapter.verifyAndParseCallback(raw, { "x-signature": sign(raw) }, SECRET),
    ).toBeNull();
  });

  test("maps a failure event", () => {
    const raw = JSON.stringify({ reference: "PG-2", status: "failed", message: "no" });
    const event = pairgateAdapter.verifyAndParseCallback(
      raw,
      { "x-signature": sign(raw) },
      SECRET,
    );
    expect(event?.outcome).toBe("failed");
  });
});

// ─── Interface shape ───────────────────────────────────────────────

describe("adapter interface", () => {
  test("exposes verify() for future reconciliation", () => {
    // Present now so slice 4 does not have to break every adapter.
    expect(typeof pairgateAdapter.verify).toBe("function");
    expect(typeof pairgateAdapter.purchase).toBe("function");
    expect(typeof pairgateAdapter.verifyAndParseCallback).toBe("function");
  });

  test("verify() reports an unreachable provider as unknown, not failed", async () => {
    const result = await pairgateAdapter.verify("PG-1", {
      baseUrl: "http://127.0.0.1:9",
      apiKey: "k",
      timeoutMs: 200,
      fetchImpl: fetch,
    });
    expect(result.status).toBe("unknown");
  });
});
