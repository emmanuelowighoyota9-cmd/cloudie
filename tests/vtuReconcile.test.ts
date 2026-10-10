import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../src/convex/schema";
import { internal } from "../src/convex/_generated/api";
import { registerAdapter } from "../src/convex/vtuRegistry";
import { pairgateAdapter } from "../src/convex/vtuPairgate";
import { encrypt } from "../src/convex/lib/encryption";
import type { VtuProviderAdapter } from "../src/convex/vtuShared";

/**
 * The reconciliation sweep against a real Convex implementation (`convex-test`)
 * rather than a mirror of the logic.
 *
 * The pure arithmetic has its own file (`vtuReconcileConfig.test.ts`). What
 * only shows up when the handlers really run is the ordering the slice depends
 * on: candidates selected from the SNAPSHOT provider, the budget spent before
 * any call, the attempt counted before the poll, and `settleTransaction` —
 * never a direct write — producing the terminal status and its ledger credit
 * together.
 *
 * `convex-test` is normally driven by Vitest, which supplies the module map via
 * `import.meta.glob`. Bun has no `import.meta.glob`, so the map is passed
 * explicitly as the second argument.
 */

const modules = {
  "src/convex/_generated/api.js": () => import("../src/convex/_generated/api.js"),
  "src/convex/_generated/server.js": () => import("../src/convex/_generated/server.js"),
  "src/convex/schema.ts": () => import("../src/convex/schema"),
  "src/convex/vtuReconcile.ts": () => import("../src/convex/vtuReconcile"),
  "src/convex/vtuReconcileSweep.ts": () => import("../src/convex/vtuReconcileSweep"),
  "src/convex/vtuUnresolvedAdmin.ts": () => import("../src/convex/vtuUnresolvedAdmin"),
  // Registered so the webhook is exercised as the ACTION it really is when it
  // races the sweep, rather than only through the mutation it delegates to.
  "src/convex/vtuHttp.ts": () => import("../src/convex/vtuHttp"),
  // Registered so the webhook is exercised as the ACTION it really is when it
  // races the sweep, rather than only through the mutation it delegates to.
  "src/convex/vtuHttp.ts": () => import("../src/convex/vtuHttp"),
  "src/convex/vtuInternal.ts": () => import("../src/convex/vtuInternal"),
  "src/convex/vtuProviderCall.ts": () => import("../src/convex/vtuProviderCall"),
  "src/convex/vtuProviderConfig.ts": () => import("../src/convex/vtuProviderConfig"),
  "src/convex/vtuRegistry.ts": () => import("../src/convex/vtuRegistry"),
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

const SERVICE_CODE = "airtime.mtn.1000";
const PHONE = "08031234567";
/** NGN per point at the platform rate these tests leave in place. */
const RATE = 15;
/** ₦1,000 of airtime is ₦1,000 of wallet — the amount IS the price. */
const AIRTIME_PRICE = 1_000;
/** What the customer starts with, in NGN — the old 5,000-point figure at 15/point. */
const START_BALANCE = 5_000 * RATE;

async function seed(t: Harness, providerRow: Record<string, unknown> = {}) {
  const now = Date.now();
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      walletBalanceNgn: START_BALANCE,
      createdAt: now,
    }),
  );
  await t.run(async (ctx) => {
    await ctx.db.insert("vtuProviders", {
      name: "pairgate",
      displayName: "Pairgate",
      status: "active",
      baseUrl: "https://api.pairgate.com",
      encryptedApiKey: await encrypt("pg_live_key"),
      priority: 100,
      createdAt: now,
      updatedAt: now,
      ...providerRow,
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
  return { userId };
}

/** The authoritative monetary balance: the NGN wallet, not the retired points field. */
const balanceOf = (t: Harness, userId: any) =>
  t.run(async (ctx) => (await ctx.db.get(userId))?.walletBalanceNgn ?? 0);

const txOf = (t: Harness, id: any) => t.run(async (ctx) => ctx.db.get(id));

const ledgerFor = (t: Harness, userId: any) =>
  t.run(async (ctx) =>
    ctx.db
      .query("walletLedger")
      .withIndex("by_user", (q: any) => q.eq("userId", userId))
      .collect(),
  );

/**
 * Walk a purchase to `unknown` — the state the sweep exists for: dispatched,
 * transport told us nothing, no terminal verdict.
 *
 * `ageMs` backdates the row so it clears the staleness threshold without a
 * `sleep`, because a test that waits a real minute proves nothing extra.
 */
async function toStuckUnknown(
  t: Harness,
  userId: any,
  requestId: string,
  opts: { providerReference?: string; ageMs?: number } = {},
) {
  const reserved = await t.mutation(internal.vtuInternal.beginPurchase, {
    userId,
    clientRequestId: requestId,
    serviceCode: SERVICE_CODE,
    customerIdentifier: PHONE,
  });
  await t.mutation(internal.vtuInternal.markProcessing, {
    transactionId: reserved.transactionId,
  });
  await t.mutation(internal.vtuInternal.markUnknown, {
    transactionId: reserved.transactionId,
    source: "dispatch",
    message: "Timeout contacting provider",
    providerReference: opts.providerReference ?? "PG-REF-1",
    raw: { thrown: "timeout" },
  });
  const ageMs = opts.ageMs ?? 120_000;
  await t.run(async (ctx) =>
    ctx.db.patch(reserved.transactionId, { updatedAt: Date.now() - ageMs }),
  );
  return reserved;
}

/** A stub adapter that records what the sweep asked it. */
function stubAdapter(
  seen: { providerReference: string }[],
  result: () => any,
): VtuProviderAdapter {
  return {
    name: "pairgate",
    displayName: "Stub",
    async purchase() {
      throw new Error("the sweep never purchases");
    },
    verifyAndParseCallback() {
      return null;
    },
    async verify(providerReference) {
      seen.push({ providerReference });
      return result();
    },
  } as VtuProviderAdapter;
}

const sweep = (t: Harness, sweepIntervalMs = 60_000) =>
  t.action(internal.vtuReconcileSweep.runReconcileSweep, { sweepIntervalMs });

/** Put the real adapter back so the rest of the file is unaffected. */
const restorePairgate = () => registerAdapter(pairgateAdapter);

/** An operator: the queue's actions are gated server-side on this role. */
async function seedAdmin(t: Harness) {
  const now = Date.now();
  return t.run(async (ctx) =>
    ctx.db.insert("users", {
      name: "Root",
      email: "root@example.com",
      role: "admin",
      walletBalanceNgn: 0,
      createdAt: now,
    }),
  );
}

/**
 * Park a transaction in `unresolved` — the state the queue exists for.
 *
 * Written through `settleTransaction` rather than patched, so the fixture is
 * the same shape the sweep produces and the admin actions are tested against
 * a real escalation rather than a hand-built row.
 */
async function toUnresolved(t: Harness, userId: any, requestId: string) {
  const reserved = await t.mutation(internal.vtuInternal.beginPurchase, {
    userId,
    clientRequestId: requestId,
    serviceCode: SERVICE_CODE,
    customerIdentifier: PHONE,
  });
  await t.mutation(internal.vtuInternal.markProcessing, {
    transactionId: reserved.transactionId,
  });
  await t.mutation(internal.vtuInternal.settleTransaction, {
    transactionId: reserved.transactionId,
    source: "reconciliation",
    verdict: {
      status: "unresolved",
      unresolvedReason: "max_attempts_exceeded",
      message: "Polled 5 times with no terminal verdict",
    },
  });
  return reserved;
}

// ─── The core path ──────────────────────────────────────────────────

describe("reconciliation sweep", () => {
  test("polls a stuck unknown row, settles it, and credits the ledger exactly once", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const { userId } = await seed(t);
      const reserved = await toStuckUnknown(t, userId, "vtu_sweep_core");

      expect((await txOf(t, reserved.transactionId)).status).toBe("unknown");
      expect(await balanceOf(t, userId)).toBe(START_BALANCE - AIRTIME_PRICE);

      const seen: { providerReference: string }[] = [];
      registerAdapter(
        stubAdapter(seen, () => ({
          status: "failed",
          code: "CARRIER_REJECTED",
          message: "Rejected by the carrier",
          failureKind: "rejected",
          raw: { status: "Refund" },
        })),
      );

      try {
        const report = await sweep(t);

        // One provider, one poll, one resolution.
        expect(report.providers).toHaveLength(1);
        expect(report.providers[0].provider).toBe("pairgate");
        expect(report.providers[0].attempted).toBe(1);
        expect(report.providers[0].resolved).toBe(1);
        expect(report.providers[0].escalated).toBe(0);

        // Polled with the SNAPSHOT reference, not something re-derived.
        expect(seen).toEqual([{ providerReference: "PG-REF-1" }]);
      } finally {
        restorePairgate();
      }

      const tx = await txOf(t, reserved.transactionId);
      expect(tx.status).toBe("reversed");
      expect(tx.reversalReason).toBe("reconciliation");
      expect(tx.source).toBe("reconciliation");
      expect(tx.reconcileAttempts).toBe(1);

      // The reversal credit and the status commit together: balance restored,
      // and exactly one credit row for this transaction.
      expect(await balanceOf(t, userId)).toBe(START_BALANCE);
      const ledger = await ledgerFor(t, userId);
      const refunds = ledger.filter((l: any) => l.type === "vtu_refund");
      // Exactly one credit — for THIS transaction, not one per sweep.
      expect(refunds).toHaveLength(1);
      expect(refunds[0].metadata.transactionId).toBe(reserved.transactionId);

      // The sweep summary lands on the provider row for the admin queue.
      const provider = await t.run(async (ctx) =>
        ctx.db
          .query("vtuProviders")
          .withIndex("by_name", (q) => q.eq("name", "pairgate"))
          .unique(),
      );
      expect(provider?.lastSweepAttempted).toBe(1);
      expect(provider?.lastSweepResolved).toBe(1);
      expect(provider?.lastReconcileSweepAt).toBeGreaterThan(0);
    });
  });

  test("a confirmed poll leaves the points debited and reverses nothing", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const { userId } = await seed(t);
      const reserved = await toStuckUnknown(t, userId, "vtu_sweep_confirmed", {
        providerReference: "PG-REF-2",
      });

      const seen: { providerReference: string }[] = [];
      registerAdapter(
        stubAdapter(seen, () => ({
          status: "success",
          providerReference: "PG-REF-2",
          costNgn: 980,
          raw: { status: "Completed" },
        })),
      );

      try {
        const report = await sweep(t);
        expect(report.providers[0].resolved).toBe(1);
      } finally {
        restorePairgate();
      }

      const tx = await txOf(t, reserved.transactionId);
      expect(tx.status).toBe("confirmed");
      expect(tx.reversalReason).toBeUndefined();
      // Delivered: the debit stands.
      expect(await balanceOf(t, userId)).toBe(START_BALANCE - AIRTIME_PRICE);
    });
  });

  test("the same transaction polled twice across two sweeps does not double-settle", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const { userId } = await seed(t);
      const reserved = await toStuckUnknown(t, userId, "vtu_sweep_twice");

      // First poll: no verdict. Second poll: the provider says no. The row is
      // still a candidate after the first poll (an `unknown` verdict does not
      // touch `updatedAt`), so the second sweep really does ask again — which
      // is the race this test exists for.
      let calls = 0;
      const seen: { providerReference: string }[] = [];
      registerAdapter(
        stubAdapter(seen, () => {
          calls++;
          return calls === 1
            ? { status: "unknown", message: "still processing", raw: {} }
            : {
                status: "failed",
                code: "CARRIER_REJECTED",
                message: "Rejected by the carrier",
                failureKind: "rejected",
                raw: {},
              };
        }),
      );

      try {
        const first = await sweep(t);
        expect(first.providers[0].attempted).toBe(1);
        expect((await txOf(t, reserved.transactionId)).status).toBe("unknown");

        const second = await sweep(t);
        expect(second.providers[0].attempted).toBe(1);
      } finally {
        restorePairgate();
      }

      const tx = await txOf(t, reserved.transactionId);
      expect(tx.status).toBe("reversed");
      expect(await balanceOf(t, userId)).toBe(START_BALANCE);
      const refunds = await t.run(async (ctx) =>
        ctx.db
          .query("walletLedger")
          .withIndex("by_user", (q: any) => q.eq("userId", userId))
          .collect(),
      );
      expect(refunds.filter((l: any) => l.type === "vtu_refund")).toHaveLength(1);

      // A third sweep must not touch a settled row at all — with nothing
      // stale, there is no candidate to group and no provider to sweep.
      const third = await sweep(t);
      expect(third.providers).toHaveLength(0);
      expect(
        (await t.run(async (ctx) =>
          ctx.db
            .query("walletLedger")
            .withIndex("by_user", (q: any) => q.eq("userId", userId))
            .collect(),
        )).filter((l: any) => l.type === "vtu_refund"),
      ).toHaveLength(1);
    });
  });

  test("the per-provider budget caps polls before dispatch", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      // 1 call/minute, so a 1-minute window grants exactly one poll.
      const { userId } = await seed(t, { rateLimitPerMinute: 1 });

      const stuck = [];
      for (const suffix of ["a", "b", "c", "d", "e"]) {
        stuck.push(
          await toStuckUnknown(t, userId, `vtu_sweep_budget_${suffix}`, {
            providerReference: `PG-REF-${suffix}`,
          }),
        );
      }

      const seen: { providerReference: string }[] = [];
      registerAdapter(
        stubAdapter(seen, () => ({
          status: "unknown",
          message: "still processing",
          raw: {},
        })),
      );

      try {
        const report = await sweep(t);
        expect(report.providers[0].attempted).toBe(1);
        // Four unselected plus the one that was polled and came back without a
        // verdict: all five are still awaiting one.
        expect(report.providers[0].stillPending).toBe(5);
        // Oldest first: the rows were created in order, so the first one wins.
        expect(seen).toEqual([{ providerReference: "PG-REF-a" }]);
      } finally {
        restorePairgate();
      }

      // Nothing else moved: all five rows still await a verdict (the polled
      // one came back without one), and only one of them was ever asked.
      const statuses = await t.run(async (ctx) => ctx.db.query("vtuTransactions").collect());
      expect(statuses.filter((r: any) => r.status === "unknown")).toHaveLength(5);
      expect(statuses.filter((r: any) => r.reconcileAttempts === 1)).toHaveLength(1);
    });
  });

  test("the budget accumulates ACROSS sweeps inside one window", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      // 2 calls/minute: the first sweep spends both, so the second one in the
      // same window must have nothing left. Counting only "calls made in THIS
      // sweep" — the post-hoc reading — would let the second sweep spend two
      // more and quietly double the provider's limit.
      const { userId } = await seed(t, { rateLimitPerMinute: 2 });

      for (const suffix of ["a", "b", "c", "d", "e"]) {
        await toStuckUnknown(t, userId, `vtu_sweep_window_${suffix}`, {
          providerReference: `PG-REF-${suffix}`,
        });
      }

      const seen: { providerReference: string }[] = [];
      registerAdapter(
        stubAdapter(seen, () => ({ status: "unknown", message: "still processing", raw: {} })),
      );

      try {
        const first = await sweep(t);
        expect(first.providers[0].attempted).toBe(2);

        const second = await sweep(t);
        expect(second.providers[0].skipped).toBe("budget_exhausted");
        expect(second.providers[0].attempted).toBe(0);
        expect(seen).toHaveLength(2);
      } finally {
        restorePairgate();
      }

      const rows = await t.run(async (ctx) => ctx.db.query("vtuTransactions").collect());
      // The same two rows were asked, once each, and the other three were not
      // touched at all: one window, one allowance. (An unpolled row has no
      // counter at all rather than a zero — the field is written only when a
      // poll happens.)
      expect(rows.filter((r: any) => r.reconcileAttempts === 1)).toHaveLength(2);
      expect(rows.filter((r: any) => r.reconcileAttempts === undefined)).toHaveLength(3);
    });
  });

  test("a routed provider with no adapter fails closed to unresolved", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const { userId } = await seed(t);
      const reserved = await toStuckUnknown(t, userId, "vtu_sweep_no_adapter");

      // The routing table was re-pointed after dispatch, so the snapshot names
      // a provider that has no adapter. The sweep must ask about THAT name (not
      // fall back to the row's denormalised `provider`) and then escalate,
      // rather than throwing or silently polling the wrong aggregator.
      await t.run(async (ctx) =>
        ctx.db.patch(reserved.transactionId, { routedProvider: "retired-provider" }),
      );

      const seen: { providerReference: string }[] = [];
      registerAdapter(stubAdapter(seen, () => ({ status: "unknown", message: "x", raw: {} })));

      let report: any;
      try {
        report = await sweep(t);
      } finally {
        restorePairgate();
      }

      // Nothing was polled — spending a call through an adapter that does not
      // exist is not possible, and spending it through the WRONG one would be
      // worse.
      expect(seen).toHaveLength(0);
      expect(report.providers[0].provider).toBe("retired-provider");
      expect(report.providers[0].skipped).toBe("no_adapter");
      expect(report.providers[0].escalated).toBe(1);

      const tx = await txOf(t, reserved.transactionId);
      expect(tx.status).toBe("unresolved");
      expect(tx.unresolvedReason).toBe("provider_unreachable");
      // Escalation never refunds: the provider was not asked, so nothing is
      // confirmed about the top-up either way.
      expect(tx.reversalLedgerId).toBeUndefined();
      expect(await balanceOf(t, userId)).toBe(START_BALANCE - AIRTIME_PRICE);
    });
  });
});

