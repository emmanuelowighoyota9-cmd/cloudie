import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../src/convex/schema";
import { internal } from "../src/convex/_generated/api";
import { vtuPurchaseKey, vtuRefundKey } from "../src/lib/vtu";

/**
 * Integration tests for the VTU money path, run against a real Convex
 * implementation (`convex-test`) rather than a mirror of the logic.
 *
 * The pure-function tests in `vtuLedger.test.ts` pin the arithmetic. They
 * cannot catch what actually breaks in a payments system: a debit that never
 * lands, a reversal that credits twice, a retry that charges a second time, or
 * a mutation that returns points for a purchase that actually succeeded. Those
 * only appear when the handlers run against a database, so these tests seed one
 * and assert on real balances and ledger rows.
 *
 * `convex-test` is normally driven by Vitest, which supplies the module map via
 * `import.meta.glob`. Bun has no `import.meta.glob`, so the map is passed
 * explicitly as the second argument.
 */

const modules = {
  "src/convex/_generated/api.js": () => import("../src/convex/_generated/api.js"),
  "src/convex/_generated/server.js": () => import("../src/convex/_generated/server.js"),
  "src/convex/schema.ts": () => import("../src/convex/schema"),
  "src/convex/vtuInternal.ts": () => import("../src/convex/vtuInternal"),
  "src/convex/vtuReversal.ts": () => import("../src/convex/vtuReversal"),
  "src/convex/vtuShared.ts": () => import("../src/convex/vtuShared"),
  "src/convex/points.ts": () => import("../src/convex/points"),
  "src/convex/pricing.ts": () => import("../src/convex/pricing"),
  "src/convex/adminApi.ts": () => import("../src/convex/adminApi"),
  "src/convex/storage.ts": () => import("../src/convex/storage"),
};

type Harness = ReturnType<typeof convexTest>;

/** Seed a user with a balance and one airtime product in the catalog. */
async function seed(harness: Harness, opts: { balance: number; priceNgn?: number }) {
  const now = Date.now();
  const userId = await harness.run(async (ctx) =>
    ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      pointsBalance: opts.balance,
      createdAt: now,
    }),
  );

  await harness.run(async (ctx) =>
    ctx.db.insert("vtuCatalog", {
      provider: "pairgate",
      serviceType: "airtime",
      productCode: "mtn-1000",
      name: "MTN ₦1,000 Airtime",
      priceNgn: opts.priceNgn ?? 1000,
      network: "mtn",
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }),
  );

  return { userId };
}

const reserve = (args: any) => (t: any) =>
  t.mutation(internal.vtuInternal.reserveTransaction, args);

const finalize = (args: any) => (t: any) =>
  t.mutation(internal.vtuInternal.finalizeTransaction, args);

const applyCallback = (args: any) => (t: any) =>
  t.mutation(internal.vtuInternal.applyCallback, args);

async function balanceOf(t: any, userId: any) {
  const user = await t.run(async (ctx: any) => ctx.db.get(userId));
  return user.pointsBalance ?? 0;
}

async function ledgerFor(t: any, userId: any) {
  return t.run(async (ctx: any) =>
    ctx.db
      .query("pointLedger")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .collect(),
  );
}

const BASE = {
  provider: "pairgate",
  serviceType: "airtime" as const,
  productCode: "mtn-1000",
  customerIdentifier: "08031234567",
};

// ─── Debit behaviour ───────────────────────────────────────────────

describe("VTU purchase debits the ledger", () => {
  test("a successful purchase takes exactly the catalog price in points", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t, { balance: 5_000 });

    // ₦1,000 at 15 naira/point = 66.67 → 67 points.
    const reserved = await reserve({ ...BASE, userId, requestId: "req-debit-1" })(t);
    expect(reserved.already).toBe(false);
    expect(reserved.points).toBe(67);

    expect(await balanceOf(t, userId)).toBe(5_000 - 67);

    const ledger = await ledgerFor(t, userId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].type).toBe("vtu_purchase");
    expect(ledger[0].amount).toBe(-67);
    expect(ledger[0].idempotencyKey).toBe(vtuPurchaseKey("req-debit-1"));
    // The running balance is recorded on the ledger row itself.
    expect(ledger[0].balanceAfter).toBe(5_000 - 67);
  });

  test("the destination number is masked in the ledger description", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t, { balance: 5_000 });
    await reserve({ ...BASE, userId, requestId: "req-mask-1" })(t);

    const ledger = await ledgerFor(t, userId);
    // A phone number is personal data and has no business in full in a
    // persisted row, a notification, or a support screenshot.
    expect(ledger[0].description).not.toContain("0803");
    expect(ledger[0].description).toContain("4567");
  });

  test("an unaffordable purchase is rejected and leaves no orphan row", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t, { balance: 10 });

    await expect(
      reserve({ ...BASE, userId, requestId: "req-broke" })(t),
    ).rejects.toThrow();

    expect(await balanceOf(t, userId)).toBe(10);
    const transactions = await t.run(async (ctx: any) =>
      ctx.db.query("vtuTransactions").collect(),
    );
    // The debit and the insert share a transaction, so a rollback leaves
    // nothing behind to reconcile.
    expect(transactions).toHaveLength(0);
  });

  test("an unknown or inactive product is refused", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t, { balance: 5_000 });

    await expect(
      reserve({ ...BASE, userId, productCode: "nope", requestId: "req-noprod" })(t),
    ).rejects.toThrow();
    expect(await balanceOf(t, userId)).toBe(5_000);
  });
});

