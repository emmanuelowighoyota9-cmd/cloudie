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
const START_BALANCE = 5_000;

async function seed(t: Harness, providerRow: Record<string, unknown> = {}) {
  const now = Date.now();
  const userId = await t.run(async (ctx) =>
    ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      pointsBalance: START_BALANCE,
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

const balanceOf = (t: Harness, userId: any) =>
  t.run(async (ctx) => (await ctx.db.get(userId))?.pointsBalance ?? 0);

const txOf = (t: Harness, id: any) => t.run(async (ctx) => ctx.db.get(id));

const ledgerFor = (t: Harness, userId: any) =>
  t.run(async (ctx) =>
    ctx.db
      .query("pointLedger")
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

// ─── The core path ──────────────────────────────────────────────────

describe("reconciliation sweep", () => {
  test("polls a stuck unknown row, settles it, and credits the ledger exactly once", async () => {
    await withMasterKey(async () => {
      const t = convexTest(schema, modules);
      const { userId } = await seed(t);
      const reserved = await toStuckUnknown(t, userId, "vtu_sweep_core");

      expect((await txOf(t, reserved.transactionId)).status).toBe("unknown");
      expect(await balanceOf(t, userId)).toBe(START_BALANCE - 67);

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
      expect(await balanceOf(t, userId)).toBe(START_BALANCE - 67);
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
          .query("pointLedger")
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
            .query("pointLedger")
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
      expect(await balanceOf(t, userId)).toBe(START_BALANCE - 67);
    });
  });
});