// ─── The admin queue ────────────────────────────────────────────────

describe("admin unresolved queue", () => {
  test("confirm delivered closes the row and moves no money", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const { userId } = await seed(t);
      const adminId = await seedAdmin(t);
      const reserved = await toUnresolved(t, userId, "vtu_admin_confirm");

      const queue = await t
        .withIdentity({ subject: adminId })
        .query(internal.vtuUnresolvedAdmin.listUnresolved, {});
      expect(queue).toHaveLength(1);
      expect(queue[0].unresolvedReason).toBe("max_attempts_exceeded");
      expect(queue[0].pointsDebited).toBe(67);
      // Enough context to decide: why it is here, in words.
      expect(queue[0].failureReason).toContain("Polled 5 times");
      expect(queue[0].provider).toBe("pairgate");
      // No credential material reaches the browser, sealed or otherwise.
      const serialised = JSON.stringify(queue);
      expect(serialised).not.toContain("pg_live_key");
      expect(serialised).not.toContain("cex1.");

      const result = await t
        .withIdentity({ subject: adminId })
        .mutation(internal.vtuUnresolvedAdmin.confirmDelivered, {
          transactionId: reserved.transactionId,
        });
      expect(result.settled).toBe(true);

      const row = await txOf(t, reserved.transactionId);
      expect(row.status).toBe("confirmed");
      expect(row.source).toBe("admin");
      // Delivered: the debit stands, and no credit is issued.
      expect(await balanceOf(t, userId)).toBe(START_BALANCE - AIRTIME_PRICE);
      expect(
        (await ledgerFor(t, userId)).filter((l: any) => l.type === "vtu_refund"),
      ).toHaveLength(0);

      const audits = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());
      expect(
        audits.filter((a: any) => a.action === "vtu_transaction_confirmed_delivered"),
      ).toHaveLength(1);
    });
  });

  test("refund customer credits back exactly once, through settleTransaction", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const { userId } = await seed(t);
      const adminId = await seedAdmin(t);
      const reserved = await toUnresolved(t, userId, "vtu_admin_refund");

      const result = await t
        .withIdentity({ subject: adminId })
        .mutation(internal.vtuUnresolvedAdmin.refundCustomer, {
          transactionId: reserved.transactionId,
          note: "Provider dashboard shows no such transaction",
        });
      expect(result.settled).toBe(true);

      const row = await txOf(t, reserved.transactionId);
      expect(row.status).toBe("reversed");
      // Provenance, not policy: a human did this, and it is distinguishable
      // from a provider verdict by the reason alone.
      expect(row.reversalReason).toBe("admin_override");
      expect(row.source).toBe("admin");

      expect(await balanceOf(t, userId)).toBe(START_BALANCE);
      const refunds = (await ledgerFor(t, userId)).filter(
        (l: any) => l.type === "vtu_refund",
      );
      expect(refunds).toHaveLength(1);
      expect(refunds[0].metadata.reversalReason).toBe("admin_override");

      const audits = await t.run(async (ctx) => ctx.db.query("auditLogs").collect());
      expect(audits.filter((a: any) => a.action === "vtu_transaction_refunded")).toHaveLength(1);
    });
  });

  test("both actions no-op when the transaction is already terminal", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const { userId } = await seed(t);
      const adminId = await seedAdmin(t);
      const reserved = await toUnresolved(t, userId, "vtu_admin_noop");
      const asAdmin = t.withIdentity({ subject: adminId });

      const first = await asAdmin.mutation(internal.vtuUnresolvedAdmin.confirmDelivered, {
        transactionId: reserved.transactionId,
      });
      expect(first.settled).toBe(true);

      // A stale queue tab acting on a row someone else already settled: both
      // actions must refuse rather than re-write or pay a second time.
      const again = await asAdmin.mutation(internal.vtuUnresolvedAdmin.confirmDelivered, {
        transactionId: reserved.transactionId,
      });
      expect(again.settled).toBe(false);
      expect((again as { reason?: string }).reason).toBe("already_terminal");

      const refund = await asAdmin.mutation(internal.vtuUnresolvedAdmin.refundCustomer, {
        transactionId: reserved.transactionId,
      });
      expect(refund.settled).toBe(false);
      expect((refund as { reason?: string }).reason).toBe("already_terminal");

      const row = await txOf(t, reserved.transactionId);
      expect(row.status).toBe("confirmed");
      expect(row.reversalLedgerId).toBeUndefined();
      expect(await balanceOf(t, userId)).toBe(START_BALANCE - AIRTIME_PRICE);
      expect(
        (await ledgerFor(t, userId)).filter((l: any) => l.type === "vtu_refund"),
      ).toHaveLength(0);
    });
  });

  test("the queue and both actions are admin-only server-side", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const { userId } = await seed(t);
      const adminId = await seedAdmin(t);
      const reserved = await toUnresolved(t, userId, "vtu_admin_authz");

      // A regular customer, with a valid session: the guard is the role, not
      // the presence of credentials.
      await expect(
        t
          .withIdentity({ subject: userId })
          .query(internal.vtuUnresolvedAdmin.listUnresolved, {}),
      ).rejects.toThrow();
      await expect(
        t
          .withIdentity({ subject: userId })
          .mutation(internal.vtuUnresolvedAdmin.refundCustomer, {
            transactionId: reserved.transactionId,
          }),
      ).rejects.toThrow();

      // No session at all.
      await expect(
        t.query(internal.vtuUnresolvedAdmin.listUnresolved, {}),
      ).rejects.toThrow();

      // And the refusal left the money exactly where it was.
      const row = await txOf(t, reserved.transactionId);
      expect(row.status).toBe("unresolved");
      expect(await balanceOf(t, userId)).toBe(START_BALANCE - AIRTIME_PRICE);

      // The admin's own call still works, proving the failures above are the
      // guard rather than a broken fixture.
      const queue = await t
        .withIdentity({ subject: adminId })
        .query(internal.vtuUnresolvedAdmin.listUnresolved, {});
      expect(queue).toHaveLength(1);
    });
  });
});