// ─── Idempotency ───────────────────────────────────────────────────

describe("VTU purchase idempotency", () => {
  test("a retried requestId is served, not charged again", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t, { balance: 5_000 });

    const first = await reserve({ ...BASE, userId, requestId: "req-retry" })(t);
    const afterFirst = await balanceOf(t, userId);

    const second = await reserve({ ...BASE, userId, requestId: "req-retry" })(t);
    expect(second.already).toBe(true);
    expect(second.transactionId).toBe(first.transactionId);

    // The single most important property in the whole feature: a client that
    // retries after a timeout must not buy two top-ups for one charge.
    expect(await balanceOf(t, userId)).toBe(afterFirst);
    expect(await ledgerFor(t, userId)).toHaveLength(1);
  });

  test("distinct requestIds are charged independently", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t, { balance: 5_000 });

    await reserve({ ...BASE, userId, requestId: "req-alpha" })(t);
    await reserve({ ...BASE, userId, requestId: "req-bravo" })(t);

    expect(await balanceOf(t, userId)).toBe(5_000 - 134);
    expect(await ledgerFor(t, userId)).toHaveLength(2);
  });
});

// ─── Failure and reversal ──────────────────────────────────────────

describe("failed purchase reversal", () => {
  test("a definitive rejection returns the points", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t, { balance: 5_000 });

    const reserved = await reserve({ ...BASE, userId, requestId: "req-fail-1" })(t);
    expect(await balanceOf(t, userId)).toBe(5_000 - 67);

    const result = await finalize({
      transactionId: reserved.transactionId,
      result: { status: "failed", code: "INVALID_METER", message: "Unknown meter" },
    })(t);

    expect(result.status).toBe("reversed");
    // The customer's balance is exactly what it was before the attempt.
    expect(await balanceOf(t, userId)).toBe(5_000);

    const ledger = await ledgerFor(t, userId);
    expect(ledger).toHaveLength(2);
    const refund = ledger.find((l: any) => l.type === "vtu_refund");
    expect(refund.amount).toBe(67);
    expect(refund.idempotencyKey).toBe(vtuRefundKey("req-fail-1"));
  });

  test("a transport timeout does NOT refund", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t, { balance: 5_000 });

    const reserved = await reserve({ ...BASE, userId, requestId: "req-timeout" })(t);
    const result = await finalize({
      transactionId: reserved.transactionId,
      result: { status: "unknown", message: "Network error contacting provider" },
    })(t);

    // This is the deliberate cost of webhook-only: the points stay debited,
    // because reversing a timeout would refund airtime that may genuinely
    // have been delivered at the carrier.
    expect(result.status).toBe("pending");
    expect(await balanceOf(t, userId)).toBe(5_000 - 67);
    expect(await ledgerFor(t, userId)).toHaveLength(1);

    const row = await t.run(async (ctx: any) => ctx.db.get(reserved.transactionId));
    expect(row.status).toBe("pending");
    // Recorded so these rows are countable — that count is the failure rate
    // that decides whether a reconciler is worth building.
    expect(row.failureReason).toContain("Network error");
  });

  test("reversal is replay-safe — calling it twice credits once", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t, { balance: 5_000 });

    const reserved = await reserve({ ...BASE, userId, requestId: "req-double" })(t);
    await finalize({
      transactionId: reserved.transactionId,
      result: { status: "failed", code: "X", message: "boom" },
    })(t);
    expect(await balanceOf(t, userId)).toBe(5_000);

    // A second reversal attempt must not pay the customer twice.
    const again = await t.mutation(internal.vtuReversal.reverse, {
      transactionId: reserved.transactionId,
      reason: "duplicate",
    });
    expect(again.reversed).toBe(false);
    expect(again.reason).toBe("already_reversed");

    expect(await balanceOf(t, userId)).toBe(5_000);
    expect(await ledgerFor(t, userId)).toHaveLength(2);
  });
});

// ─── Webhook application ───────────────────────────────────────────

