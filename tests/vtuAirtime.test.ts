import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../src/convex/schema";
import { internal } from "../src/convex/_generated/api";
import { vtuLedgerPurchaseKey, vtuPurchaseKey, vtuRefundKey } from "../src/lib/vtu";

/**
 * Airtime slice integration tests, run against a real Convex implementation
 * (`convex-test`) rather than a mirror of the logic.
 *
 * The pure-function tests pin the arithmetic. They cannot catch what actually
 * breaks in a payments system: a debit that never lands, a refund that credits
 * a different number of points than were taken, a retry that charges twice, or
 * a transition that resurrects a rejected transaction. Those only appear when
 * the handlers run against a database.
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
  "src/convex/vtuServiceRouting.ts": () => import("../src/convex/vtuServiceRouting"),
  "src/convex/vtu.ts": () => import("../src/convex/vtu"),
  "src/convex/vtuShared.ts": () => import("../src/convex/vtuShared"),
  "src/convex/points.ts": () => import("../src/convex/points"),
  "src/convex/pricing.ts": () => import("../src/convex/pricing"),
  "src/convex/adminApi.ts": () => import("../src/convex/adminApi"),
  "src/convex/storage.ts": () => import("../src/convex/storage"),
};

type Harness = ReturnType<typeof convexTest>;

const SERVICE_CODE = "airtime.mtn.1000";
const PHONE = "08031234567";
const START_BALANCE = 5_000;

/** Seed a user with a balance. `pointPricing` is left EMPTY, so the cost
 *  resolution exercises the nairaPrice / ngnPerPoint conversion branch. */
async function seed(t: Harness, balance = START_BALANCE) {
  const now = Date.now();
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      pointsBalance: balance,
      createdAt: now,
    }),
  );
  await seedRoute(t);
  return { userId };
}

/**
 * The catalog row and the ONE route slice 3 ships with, so a purchase has
 * somewhere to go. `pointPricing` is deliberately still left empty: the
 * routing row carries no price override, so the cost falls through to the
 * default conversion and the existing price assertions keep their meaning.
 */