// ─── Escalation ──────────────────────────────────────────────────

describe("reconciliation escalation", () => {
  test("the poll limit escalates instead of reversing, and the queue shows it", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const { userId } = await seed(t);
      const adminId = await seedAdmin(t);
      const reserved = await toStuckUnknown(t, userId, "vtu_sweep_max_attempts", {
        providerReference: "PG-MAX-1",
      });

      const seen: { providerReference: string }[] = [];
      registerAdapter(
        stubAdapter(seen, () => ({ status: "unknown", message: "still processing", raw: {} })),
      );

      try {
        // Five sweeps, one poll each — the configured limit.
        for (let i = 0; i < 5; i++) await sweep(t);
        expect(seen).toHaveLength(5);
        expect((await txOf(t, reserved.transactionId)).status).toBe("unknown");

        // The sixth has no budget left for THIS transaction and escalates
        // instead of polling a sixth time…
        const sixth = await sweep(t);
        expect(sixth.providers[0].attempted).toBe(0);
        expect(sixth.providers[0].escalated).toBe(1);
        expect(seen).toHaveLength(5);
      } finally {
        restorePairgate();
      }

      const row = await txOf(t, reserved.transactionId);
      // …and the escalation is NOT a refund: the provider never confirmed
      // failure, so the points stay debited pending a human.
      expect(row.status).toBe("unresolved");
      expect(row.unresolvedReason).toBe("max_attempts_exceeded");
      expect(row.reversalLedgerId).toBeUndefined();
      expect(await balanceOf(t, userId)).toBe(START_BALANCE - AIRTIME_PRICE);
      expect(
        (await ledgerFor(t, userId)).filter((l: any) => l.type === "vtu_refund"),
      ).toHaveLength(0);

      const queue = await t
        .withIdentity({ subject: adminId })
        .query(internal.vtuUnresolvedAdmin.listUnresolved, {});
      expect(queue).toHaveLength(1);
      expect(queue[0].unresolvedReason).toBe("max_attempts_exceeded");
      expect(queue[0].reconcileAttempts).toBe(5);
      expect(queue[0].provider).toBe("pairgate");
    });
  });

  test("a row left in pending escalates as never_dispatched, never polled", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const { userId } = await seed(t);
      const reserved = await t.mutation(internal.vtuInternal.beginPurchase, {
        userId,
        clientRequestId: "vtu_sweep_never_sent",
        serviceCode: SERVICE_CODE,
        customerIdentifier: PHONE,
      });
      // Older than the dispatch window: no HTTP call ever left our side.
      await t.run(async (ctx) =>
        ctx.db.patch(reserved.transactionId, { updatedAt: Date.now() - 10 * 60_000 }),
      );

      const seen: { providerReference: string }[] = [];
      registerAdapter(stubAdapter(seen, () => ({ status: "unknown", message: "x", raw: {} })));

      try {
        const report = await sweep(t);
        // Nothing to ask about: there is no reference and no request.
        expect(seen).toHaveLength(0);
        expect(report.providers[0].attempted).toBe(0);
        expect(report.providers[0].escalated).toBe(1);
      } finally {
        restorePairgate();
      }

      const row = await txOf(t, reserved.transactionId);
      expect(row.status).toBe("unresolved");
      expect(row.unresolvedReason).toBe("never_dispatched");
      // Escalated, not refunded: the points come back only when a human says
      // so, because the cause is a defect in our own dispatch path.
      expect(row.reversalLedgerId).toBeUndefined();
      expect(await balanceOf(t, userId)).toBe(START_BALANCE - AIRTIME_PRICE);
    });
  });

  test("an adapter with no verify() fails closed without spending budget", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const { userId } = await seed(t);
      const reserved = await toStuckUnknown(t, userId, "vtu_sweep_no_verify", {
        providerReference: "PG-NOVERIFY",
      });

      // The registry refuses an adapter like this at registration — that is
      // the first line of defence and is asserted in vtuAidaPayCompat.test.ts.
      // This exercises the SECOND one, for an adapter that was complete when
      // it was registered and is not now (a factory that mutates, a reload
      // path, a hand-built object that slipped past a cast).
      const stub: VtuProviderAdapter = {
        name: "pairgate",
        displayName: "No verify",
        async purchase() {
          throw new Error("unused");
        },
        verifyAndParseCallback() {
          return null;
        },
        async verify() {
          return { status: "unknown", message: "unused", raw: {} };
        },
      };
      registerAdapter(stub);
      delete (stub as any).verify;

      let report: any;
      try {
        report = await sweep(t);
      } finally {
        restorePairgate();
      }

      expect(report.providers[0].skipped).toBe("no_verify");
      expect(report.providers[0].attempted).toBe(0);
      expect(report.providers[0].escalated).toBe(1);

      const row = await txOf(t, reserved.transactionId);
      expect(row.status).toBe("unresolved");
      expect(row.unresolvedReason).toBe("provider_unreachable");
      // The message says what is actually wrong, rather than reporting a
      // transport failure for an error that never touched the network.
      expect(row.failureReason).toContain("verify()");
      expect(row.reversalLedgerId).toBeUndefined();

      // Budget untouched: failing closed must not consume the provider's
      // rate-limited calls.
      const provider = await t.run(async (ctx) =>
        ctx.db
          .query("vtuProviders")
          .withIndex("by_name", (q) => q.eq("name", "pairgate"))
          .unique(),
      );
      expect(provider?.reconcileCallsInWindow).toBeUndefined();
      expect(provider?.lastReconcileSweepAt).toBeGreaterThan(0);
    });
  });

  test("the sweep action racing a webhook in the same tick settles once", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const { userId } = await seed(t);
      const reserved = await toStuckUnknown(t, userId, "vtu_sweep_action_race", {
        providerReference: "PG-RACE-9",
      });

      const seen: { providerReference: string }[] = [];
      registerAdapter(
        stubAdapter(seen, () => ({
          status: "failed",
          code: "NOT_FOUND",
          message: "Provider has no record of it",
          failureKind: "rejected",
          raw: {},
        })),
      );

      let webhook: any;
      let report: any;
      try {
        // Both paths end to end — the webhook action and the whole sweep
        // (selection, reservation, poll, settle) — fired together.
        [webhook, report] = await Promise.all([
          t.action(internal.vtuHttp.applyCallback, {
            provider: "pairgate",
            event: { providerReference: "PG-RACE-9", outcome: "confirmed", costNgn: 1000 },
          }),
          sweep(t),
        ]);
      } finally {
        restorePairgate();
      }

      const row = await txOf(t, reserved.transactionId);
      expect(["confirmed", "reversed"]).toContain(row.status);

      // Exactly one of them brought it to rest…
      const claimed = (webhook.applied ? 1 : 0) + (report.providers[0]?.resolved ?? 0);
      expect(claimed).toBe(1);

      // …and the ledger agrees with that winner and no one else: one debit,
      // at most one refund, and a balance that matches the status.
      const ledger = await ledgerFor(t, userId);
      expect(ledger.filter((l: any) => l.type === "vtu_purchase")).toHaveLength(1);
      const refunds = ledger.filter((l: any) => l.type === "vtu_refund");
      expect(refunds).toHaveLength(row.status === "reversed" ? 1 : 0);
      expect(await balanceOf(t, userId)).toBe(
        row.status === "reversed" ? START_BALANCE : START_BALANCE - AIRTIME_PRICE,
      );
    });
  });
});
