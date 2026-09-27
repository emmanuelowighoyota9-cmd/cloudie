import { describe, expect, test } from "bun:test";
import {
  MIN_VTU_COST_NGN,
  isValidRequestId,
  maskIdentifier,
  pointsForNaira,
  validateCustomerIdentifier,
  vtuPurchaseKey,
  vtuRefundKey,
} from "../src/lib/vtu";
import { sanitizeForLog } from "../src/convex/vtuShared";
import { decryptVtuSecret, encryptVtuSecret } from "../src/convex/vtuCrypto";
import {
  mapPurchaseResponse,
  pairgateAdapter,
} from "../src/convex/vtuPairgate";
import { createHmac } from "node:crypto";

// ─── Idempotency keys ──────────────────────────────────────────────

describe("VTU idempotency keys", () => {
  test("purchase and refund keys are namespaced differently", () => {
    // This is the property the whole design rests on: `pointLedger` keys on ONE
    // global index, so a shared namespace would let a reversal collide with
    // its own debit and silently refund nothing.
    expect(vtuPurchaseKey("abc")).toBe("vtu:purchase:abc");
    expect(vtuRefundKey("abc")).toBe("vtu:refund:abc");
    expect(vtuPurchaseKey("abc")).not.toBe(vtuRefundKey("abc"));
  });

  test("keys do not collide with the document engine's namespaces", () => {
    expect(vtuPurchaseKey("x")).not.toContain("docrender");
    expect(vtuRefundKey("x")).not.toContain("docrender");
  });

  test("refund key is stable for the same requestId", () => {
    // Stability is what makes a second reversal a no-op rather than a
    // double credit.
    expect(vtuRefundKey("r1")).toBe(vtuRefundKey("r1"));
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
    // 15 naira per point (DEFAULT_POINT_RATE).
    expect(pointsForNaira(1500, 15)).toBe(100);
    expect(pointsForNaira(225, 15)).toBe(15);
  });

  test("rounds UP so a customer never underpays for delivered airtime", () => {
    // 100 / 15 = 6.67 — must never bill 6.
    expect(pointsForNaira(100, 15)).toBe(7);
    expect(pointsForNaira(1, 15)).toBe(1);
    expect(pointsForNaira(31, 15)).toBe(3); // 2.07 → 3
  });

  test("applies markup in basis points", () => {
    // ₦1,000 at 15/pt = 66.67 → 67; +10% = 73.33 → 74
    expect(pointsForNaira(1000, 15, 1000)).toBe(74);
  });

  test("rejects nonsense inputs instead of returning a wrong price", () => {
    expect(() => pointsForNaira(0, 15)).toThrow();
    expect(() => pointsForNaira(MIN_VTU_COST_NGN - 0.5, 15)).toThrow();
    expect(() => pointsForNaira(NaN, 15)).toThrow();
    expect(() => pointsForNaira(100, 0)).toThrow();
    expect(() => pointsForNaira(100, 15, -5)).toThrow();
  });
});

// ─── Identifier handling ───────────────────────────────────────────