async function seedRoute(t: Harness) {
  const now = Date.now();
  await t.run(async (ctx) => {
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

const begin = (args: any) => (t: Harness) =>
  t.mutation(internal.vtuInternal.beginPurchase, args);

const balanceOf = (t: Harness, userId: any) =>
  t.run(async (ctx) => (await ctx.db.get(userId))?.pointsBalance ?? 0);

const ledgerFor = (t: Harness, userId: any) =>
  t.run(async (ctx) =>
    ctx.db
      .query("pointLedger")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .collect(),
  );

const claimsFor = (t: Harness) =>
  t.run(async (ctx) => ctx.db.query("vtuIdempotency").collect());

const txOf = (t: Harness, id: any) => t.run(async (ctx) => ctx.db.get(id));

/** Walk a fresh purchase to `processing`, the state outcomes may be written from. */
async function toProcessing(t: Harness, userId: any, requestId: string) {
  const reserved = await begin({
    userId,
    clientRequestId: requestId,
    serviceCode: SERVICE_CODE,
    customerIdentifier: PHONE,
  })(t);
  await t.mutation(internal.vtuInternal.markProcessing, {
    transactionId: reserved.transactionId,
  });
  return reserved;
}

// ─── Reversal ──────────────────────────────────────────────────────

describe("failed transaction reversal", () => {
  test("credits back the exact points debited and releases the key", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);

    const reserved = await toProcessing(t, userId, "vtu_reversal_case_one");
    // ₦1,000 at the default 15 naira/point = 66.67 → 67.
    expect(reserved.pointsDebited).toBe(67);
    expect(await balanceOf(t, userId)).toBe(START_BALANCE - 67);

    // Provider definitively rejected it. ONE mutation settles the status AND
    // moves the ledger — there is no second call a caller can forget, which is
    // exactly the shape that made the webhook/sweep race possible before.
    const settled = await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: reserved.transactionId,
      source: "dispatch",
      verdict: {
        status: "failed",
        reversalReason: "provider_failed",
        code: "INVALID_PRODUCT",
        message: "Unknown product",
      },
    });
    expect(settled.settled).toBe(true);
    // The verdict asked for `failed`; the committed row reads `reversed`,
    // because the two writes are one Convex transaction. `failed` is a state
    // the mutation passes THROUGH, never a state a client can observe.
    expect(settled.status).toBe("reversed");
    expect(await claimsFor(t)).toHaveLength(0);

    // Points are back exactly where they started.
    expect(await balanceOf(t, userId)).toBe(START_BALANCE);

    // The credit is namespaced on the TRANSACTION id.
    const ledger = await ledgerFor(t, userId);
    expect(ledger).toHaveLength(2);
    const credit = ledger.find((l: any) => l.type === "vtu_refund");
    expect(credit.amount).toBe(67);
    expect(credit.idempotencyKey).toBe(vtuRefundKey(String(reserved.transactionId)));

    const tx = await txOf(t, reserved.transactionId);
    expect(tx.status).toBe("reversed");
  });

  test("the released key lets the same request id be retried once", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);

    const first = await toProcessing(t, userId, "vtu_retry_same_id");
    await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: first.transactionId,
      source: "dispatch",
      verdict: {
        status: "failed",
        reversalReason: "provider_failed",
        code: "X",
        message: "rejected",
      },
    });

    // The claim is gone, so this is a genuinely new attempt rather than a
    // replay — and it must produce exactly one new debit.
    const claims = await claimsFor(t);
    expect(claims).toHaveLength(0);

    const second = await begin({
      userId,
      clientRequestId: "vtu_retry_same_id",
      serviceCode: SERVICE_CODE,
      customerIdentifier: PHONE,
    })(t);

    expect(second.reused).toBe(false);
    expect(second.transactionId).not.toBe(first.transactionId);
    // Charged once for the retry, so the balance is 67 below the start. This
    // is the assertion that proves the release works end to end: the
    // immutable ledger row from attempt one must NOT block attempt two.
    expect(await balanceOf(t, userId)).toBe(START_BALANCE - 67);

    const debits = (await ledgerFor(t, userId)).filter(
      (l: any) => l.type === "vtu_purchase",
    );
    expect(debits).toHaveLength(2);
  });

  test("reversing twice does not pay twice", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);

    const reserved = await toProcessing(t, userId, "vtu_double_refund");
    await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: reserved.transactionId,
      source: "dispatch",
      verdict: {
        status: "failed",
        reversalReason: "provider_failed",
        code: "X",
        message: "first",
      },
    });
    expect(await balanceOf(t, userId)).toBe(START_BALANCE);

    // A SECOND verdict for the same transaction, from a DIFFERENT writer. This
    // is the race the single writer exists to make impossible: the sweep's
    // verdict arrives after the first settlement and must no-op rather than
    // credit the customer twice.
    const again = await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: reserved.transactionId,
      source: "reconciliation",
      verdict: {
        status: "failed",
        reversalReason: "reconciliation",
        code: "X",
        message: "second",
      },
    });
    expect(again.settled).toBe(false);
    expect(again.reason).toBe("already_terminal");

    expect(await balanceOf(t, userId)).toBe(START_BALANCE);
    expect((await ledgerFor(t, userId)).filter((l: any) => l.type === "vtu_refund")).toHaveLength(1);
  });

  test("the rate snapshot is frozen, so a rate change cannot mis-refund", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);

    const reserved = await begin({
      userId,
      clientRequestId: "vtu_snapshot_case",
      serviceCode: SERVICE_CODE,
      customerIdentifier: PHONE,
    })(t);

    const before = await txOf(t, reserved.transactionId);
    expect(before.ngnPerPoint).toBe(15);
    expect(before.nairaPrice).toBe(1000);
    expect(before.pointsDebited).toBe(67);

    // Halve the rate AFTER the debit.
    await t.run(async (ctx) =>
      ctx.db.insert("adminSettings", {
        key: "point_rate",
        value: { ngnPerPoint: 7.5, usdPerPoint: 0.01 },
        category: "billing",
        updatedAt: Date.now(),
      }),
    );

    await t.mutation(internal.vtuInternal.markProcessing, {
      transactionId: reserved.transactionId,
    });
    await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: reserved.transactionId,
      source: "dispatch",
      verdict: {
        status: "failed",
        reversalReason: "provider_failed",
        code: "X",
        message: "rejected",
      },
    });

    // Had the refund re-read the live rate it would have credited 134 points.
    // The snapshot keeps the balance exact.
    expect(await balanceOf(t, userId)).toBe(START_BALANCE);
    const credit = (await ledgerFor(t, userId)).find((l: any) => l.type === "vtu_refund");
    expect(credit.amount).toBe(67);
  });
});