describe("provider callbacks", () => {
  test("a success callback marks the transaction delivered", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t, { balance: 5_000 });

    const reserved = await reserve({ ...BASE, userId, requestId: "req-hook-1" })(t);
    await finalize({
      transactionId: reserved.transactionId,
      result: { status: "unknown", message: "timeout" },
    })(t);

    // Give the row a provider reference to match on, as the purchase call
    // would have.
    await t.run(async (ctx: any) =>
      ctx.db.patch(reserved.transactionId, { providerReference: "PG-777" }),
    );

    const applied = await applyCallback({
      provider: "pairgate",
      event: { providerReference: "PG-777", outcome: "success", costNgn: 1000 },
    })(t);

    expect(applied.outcome).toBe("success");
    const row = await t.run(async (ctx: any) => ctx.db.get(reserved.transactionId));
    expect(row.status).toBe("success");
    // The debit stands on a delivered top-up.
    expect(await balanceOf(t, userId)).toBe(5_000 - 67);
  });

  test("a failure callback reverses the debit", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t, { balance: 5_000 });

    const reserved = await reserve({ ...BASE, userId, requestId: "req-hook-2" })(t);
    await t.run(async (ctx: any) =>
      ctx.db.patch(reserved.transactionId, { providerReference: "PG-888" }),
    );

    const applied = await applyCallback({
      provider: "pairgate",
      event: { providerReference: "PG-888", outcome: "failed", message: "declined" },
    })(t);

    expect(applied.outcome).toBe("failed");
    expect(await balanceOf(t, userId)).toBe(5_000);
  });

  test("a duplicate callback is a no-op", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t, { balance: 5_000 });

    const reserved = await reserve({ ...BASE, userId, requestId: "req-hook-3" })(t);
    await t.run(async (ctx: any) =>
      ctx.db.patch(reserved.transactionId, { providerReference: "PG-999" }),
    );

    const event = {
      provider: "pairgate",
      event: { providerReference: "PG-999", outcome: "failed" as const, message: "no" },
    };

    await applyCallback(event)(t);
    expect(await balanceOf(t, userId)).toBe(5_000);

    // The aggregator retries webhooks. A second one must change nothing —
    // this is the case that would otherwise pay a customer twice.
    const second = await applyCallback(event)(t);
    expect(second.outcome).toBe("ignored");
    expect(await balanceOf(t, userId)).toBe(5_000);
    expect(await ledgerFor(t, userId)).toHaveLength(2);
  });

  test("an unmatched reference is audited, not applied to anything", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t, { balance: 5_000 });
    await reserve({ ...BASE, userId, requestId: "req-hook-4" })(t);

    const applied = await applyCallback({
      provider: "pairgate",
      event: { providerReference: "PG-DOES-NOT-EXIST", outcome: "failed" },
    })(t);

    expect(applied.outcome).toBe("unmatched");
    // Nothing was refunded, and the customer's points are untouched.
    expect(await balanceOf(t, userId)).toBe(5_000 - 67);

    const audits = await t.run(async (ctx: any) =>
      ctx.db
        .query("auditLogs")
        .withIndex("by_action", (q: any) => q.eq("action", "vtu_callback_unmatched"))
        .collect(),
    );
    expect(audits).toHaveLength(1);
  });

  test("a callback cannot cross provider boundaries", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t, { balance: 5_000 });

    const reserved = await reserve({ ...BASE, userId, requestId: "req-hook-5" })(t);
    await t.run(async (ctx: any) =>
      ctx.db.patch(reserved.transactionId, { providerReference: "PG-555" }),
    );

    // Same reference, different provider — must not resolve the transaction.
    const applied = await applyCallback({
      provider: "someone-else",
      event: { providerReference: "PG-555", outcome: "failed" },
    })(t);

    expect(applied.outcome).toBe("unmatched");
    expect(await balanceOf(t, userId)).toBe(5_000 - 67);
  });
});

// ─── Ledger immutability ───────────────────────────────────────────

describe("VTU ledger integrity", () => {
  test("every purchase and refund carries a namespaced, unique key", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t, { balance: 5_000 });

    const ok = await reserve({ ...BASE, userId, requestId: "req-int-1" })(t);
    await finalize({ transactionId: ok.transactionId, result: { status: "success", providerReference: "PG-1", costNgn: 1000 } })(t);

    const bad = await reserve({ ...BASE, userId, requestId: "req-int-2" })(t);
    await finalize({ transactionId: bad.transactionId, result: { status: "failed", code: "X", message: "no" } })(t);

    const keys = (await ledgerFor(t, userId)).map((l: any) => l.idempotencyKey);
    expect(keys).toContain("vtu:purchase:req-int-1");
    expect(keys).toContain("vtu:refund:req-int-2");
    // Distinct namespaces, so neither can shadow the other.
    expect(new Set(keys).size).toBe(keys.length);
  });
});