describe("customer identifier validation", () => {
  test("accepts and normalises Nigerian phone numbers", () => {
    expect(validateCustomerIdentifier("airtime", "08031234567").ok).toBe(true);
    expect(validateCustomerIdentifier("airtime", "+2348031234567").ok).toBe(true);
    const spaced = validateCustomerIdentifier("data", "0803 123 4567");
    expect(spaced.ok && spaced.value).toBe("08031234567");
  });

  test("rejects numbers that cannot receive airtime", () => {
    expect(validateCustomerIdentifier("airtime", "12345").ok).toBe(false);
    expect(validateCustomerIdentifier("airtime", "").ok).toBe(false);
  });

  test("applies per-service length rules", () => {
    // A meter number is not a phone number and vice versa.
    expect(validateCustomerIdentifier("electricity", "451234567890").ok).toBe(true);
    expect(validateCustomerIdentifier("electricity", "0803").ok).toBe(false);
    expect(validateCustomerIdentifier("cable", "12345678").ok).toBe(true);
    expect(validateCustomerIdentifier("exam", "1234567890").ok).toBe(true);
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

describe("VTU credential sealing", () => {
  const SECRET = "a-32-byte-test-master-key-value!!";

  test("round-trips a credential", () => {
    const sealed = encryptVtuSecret("pg_live_key_12345", SECRET);
    expect(sealed).not.toContain("pg_live_key_12345");
    expect(decryptVtuSecret(sealed, SECRET)).toBe("pg_live_key_12345");
  });

  test("a different key cannot open the payload", () => {
    const sealed = encryptVtuSecret("pg_live_key_12345", SECRET);
    expect(() => decryptVtuSecret(sealed, "wrong-key")).toThrow();
  });

  test("a tampered payload is rejected, not silently mis-decrypted", () => {
    const sealed = encryptVtuSecret("pg_live_key_12345", SECRET);
    const parts = sealed.split(".");
    // `v1:iv` | tag | ciphertext — the ciphertext is the third segment.
    expect(parts).toHaveLength(3);
    parts[2] = Buffer.from("tampered").toString("base64");
    expect(() => decryptVtuSecret(parts.join("."), SECRET)).toThrow();
  });

  test("refuses to seal without a key", () => {
    expect(() => encryptVtuSecret("x", "")).toThrow();
  });
});

// ─── Pairgate response mapping ────────────────────────────────────

describe("Pairgate response mapping", () => {
  test("maps a success payload", () => {
    const result = mapPurchaseResponse(
      { status: "success", reference: "PG-1", cost: 1000, serial: "S-9" },
      "req-1",
    );
    expect(result.status).toBe("success");
    if (result.status === "success") {
      expect(result.providerReference).toBe("PG-1");
      expect(result.costNgn).toBe(1000);
      expect(result.serial).toBe("S-9");
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
    // Marking this success would leave the customer out of pocket with
    // nothing to reconcile against.
    const result = mapPurchaseResponse({ status: "success", reference: "PG-4" }, "req-4");
    expect(result.status).toBe("unknown");
  });

  test("an unrecognised payload is `unknown`, not an optimistic guess", () => {
    const result = mapPurchaseResponse({ weird: true }, "req-5");
    expect(result.status).toBe("unknown");
  });
});

// ─── Callback signature verification ───────────────────────────────

describe("webhook signature verification", () => {
  const SECRET = "callback-secret-value";
  const BODY = JSON.stringify({ reference: "PG-1", status: "success" });
  const sign = (body: string, secret = SECRET) =>
    createHmac("sha256", secret).update(body).digest("hex");

  test("accepts a correctly signed raw body", () => {
    expect(
      pairgateAdapter.verifyCallback(BODY, { "x-signature": sign(BODY) }, SECRET),
    ).toBe(true);
  });

  test("accepts a `sha256=` prefixed signature", () => {
    expect(
      pairgateAdapter.verifyCallback(
        BODY,
        { "x-signature": `sha256=${sign(BODY)}` },
        SECRET,
      ),
    ).toBe(true);
  });

  test("rejects a wrong secret", () => {
    expect(
      pairgateAdapter.verifyCallback(BODY, { "x-signature": sign(BODY) }, "nope"),
    ).toBe(false);
  });

  test("rejects a tampered body", () => {
    const tampered = JSON.stringify({ reference: "PG-1", status: "failed" });
    expect(
      pairgateAdapter.verifyCallback(tampered, { "x-signature": sign(BODY) }, SECRET),
    ).toBe(false);
  });

  test("rejects when no signature is present", () => {
    expect(pairgateAdapter.verifyCallback(BODY, {}, SECRET)).toBe(false);
  });

  test("rejects when no callback secret is configured", () => {
    expect(pairgateAdapter.verifyCallback(BODY, { "x-signature": sign(BODY) }, "")).toBe(
      false,
    );
  });

  test("rejects a length-mismatched signature without throwing", () => {
    expect(
      pairgateAdapter.verifyCallback(BODY, { "x-signature": "abc" }, SECRET),
    ).toBe(false);
  });
});

// ─── Callback parsing ──────────────────────────────────────────────

describe("callback parsing", () => {
  test("parses a success event", () => {
    const event = pairgateAdapter.parseCallback(
      JSON.stringify({ reference: "PG-1", status: "success", cost: 1000 }),
    );
    expect(event?.outcome).toBe("success");
    expect(event?.providerReference).toBe("PG-1");
  });

  test("parses a failure event", () => {
    const event = pairgateAdapter.parseCallback(
      JSON.stringify({ reference: "PG-2", status: "failed", message: "no" }),
    );
    expect(event?.outcome).toBe("failed");
  });

  test("returns null for unparseable or signal-free payloads", () => {
    // Resolving on a guess would be worse than doing nothing.
    expect(pairgateAdapter.parseCallback("not json")).toBeNull();
    expect(pairgateAdapter.parseCallback(JSON.stringify({ reference: "PG-3" }))).toBeNull();
    expect(pairgateAdapter.parseCallback(JSON.stringify({ status: "success" }))).toBeNull();
  });
});