// ─── Idempotency ───────────────────────────────────────────────────

describe("idempotency", () => {
  test("a duplicate request id cannot create a second debit", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);

    const args = {
      userId,
      clientRequestId: "vtu_duplicate_request_id",
      serviceCode: SERVICE_CODE,
      customerIdentifier: PHONE,
    };

    const first = await begin(args)(t);
    const second = await begin(args)(t);

    expect(first.reused).toBe(false);
    expect(second.reused).toBe(true);
    expect(second.transactionId).toBe(first.transactionId);
    expect(second.pointsDebited).toBe(first.pointsDebited);

    // Charged once.
    expect(await balanceOf(t, userId)).toBe(START_BALANCE - 67);
    const debits = (await ledgerFor(t, userId)).filter((l: any) => l.type === "vtu_purchase");
    expect(debits).toHaveLength(1);
    // The LEDGER key is per attempt, so it must NOT be the client request id —
    // otherwise the immutable ledger row from a failed attempt would make
    // every retry free.
    expect(debits[0].idempotencyKey).toBe(
      vtuLedgerPurchaseKey(String(first.transactionId)),
    );
    expect(debits[0].idempotencyKey).not.toBe(
      vtuPurchaseKey("vtu_duplicate_request_id"),
    );

    const claims = await claimsFor(t);
    expect(claims).toHaveLength(1);
  });

  test("concurrent identical requests produce exactly one debit", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);

    const args = {
      userId,
      clientRequestId: "vtu_concurrent_request",
      serviceCode: SERVICE_CODE,
      customerIdentifier: PHONE,
    };

    // A Convex mutation is a serializable transaction, so the
    // check-then-insert on `vtuIdempotency` is what makes this safe — a
    // sequential test alone could not observe the race.
    const results = await Promise.all([begin(args)(t), begin(args)(t), begin(args)(t)]);

    const fresh = results.filter((r: any) => r.reused === false);
    const reused = results.filter((r: any) => r.reused === true);
    expect(fresh).toHaveLength(1);
    expect(reused).toHaveLength(2);

    const ids = new Set(results.map((r: any) => String(r.transactionId)));
    expect(ids.size).toBe(1);

    expect(await balanceOf(t, userId)).toBe(START_BALANCE - 67);
    expect((await ledgerFor(t, userId)).filter((l: any) => l.type === "vtu_purchase")).toHaveLength(1);
  });

  test("distinct request ids charge independently", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);

    await begin({
      userId,
      clientRequestId: "vtu_distinct_one",
      serviceCode: SERVICE_CODE,
      customerIdentifier: PHONE,
    })(t);
    await begin({
      userId,
      clientRequestId: "vtu_distinct_two",
      serviceCode: SERVICE_CODE,
      customerIdentifier: PHONE,
    })(t);

    expect(await balanceOf(t, userId)).toBe(START_BALANCE - 134);
    expect((await ledgerFor(t, userId)).filter((l: any) => l.type === "vtu_purchase")).toHaveLength(2);
  });

  test("an unaffordable purchase leaves no claim and no row", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t, 10);

    await expect(
      begin({
        userId,
        clientRequestId: "vtu_too_poor",
        serviceCode: SERVICE_CODE,
        customerIdentifier: PHONE,
      })(t),
    ).rejects.toThrow();

    expect(await balanceOf(t, userId)).toBe(10);
    // The claim rolled back with the debit, so the customer can retry the
    // same id after topping up.
    expect(await claimsFor(t)).toHaveLength(0);
    const rows = await t.run(async (ctx) => ctx.db.query("vtuTransactions").collect());
    expect(rows).toHaveLength(0);
  });
});

// ─── Transition guards ─────────────────────────────────────────────

describe("status transitions", () => {
  test("a reversed transaction cannot be resurrected to confirmed", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);

    const reserved = await toProcessing(t, userId, "vtu_no_resurrect");
    await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: reserved.transactionId,
      source: "dispatch",
      verdict: {
        status: "failed",
        reversalReason: "provider_failed",
        code: "X",
        message: "rejected",
      },
    });

    // A late webhook claiming success must not revive it — and must not
    // re-credit a customer who has already been refunded.
    const attempt = await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: reserved.transactionId,
      source: "webhook",
      verdict: { status: "confirmed", providerReference: "PG-1" },
    });
    expect(attempt.settled).toBe(false);
    expect(attempt.reason).toBe("already_terminal");

    const tx = await txOf(t, reserved.transactionId);
    expect(tx.status).toBe("reversed");
    expect(await balanceOf(t, userId)).toBe(START_BALANCE);
  });

  test("confirmed is terminal", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);

    const reserved = await toProcessing(t, userId, "vtu_confirmed_terminal");
    await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: reserved.transactionId,
      source: "webhook",
      verdict: { status: "confirmed", providerReference: "PG-2" },
    });

    const attempt = await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: reserved.transactionId,
      source: "webhook",
      verdict: {
        status: "failed",
        reversalReason: "provider_failed",
        code: "X",
        message: "late failure",
      },
    });
    expect(attempt.settled).toBe(false);
    expect(attempt.reason).toBe("already_terminal");

    // The debit stands on a delivered top-up.
    expect(await balanceOf(t, userId)).toBe(START_BALANCE - 67);
  });

  test("unknown is a real status and keeps the points debited", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);

    const reserved = await toProcessing(t, userId, "vtu_timeout_case");
    const outcome = await t.mutation(internal.vtuInternal.markUnknown, {
      transactionId: reserved.transactionId,
      source: "dispatch",
      message: "Network error contacting provider",
    });
    expect(outcome.applied).toBe(true);

    const tx = await txOf(t, reserved.transactionId);
    expect(tx.status).toBe("unknown");
    // Not coerced to pending or failed, and no refund invented.
    expect(await balanceOf(t, userId)).toBe(START_BALANCE - 67);

    // A late webhook can still resolve it.
    const resolved = await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: reserved.transactionId,
      source: "webhook",
      verdict: { status: "confirmed", providerReference: "PG-3" },
    });
    expect(resolved.settled).toBe(true);
    expect((await txOf(t, reserved.transactionId)).status).toBe("confirmed");
  });

  test("unknown cannot be refunded — the top-up may have landed", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);

    const reserved = await toProcessing(t, userId, "vtu_no_release_unknown");
    await t.mutation(internal.vtuInternal.markUnknown, {
      transactionId: reserved.transactionId,
      source: "dispatch",
      message: "timeout",
    });

    // An operator can only refund a transaction that reached `unresolved`.
    // `unknown` means the top-up may have landed, so the operator path is
    // refused here rather than paying the customer twice.
    const attempt = await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: reserved.transactionId,
      source: "admin",
      verdict: { status: "reversed", reversalReason: "admin_override", reason: "operator gave up" },
    });
    expect(attempt.settled).toBe(false);
    expect(attempt.reason).toBe("illegal_transition");
    expect(await balanceOf(t, userId)).toBe(START_BALANCE - 67);
  });

  test("pending must pass through markProcessing before a provider verdict", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);

    const reserved = await begin({
      userId,
      clientRequestId: "vtu_pending_guard",
      serviceCode: SERVICE_CODE,
      customerIdentifier: PHONE,
    })(t);

    const attempt = await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: reserved.transactionId,
      source: "webhook",
      verdict: { status: "confirmed", providerReference: "PG-4" },
    });
    expect(attempt.settled).toBe(false);
    expect(attempt.reason).toBe("illegal_transition");
  });

  test("a never-dispatched row may only be failed by the dispatch writer", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);

    const reserved = await begin({
      userId,
      clientRequestId: "vtu_pending_failure_source",
      serviceCode: SERVICE_CODE,
      customerIdentifier: PHONE,
    })(t);

    const verdict = {
      status: "failed" as const,
      reversalReason: "provider_failed" as const,
      code: "CREDENTIAL_MISSING",
      message: "This payment provider is not available",
    };

    // A webhook or a sweep cannot declare a never-sent purchase failed. They
    // have no way to know nothing was sent, and the sweep escalates a stuck
    // `pending` row to `unresolved` instead — see the reconciliation tests.
    for (const source of ["webhook", "reconciliation", "admin"] as const) {
      const refused = await t.mutation(internal.vtuInternal.settleTransaction, {
        transactionId: reserved.transactionId,
        source,
        verdict,
      });
      expect(refused.settled).toBe(false);
      expect(refused.reason).toBe("illegal_transition");
    }
    expect(await balanceOf(t, userId)).toBe(START_BALANCE - 67);

    // The dispatch action knows nothing was sent, so it may reverse — and the
    // reversal is real, not reported-but-skipped.
    const settled = await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: reserved.transactionId,
      source: "dispatch",
      verdict,
    });
    expect(settled.settled).toBe(true);
    expect(settled.status).toBe("reversed");
    expect(await balanceOf(t, userId)).toBe(START_BALANCE);
    expect((await txOf(t, reserved.transactionId))?.status).toBe("reversed");
  });
});

// ─── The single writer ─────────────────────────────────────────────

describe("settleTransaction is the only writer of a terminal status", () => {
  test("a verdict and a webhook for the same transaction settle exactly once", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);

    const reserved = await toProcessing(t, userId, "vtu_same_tick_race");

    // Fired together, as the sweep and the aggregator's webhook would in the
    // same tick. Convex serialises mutations, so the loser of the race reads
    // the winner's committed write and refuses — the assertion is that the
    // customer is credited ONCE and not twice.
    const [fromWebhook, fromSweep] = await Promise.all([
      t.mutation(internal.vtuInternal.settleTransaction, {
        transactionId: reserved.transactionId,
        source: "webhook",
        verdict: { status: "confirmed", providerReference: "PG-RACE", costNgn: 1000 },
      }),
      t.mutation(internal.vtuInternal.settleTransaction, {
        transactionId: reserved.transactionId,
        source: "reconciliation",
        verdict: {
          status: "failed",
          reversalReason: "reconciliation",
          code: "NOT_FOUND",
          message: "provider has no record of it",
        },
      }),
    ]);

    const winners = [fromWebhook, fromSweep].filter((r) => r.settled);
    expect(winners).toHaveLength(1);

    const ledger = await ledgerFor(t, userId);
    expect(ledger.filter((l: any) => l.type === "vtu_refund")).toHaveLength(
      fromWebhook.settled ? 0 : 1,
    );
    // And the balance is consistent with whichever verdict won, never with
    // both: the debit stands on a confirmation, and is returned on a reversal.
    expect(await balanceOf(t, userId)).toBe(
      fromWebhook.settled ? START_BALANCE - 67 : START_BALANCE,
    );
  });

  test("the source is recorded, so a settled row says who settled it", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);

    const reserved = await toProcessing(t, userId, "vtu_source_recorded");
    await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: reserved.transactionId,
      source: "reconciliation",
      verdict: {
        status: "failed",
        reversalReason: "reconciliation",
        code: "NOT_FOUND",
        message: "provider has no record of it",
      },
    });

    const tx = await txOf(t, reserved.transactionId);
    expect(tx.source).toBe("reconciliation");
    expect(tx.reversalReason).toBe("reconciliation");
  });
});

// ─── Privacy ───────────────────────────────────────────────────────

describe("destination privacy", () => {
  test("the phone number is masked in the record and the ledger", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);

    const reserved = await begin({
      userId,
      clientRequestId: "vtu_masking_case",
      serviceCode: SERVICE_CODE,
      customerIdentifier: PHONE,
    })(t);

    const tx = await txOf(t, reserved.transactionId);
    expect(tx.customerIdentifier).not.toContain("0803");
    expect(tx.customerIdentifier.endsWith("4567")).toBe(true);

    const debit = (await ledgerFor(t, userId)).find((l: any) => l.type === "vtu_purchase");
    expect(debit.description).not.toContain("0803");
  });
});
