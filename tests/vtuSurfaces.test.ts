/**
 * Slice 6 — the customer-facing VTU surfaces, exercised against a real Convex
 * backend (`convex-test`) rather than a mirror of the logic.
 *
 * WHAT IS UNDER TEST. Three read surfaces and one write surface that did not
 * exist before this slice: the catalog browse query, the paginated history
 * query, the receipt generator, and the "amended receipt after a reversal"
 * rule. All of them are read-only over data the money path already wrote, which
 * is the property most worth pinning: the ledger, the idempotency keys, the
 * routing decision and the status vocabulary must be OBSERVABLE through these
 * surfaces and must not be altered by them.
 *
 * WHAT IS DELIBERATELY NOT RE-TESTED HERE. The purchase itself, the reversal
 * arithmetic and the settlement rules are covered in `vtuAirtime.test.ts` and
 * `vtuReconcile.test.ts`. The one purchase exercised below is not a duplicate
 * of those tests: it exists to prove that browsing the catalog changed nothing
 * about buying, which is a claim about interaction between the two surfaces and
 * not about either of them alone.
 *
 * `convex-test` is normally driven by Vitest, which supplies the module map via
 * `import.meta.glob`. Bun has no `import.meta.glob`, so the map is passed
 * explicitly as the second argument — the same mechanism, minus the Vite magic.
 */

import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../src/convex/schema";
import { api, internal } from "../src/convex/_generated/api";
import {
  maskIdentifier,
  VTU_AMENDED_RECEIPT_TEMPLATE_SLUG,
  VTU_RECEIPT_TEMPLATE_SLUG,
  vtuStatusCopy,
  vtuStatusReasonCopy,
} from "../src/lib/vtu";
import {
  amendedReceiptNumberFor,
  buildReceiptValues,
  receiptNumberFor,
  wrapReceiptText,
  RECEIPT_LINE_WIDTH,
} from "../src/lib/vtuReceipt";

const modules = {
  "src/convex/_generated/api.js": () => import("../src/convex/_generated/api.js"),
  "src/convex/_generated/server.js": () => import("../src/convex/_generated/server.js"),
  "src/convex/schema.ts": () => import("../src/convex/schema"),
  "src/convex/docTemplates.ts": () => import("../src/convex/docTemplates"),
  "src/convex/platform.ts": () => import("../src/convex/platform"),
  "src/convex/vtu.ts": () => import("../src/convex/vtu"),
  "src/convex/vtuCatalog.ts": () => import("../src/convex/vtuCatalog"),
  "src/convex/vtuInternal.ts": () => import("../src/convex/vtuInternal"),
  "src/convex/vtuReceipt.ts": () => import("../src/convex/vtuReceipt"),
  "src/convex/vtuServiceRouting.ts": () => import("../src/convex/vtuServiceRouting"),
  "src/convex/vtuShared.ts": () => import("../src/convex/vtuShared"),
  "src/convex/points.ts": () => import("../src/convex/points"),
  "src/convex/pricing.ts": () => import("../src/convex/pricing"),
  "src/convex/adminApi.ts": () => import("../src/convex/adminApi"),
  "src/convex/storage.ts": () => import("../src/convex/storage"),
};

type Harness = ReturnType<typeof convexTest>;

const PHONE = "08031234567";
const SERVICE_CODE = "airtime.mtn.1000";
const RATE = 15;
/** ₦1,000 at 15 naira/point → 66.67 → 67, rounded up. */
const EXPECTED_POINTS = 67;
const START_BALANCE = 5_000;
/** A fixed base so "newest first" is a property of the data, not of the clock. */
const T0 = 1_700_000_000_000;

// ─── Seeds ───────────────────────────────────────────────────────────────────

async function seedUser(t: Harness, opts: { name?: string; email?: string; balance?: number } = {}) {
  const now = Date.now();
  return await t.run(async (ctx) =>
    ctx.db.insert("users", {
      name: opts.name ?? "Ada",
      email: opts.email ?? "ada@example.com",
      pointsBalance: opts.balance ?? START_BALANCE,
      createdAt: now,
    }),
  );
}

/**
 * A provider row and a routing row, so a product can be served.
 *
 * `pointPricing` is left empty on purpose: the cost then falls through to the
 * platform rate, which is what makes "the snapshot froze the rate" a testable
 * claim rather than a coincidence of an override.
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
    // The rate is stored, not defaulted, so a test can move it and prove that
    // a receipt does not follow.
    await ctx.db.insert("adminSettings", {
      key: "point_rate",
      value: { ngnPerPoint: RATE, usdPerPoint: 0.01 },
      category: "pricing",
      updatedAt: now,
    });
  });
}

async function seed(t: Harness) {
  const userId = await seedUser(t);
  await seedRoute(t);
  return { userId };
}

/** A purchase walked to `processing` — the state every verdict may be written from. */
async function purchase(
  t: Harness,
  userId: any,
  opts: { requestId: string; serviceCode?: string; phone?: string } = { requestId: "req_default_1" },
) {
  const reserved = await t.mutation(internal.vtuInternal.beginPurchase, {
    userId,
    clientRequestId: opts.requestId,
    serviceCode: opts.serviceCode ?? SERVICE_CODE,
    customerIdentifier: opts.phone ?? PHONE,
  });
  await t.mutation(internal.vtuInternal.markProcessing, {
    transactionId: reserved.transactionId,
  });
  return reserved;
}

/** One transaction row, written directly: the history query only reads these. */
async function insertTx(t: Harness, userId: any, overrides: Record<string, any> = {}) {
  const now = (overrides.createdAt as number) ?? Date.now();
  return await t.run(async (ctx) =>
    ctx.db.insert("vtuTransactions", {
      userId,
      clientRequestId: `req_${String(overrides.createdAt ?? now)}`,
      serviceCode: SERVICE_CODE,
      routedProvider: "pairgate",
      routedProviderProductCode: SERVICE_CODE,
      provider: "pairgate",
      status: "confirmed",
      customerIdentifier: maskIdentifier(PHONE),
      amountNgn: 1000,
      nairaPrice: 1000,
      ngnPerPoint: RATE,
      pointsDebited: EXPECTED_POINTS,
      providerReference: "PG-REF-1",
      idempotencyKey: "vtu:purchase:seeded",
      resolvedAt: now,
      createdAt: now,
      updatedAt: now,
      ...overrides,
    }),
  );
}

const balanceOf = (t: Harness, userId: any) =>
  t.run(async (ctx) => (await ctx.db.get(userId))?.pointsBalance ?? 0);

const historyPage = (t: Harness, userId: any, numItems = 10, cursor: string | null = null) =>
  t
    .withIdentity({ subject: userId })
    .query(api.vtu.listMyHistory, { paginationOpts: { numItems, cursor } });

/**
 * A BILLABLE template with a published version — the control for the receipt's
 * `billable: false` exemption.
 *
 * Without it, "the receipt was free" is a claim that would also be satisfied by
 * an engine that charges nothing at all. This is the same table, the same
 * version row and the same `resolveDocumentCost` call the receipt goes through,
 * with only the flag left at its default.
 */
async function seedBillableTemplate(t: Harness, userId: any) {
  const now = Date.now();
  const schema = {
    fields: [
      { id: "fullName", label: "Full name", type: "text", required: true, maxLength: 120 },
    ],
  };
  const templateId = await t.run(async (ctx) =>
    ctx.db.insert("documentTemplates", {
      documentType: "general",
      name: "Control certificate",
      slug: "control-certificate",
      renderer: "svg",
      status: "active",
      visibility: "public",
      sensitivity: "standard",
      requiredCredits: 40,
      supportedFormats: ["png", "pdf"],
      schema,
      configuration: { pages: [] },
      createdById: userId,
      isActive: true,
      currentVersion: 1,
      createdAt: now,
      updatedAt: now,
    }),
  );
  await t.run(async (ctx) =>
    ctx.db.insert("documentTemplateVersions", {
      templateId,
      version: 1,
      title: "Control certificate",
      blocks: {
        schema,
        configuration: { pages: [] },
        sensitivity: "standard",
        requiredCredits: 40,
        supportedFormats: ["png", "pdf"],
      },
      pointsCost: 40,
      createdById: userId,
      createdAt: now,
    }),
  );
  return { templateId };
}

const allTx = (t: Harness) => t.run(async (ctx) => ctx.db.query("vtuTransactions").collect());

const allDocuments = (t: Harness) =>
  t.run(async (ctx) => ctx.db.query("renderedDocuments").collect());

/**
 * The render step the browser performs, driven to completion in a test.
 *
 * `finalizeDocument` insists on a real uploaded artifact — the receipt's cost
 * exemption is honoured HERE as well as at creation, so a test that stops before
 * this point would only have proved half of it. The bytes are a stand-in: what
 * matters is that a storage id exists and that this mutation is the one
 * deciding whether to charge.
 */
const finalize = async (t: Harness, userId: any, documentId: any, attemptId = "attempt-1") => {
  const pdfStorageId = await t.run(async (ctx) =>
    ctx.storage.store(new Blob(["%PDF-1.4 fake receipt render"], { type: "application/pdf" })),
  );
  return await t
    .withIdentity({ subject: userId })
    .mutation(api.docTemplates.finalizeDocument, {
      documentId,
      attemptId,
      pdfStorageId,
      pageCount: 1,
      sizeBytes: 2048,
    });
};

// ─── History: whose rows, in what order, how many ───────────────────────────

describe("history shows the customer their own purchases", () => {
  test("returns only the caller's rows, newest first", async () => {
    const t = convexTest(schema, modules);
    const ada = await seedUser(t, { name: "Ada", email: "ada@example.com" });
    const bo = await seedUser(t, { name: "Bo", email: "bo@example.com" });

    await insertTx(t, ada, { createdAt: T0, clientRequestId: "req_ada_old" });
    await insertTx(t, ada, { createdAt: T0 + 2000, clientRequestId: "req_ada_mid" });
    await insertTx(t, ada, { createdAt: T0 + 4000, clientRequestId: "req_ada_new" });
    // Newest in the table overall, and BO's. If the query ever leaked, this is
    // the row that would prove it.
    await insertTx(t, bo, { createdAt: T0 + 9000, clientRequestId: "req_bo_new" });

    const { page } = await historyPage(t, ada);

    expect(page).toHaveLength(3);
    expect(page.every((row: any) => row._id !== undefined)).toBe(true);
    expect(page.map((row: any) => row.createdAt)).toEqual([T0 + 4000, T0 + 2000, T0]);
    // Nothing of Bo's, by identity rather than by absence of a matching field.
    const boRows = new Set((await allTx(t)).filter((tx: any) => String(tx.userId) === String(bo)).map((tx: any) => String(tx._id)));
    expect(boRows.size).toBe(1);
    expect(page.some((row: any) => boRows.has(String(row._id)))).toBe(false);
  });

  test("a second customer sees only their own, and the count is their count", async () => {
    const t = convexTest(schema, modules);
    const ada = await seedUser(t, { name: "Ada", email: "ada@example.com" });
    const bo = await seedUser(t, { name: "Bo", email: "bo@example.com" });
    await insertTx(t, ada, { createdAt: T0, clientRequestId: "req_ada_one" });
    await insertTx(t, bo, { createdAt: T0 + 1000, clientRequestId: "req_bo_one" });
    await insertTx(t, bo, { createdAt: T0 + 2000, clientRequestId: "req_bo_two" });

    const { page } = await historyPage(t, bo);
    expect(page).toHaveLength(2);
    expect(page.map((row: any) => row.createdAt)).toEqual([T0 + 2000, T0 + 1000]);
  });

  test("paginates with a cursor and says whether more remains", async () => {
    const t = convexTest(schema, modules);
    const ada = await seedUser(t);
    for (let i = 0; i < 5; i += 1) {
      await insertTx(t, ada, { createdAt: T0 + i * 1000, clientRequestId: `req_page_${i}` });
    }

    const first = await historyPage(t, ada, 2);
    expect(first.page).toHaveLength(2);
    expect(first.isDone).toBe(false);
    expect(first.continueCursor).toBeTruthy();
    expect(first.page.map((row: any) => row.createdAt)).toEqual([T0 + 4000, T0 + 3000]);

    const second = await historyPage(t, ada, 2, first.continueCursor);
    expect(second.page.map((row: any) => row.createdAt)).toEqual([T0 + 2000, T0 + 1000]);
    expect(second.isDone).toBe(false);

    const third = await historyPage(t, ada, 2, second.continueCursor);
    expect(third.page.map((row: any) => row.createdAt)).toEqual([T0]);
    expect(third.isDone).toBe(true);
  });

  test("a session that expired mid-page gets an empty page, not a crash", async () => {
    const t = convexTest(schema, modules);
    const signedOut = await t.query(api.vtu.listMyHistory, {
      paginationOpts: { numItems: 10, cursor: null },
    });
    expect(signedOut.page).toEqual([]);
    expect(signedOut.isDone).toBe(true);
  });

  test("the destination is masked in the row the browser receives", async () => {
    const t = convexTest(schema, modules);
    const { userId: ada } = await seed(t);
    const bought = await purchase(t, ada, { requestId: "req_mask_check" });

    const { page } = await historyPage(t, ada);
    expect(page).toHaveLength(1);
    const identifier = page[0].customerIdentifier;

    // Masked AT WRITE, so this is not a display filter over a stored number:
    // the raw digits are absent from the row itself.
    expect(identifier).toBe(maskIdentifier(PHONE));
    expect(identifier).not.toBe(PHONE);
    expect(identifier.endsWith(PHONE.slice(-4))).toBe(true);
    // The unmasked middle is not recoverable from what crossed the wire.
    expect(identifier).not.toContain(PHONE.slice(1, 6));
    expect((await t.run(async (ctx) => ctx.db.get(bought.transactionId)))?.customerIdentifier).toBe(
      maskIdentifier(PHONE),
    );
  });
});

// ─── History: what a status is allowed to say ────────────────────────────────

describe("history renders a status a customer can act on", () => {
  test("a reversed purchase carries the reason it was reversed", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);
    const bought = await purchase(t, userId, { requestId: "req_reversed_reason" });

    await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: bought.transactionId,
      source: "reconciliation",
      verdict: {
        status: "unresolved",
        unresolvedReason: "provider_unreachable",
        message: "Provider did not answer",
      },
    });
    // A human then refunded it. This is the ONLY route to `reversed`, which is
    // what makes it the case the amended receipt exists for.
    await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: bought.transactionId,
      source: "admin",
      verdict: {
        status: "reversed",
        reversalReason: "admin_override",
        reason: "Customer asked for a refund",
      },
    });

    const { page } = await historyPage(t, userId);
    const row = page[0];
    expect(row.status).toBe("reversed");
    expect(row.reversalReason).toBe("admin_override");

    const copy = vtuStatusCopy(row.status);
    expect(copy?.label).toBe("Refunded");
    expect(vtuStatusReasonCopy(row)).toBe("Refunded by our support team.");
  });

  test("an unresolved purchase carries why it needs a human", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);
    const bought = await purchase(t, userId, { requestId: "req_unresolved_reason" });

    await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: bought.transactionId,
      source: "reconciliation",
      verdict: {
        status: "unresolved",
        unresolvedReason: "max_attempts_exceeded",
        message: "Gave up after the attempt budget",
      },
    });

    const { page } = await historyPage(t, userId);
    const row = page[0];
    expect(row.status).toBe("unresolved");
    expect(row.unresolvedReason).toBe("max_attempts_exceeded");
    expect(row.reversalReason).toBeNull();

    // The wording the purchase page and the receipt both read, so the three
    // surfaces cannot describe one event three ways.
    expect(vtuStatusCopy(row.status)?.label).toBe("We're looking into this");
    expect(vtuStatusReasonCopy(row)).toBe(
      "The provider has not confirmed it after several attempts.",
    );
  });

  test("no resting row is `failed`, and no copy exists for it", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);

    const doomed = await purchase(t, userId, { requestId: "req_failed_shape" });
    await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: doomed.transactionId,
      source: "dispatch",
      verdict: {
        status: "failed",
        reversalReason: "provider_failed",
        code: "INVALID_PRODUCT",
        message: "Unknown product",
      },
    });
    const delivered = await purchase(t, userId, { requestId: "req_confirmed_shape" });
    await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: delivered.transactionId,
      source: "webhook",
      verdict: { status: "confirmed", providerReference: "PG-REF-9" },
    });

    // The verdict asked for `failed`; the committed row is `reversed`, because
    // the verdict and the refund commit together.
    const rows = await allTx(t);
    expect(rows.map((tx: any) => tx.status).sort()).toEqual(["confirmed", "reversed"]);

    // And the copy map has no entry for it: rendering a `failed` row would be
    // rendering a state no client can observe.
    expect(vtuStatusCopy("failed")).toBeNull();

    const { page } = await historyPage(t, userId);
    expect(page.map((row: any) => row.status).sort()).toEqual(["confirmed", "reversed"]);
    for (const row of page) {
      expect(vtuStatusCopy(row.status)).not.toBeNull();
    }
  });
});

// ─── Receipts: generated on demand, free, and the same document twice ───────

describe("a receipt is issued on the first request and never twice", () => {
  test("a second request returns the first document", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);
    const bought = await purchase(t, userId, { requestId: "req_receipt_once" });
    await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: bought.transactionId,
      source: "webhook",
      verdict: { status: "confirmed", providerReference: "PG-REF-777" },
    });

    const first = await t
      .withIdentity({ subject: userId })
      .mutation(api.vtuReceipt.prepareReceipt, { transactionId: bought.transactionId });

    expect(first.needsRender).toBe(true);
    if (!first.needsRender) throw new Error("unreachable");
    const firstValues = first.values;
    expect(String(firstValues.receiptNumber)).toBe(receiptNumberFor(String(bought.transactionId)));
    // The identifier the provider issued, so support can find the purchase.
    expect(String(firstValues.providerReference)).toBe("PG-REF-777");
    // The service is named, not coded.
    expect(String(firstValues.serviceName)).toBe("MTN Airtime");

    // A second click BEFORE the first render finished resumes it rather than
    // starting a rival: same document, same values, same receipt number, so an
    // interrupted attempt cannot mint two receipts for one purchase.
    const resumed = await t
      .withIdentity({ subject: userId })
      .mutation(api.vtuReceipt.prepareReceipt, { transactionId: bought.transactionId });
    if (!resumed.needsRender) throw new Error("unreachable");
    expect(resumed.documentId).toBe(first.documentId);
    expect(resumed.values).toEqual(firstValues);
    expect(await allDocuments(t)).toHaveLength(1);

    // Once the render has landed there is nothing left to do, and the click
    // says so.
    await finalize(t, userId, first.documentId);
    const second = await t
      .withIdentity({ subject: userId })
      .mutation(api.vtuReceipt.prepareReceipt, { transactionId: bought.transactionId });

    // Same document, not a rival: the second click has nothing to render.
    expect(second.needsRender).toBe(false);
    expect((second as any).documentId).toBe(first.documentId);

    const documents = await allDocuments(t);
    expect(documents).toHaveLength(1);
    expect(documents[0].inputData).toEqual(firstValues);
    expect(documents[0].status).toBe("completed");

    const tx = await t.run(async (ctx) => ctx.db.get(bought.transactionId));
    expect(tx?.receiptDocumentId).toBe(first.documentId);
    expect(tx?.receiptTemplateKey).toBe(VTU_RECEIPT_TEMPLATE_SLUG);
  });

  test("a receipt costs the customer nothing", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);
    const bought = await purchase(t, userId, { requestId: "req_receipt_free" });
    const afterPurchase = await balanceOf(t, userId);
    expect(afterPurchase).toBe(START_BALANCE - EXPECTED_POINTS);

    const prepared = await t
      .withIdentity({ subject: userId })
      .mutation(api.vtuReceipt.prepareReceipt, { transactionId: bought.transactionId });
    if (!prepared.needsRender) throw new Error("unreachable");
    const rendered = await finalize(t, userId, prepared.documentId);
    await t
      .withIdentity({ subject: userId })
      .mutation(api.vtuReceipt.prepareReceipt, { transactionId: bought.transactionId });

    // Charging for the paperwork that proves a charge is a loop with no good
    // answer, so the exemption is on the template and is honoured at creation
    // AND at render. A template flag honoured in only one of the two is a bug
    // with a receipt on it.
    expect(rendered.charged).toBe(0);
    expect(await balanceOf(t, userId)).toBe(afterPurchase);
    const documents = await allDocuments(t);
    expect(documents[0].pointsCost).toBe(0);
    expect(documents[0].renderPrice).toBe(0);

    // And the exemption is scoped, not a hole: the same engine still charges
    // for a billable template, which is the control for the two assertions
    // above.
    const control = await seedBillableTemplate(t, userId);
    const billableCost = await t
      .withIdentity({ subject: userId })
      .mutation(api.docTemplates.createDocument, {
        templateId: control.templateId,
        title: "A customer document",
        values: { fullName: "Ada" },
      });
    expect(billableCost.charged).toBeGreaterThan(0);
    expect(await balanceOf(t, userId)).toBe(afterPurchase - billableCost.charged);
  });

  test("a receipt is not a document in the customer's library", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);
    const bought = await purchase(t, userId, { requestId: "req_receipt_library" });
    await t
      .withIdentity({ subject: userId })
      .mutation(api.vtuReceipt.prepareReceipt, { transactionId: bought.transactionId });

    const library = await t
      .withIdentity({ subject: userId })
      .query(api.docTemplates.listMyDocuments, {});
    expect(library).toEqual([]);

    // And the counter above the list agrees with the list, rather than reading
    // "1 document" above "no documents yet".
    const stats = await t
      .withIdentity({ subject: userId })
      .query(api.docTemplates.getStudioStats, {});
    expect(stats?.documents).toBe(0);
    // Storage is still counted: it is a physical fact about the account, and
    // the receipt is a real file.
    expect(await allDocuments(t)).toHaveLength(1);
  });

  test("one customer cannot open another customer's receipt", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);
    const stranger = await seedUser(t, { name: "Mal", email: "mal@example.com" });
    const bought = await purchase(t, userId, { requestId: "req_receipt_private" });

    let refused = false;
    try {
      await t
        .withIdentity({ subject: stranger })
        .mutation(api.vtuReceipt.prepareReceipt, { transactionId: bought.transactionId });
    } catch {
      refused = true;
    }
    expect(refused).toBe(true);
    expect(await allDocuments(t)).toHaveLength(0);
  });
});

// ─── Receipts: the rate is the one frozen at purchase ───────────────────────

describe("a receipt prints the snapshot, not today's price", () => {
  test("moving the platform rate after settlement does not move the receipt", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);
    const bought = await purchase(t, userId, { requestId: "req_receipt_snapshot" });
    await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: bought.transactionId,
      source: "webhook",
      verdict: { status: "confirmed" },
    });

    // The rate moves AFTER the debit, exactly as an operator's price change
    // would. At 25 naira/point the same ₦1,000 would be 40 points.
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("adminSettings")
        .withIndex("by_key", (q: any) => q.eq("key", "point_rate"))
        .first();
      if (!row) throw new Error("rate row missing");
      await ctx.db.patch(row._id, {
        value: { ngnPerPoint: 25, usdPerPoint: 0.01 },
        updatedAt: Date.now(),
      });
    });
    const rate = await t.query(api.pricing.getBillingConfig, {});
    expect(rate.ngnPerPoint).toBe(25);

    const prepared = await t
      .withIdentity({ subject: userId })
      .mutation(api.vtuReceipt.prepareReceipt, { transactionId: bought.transactionId });
    if (!prepared.needsRender) throw new Error("unreachable");
    const values = prepared.values;

    // What the customer was charged, not what the platform charges now.
    expect(String(values.ngnPerPoint)).toBe(String(RATE));
    expect(String(values.pointsDebited)).toBe(String(EXPECTED_POINTS));
    expect(String(values.amountPaid)).toBe("1000.00");
  });

  test("the destination on the receipt is masked, as it is everywhere else", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);
    const bought = await purchase(t, userId, { requestId: "req_receipt_mask" });

    const prepared = await t
      .withIdentity({ subject: userId })
      .mutation(api.vtuReceipt.prepareReceipt, { transactionId: bought.transactionId });
    if (!prepared.needsRender) throw new Error("unreachable");

    const destination = String(prepared.values.destination);
    expect(destination).toBe(maskIdentifier(PHONE));
    expect(destination).not.toContain(PHONE.slice(1, 6));
  });
});

// ─── Receipts: a reversal amends, it does not rewrite ───────────────────────

describe("a reversal issues a second receipt and leaves the first alone", () => {
  test("the pointer moves to an amended document, and the first is untouched", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);
    const bought = await purchase(t, userId, { requestId: "req_receipt_amended" });

    await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: bought.transactionId,
      source: "reconciliation",
      verdict: {
        status: "unresolved",
        unresolvedReason: "provider_unreachable",
        message: "Provider did not answer",
      },
    });

    const original = await t
      .withIdentity({ subject: userId })
      .mutation(api.vtuReceipt.prepareReceipt, { transactionId: bought.transactionId });
    if (!original.needsRender) throw new Error("unreachable");
    const originalId = original.documentId;
    const originalNumber = String(original.values.receiptNumber);
    const originalDocument = await t.run(async (ctx) => ctx.db.get(originalId));

    // The receipt and the refund must not share a timestamp: the amendment rule
    // compares the document's creation against the reversal, so two writes in
    // the same millisecond would make the comparison a coin flip.
    await new Promise((resolve) => setTimeout(resolve, 5));

    const reversal = await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: bought.transactionId,
      source: "admin",
      verdict: {
        status: "reversed",
        reversalReason: "admin_override",
        reason: "Customer asked for a refund",
      },
    });
    expect(reversal.settled).toBe(true);

    const amended = await t
      .withIdentity({ subject: userId })
      .mutation(api.vtuReceipt.prepareReceipt, { transactionId: bought.transactionId });
    if (!amended.needsRender) throw new Error("unreachable");

    // A SECOND document, not an edit. The first may already have been
    // downloaded, forwarded or filed; it stays a true statement about when it
    // was issued.
    expect(amended.documentId).not.toBe(originalId);
    expect(await allDocuments(t)).toHaveLength(2);

    // And it says which receipt it supersedes, in the customer's words.
    expect(String(amended.values.amendsReceiptNumber)).toBe(originalNumber);
    expect(String(amended.values.amendmentNote)).toContain("Refunded");
    expect(String(amended.values.receiptNumber)).toBe(
      amendedReceiptNumberFor(String(bought.transactionId)),
    );
    expect(String(amended.values.receiptNumber)).not.toBe(originalNumber);
    // The amended receipt describes the refund, in the same words the history
    // row does.
    expect(String(amended.values.status)).toBe(vtuStatusCopy("reversed")!.label);

    // The original document is byte-for-byte what it was: same number, same
    // input values, same version.
    const originalAfter = await t.run(async (ctx) => ctx.db.get(originalId));
    expect(originalAfter?.inputData).toEqual(originalDocument?.inputData);
    expect(originalAfter?.templateVersionId).toBe(originalDocument?.templateVersionId);

    // A click AFTER the reversal follows the pointer to the amended receipt,
    // never back to the one the refund made untrue. It still says
    // `needsRender` while that receipt's own render is outstanding, because
    // resuming it is the correct answer, not generating a third document.
    const afterwards = await t
      .withIdentity({ subject: userId })
      .mutation(api.vtuReceipt.prepareReceipt, { transactionId: bought.transactionId });
    expect((afterwards as any).documentId).toBe(amended.documentId);
    expect(await allDocuments(t)).toHaveLength(2);

    // The pointer says which KIND is current, so a read can tell without
    // loading the document.
    const tx = await t.run(async (ctx) => ctx.db.get(bought.transactionId));
    expect(tx?.receiptDocumentId).toBe(amended.documentId);
    expect(tx?.receiptTemplateKey).toBe(VTU_AMENDED_RECEIPT_TEMPLATE_SLUG);
  });

  test("a receipt first requested after the refund describes the refund", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);
    const bought = await purchase(t, userId, { requestId: "req_receipt_after_only" });

    await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: bought.transactionId,
      source: "reconciliation",
      verdict: { status: "unresolved", unresolvedReason: "never_dispatched" },
    });
    await t.mutation(internal.vtuInternal.settleTransaction, {
      transactionId: bought.transactionId,
      source: "admin",
      verdict: { status: "reversed", reversalReason: "admin_override" },
    });

    const prepared = await t
      .withIdentity({ subject: userId })
      .mutation(api.vtuReceipt.prepareReceipt, { transactionId: bought.transactionId });
    if (!prepared.needsRender) throw new Error("unreachable");

    // There is no earlier receipt to supersede, so this is the plain template
    // and the customer is not handed a second document apologising for a
    // receipt that was right.
    expect(String(prepared.values.amendsReceiptNumber ?? "")).toBe("");
    expect(String(prepared.values.receiptNumber)).toBe(
      receiptNumberFor(String(bought.transactionId)),
    );
    expect(await allDocuments(t)).toHaveLength(1);

    const tx = await t.run(async (ctx) => ctx.db.get(bought.transactionId));
    expect(tx?.receiptTemplateKey).toBe(VTU_RECEIPT_TEMPLATE_SLUG);
  });

  test("viewing a receipt does not move the transaction's lifecycle clock", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t);
    const bought = await purchase(t, userId, { requestId: "req_receipt_updatedAt" });
    const before = await t.run(async (ctx) => ctx.db.get(bought.transactionId));

    await t
      .withIdentity({ subject: userId })
      .mutation(api.vtuReceipt.prepareReceipt, { transactionId: bought.transactionId });

    // `updatedAt` is what the reconciliation sweep measures staleness on.
    // Issuing paperwork is not a lifecycle event, and moving it would make the
    // sweep judge a purchase by when the customer read their receipt.
    const after = await t.run(async (ctx) => ctx.db.get(bought.transactionId));
    expect(after?.updatedAt).toBe(before?.updatedAt);
    expect(after?.status).toBe(before?.status);
  });
});

// ─── Receipt values: the mapping, exercised without a database ───────────────
//
// `buildReceiptValues` is pure and lives in `lib/`, so it is tested directly.
// The harness above can only prove that the receipt agrees with what is stored
// — and what is STORED is already masked, so it cannot tell a second masking
// pass from no masking pass at all. These tests feed the builder a raw phone
// number, which is the case the second pass exists for: a future caller that
// hands it an unmasked value must still not get one on paper.

describe("a receipt built from a raw transaction shape", () => {
  const raw = {
    transactionId: "tx_raw_shape_01",
    customerIdentifier: PHONE,
    nairaPrice: 1000,
    ngnPerPoint: RATE,
    pointsDebited: EXPECTED_POINTS,
    status: "confirmed",
    providerReference: "PG-REF-1",
    reversalReason: null,
    resolvedAt: T0,
  };
  const context = {
    issuer: "Crestline Express",
    serviceName: "MTN Airtime",
    issuedAt: T0,
    receiptNumber: receiptNumberFor("tx_raw_shape_01"),
  };

  test("masks an identifier that arrives unmasked", () => {
    const built = buildReceiptValues(raw, context);
    if (!built.ok) throw new Error(built.error);

    // The value handed in is the full number. The value that goes on the
    // document is not, which is the whole reason the mapping does the masking
    // rather than trusting its caller.
    expect(raw.customerIdentifier).toBe(PHONE);
    expect(built.values.destination).toBe(maskIdentifier(PHONE));
    expect(built.values.destination).not.toContain(PHONE.slice(1, 6));
  });

  test("refuses a status no customer can be shown", () => {
    // `failed` is decided and reversed inside one mutation, so no committed
    // row ever carries it — and a receipt must not invent a sentence for a
    // state the rest of the product cannot describe.
    const built = buildReceiptValues({ ...raw, status: "failed" }, context);
    expect(built.ok).toBe(false);
  });

  test("carries the snapshot and the customer-facing status words", () => {
    const built = buildReceiptValues(raw, context);
    if (!built.ok) throw new Error(built.error);
    expect(built.values.ngnPerPoint).toBe(String(RATE));
    expect(built.values.pointsDebited).toBe(String(EXPECTED_POINTS));
    expect(built.values.amountPaid).toBe("1000.00");
    expect(built.values.status).toBe(vtuStatusCopy("confirmed")!.label);
    // ISO-8601 with an offset: the renderer formats through `new Date`, and an
    // offsetless string would print a different clock for every reader.
    expect(String(built.values.issuedOn)).toBe(new Date(T0).toISOString());
    expect(String(built.values.issuedOn)).toMatch(/[+-]\d{2}:\d{2}$|Z$/);
  });

  test("wraps the long sentences to the width the templates were drawn for", () => {
    const built = buildReceiptValues({ ...raw, status: "unresolved" }, context);
    if (!built.ok) throw new Error(built.error);
    const lines = String(built.values.statusDetail).split("\n");
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(line.length).toBeLessThanOrEqual(RECEIPT_LINE_WIDTH);
      // No word is ever split: a mangled word is worse than a long line.
      expect(line).not.toMatch(/[a-z]- /);
    }
    expect(wrapReceiptText("")).toBe("");
  });

  test("an amendment explains itself in the words the history page uses", () => {
    const built = buildReceiptValues(
      { ...raw, status: "reversed", reversalReason: "admin_override" },
      { ...context, receiptNumber: amendedReceiptNumberFor("tx_raw_shape_01"), amendsReceiptNumber: receiptNumberFor("tx_raw_shape_01") },
    );
    if (!built.ok) throw new Error(built.error);
    const note = String(built.values.amendmentNote);
    expect(note).toContain("Refunded by our support team.");
    // The supersession is stated rather than left for the customer to infer
    // from a changed total.
    expect(note).toContain("superseded, not edited");
  });
});

// ─── Catalog browse: what is for sale, and nothing about how it is served ───

describe("catalog browse lists what can be bought and nothing else", () => {
  async function seedCatalog(t: Harness) {
    const now = Date.now();
    await t.run(async (ctx) => {
      // Active, routable airtime — the shape slice 3 ships with.
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
      // A second active product of the same type, to prove grouping is by
      // type and not a single hardcoded row.
      await ctx.db.insert("vtuServiceCatalog", {
        serviceType: "airtime",
        productCode: "airtime-airtel",
        displayName: "Airtel Airtime",
        customerIdentifierLabel: "Phone number",
        requiresAmount: true,
        requiresPackageCode: false,
        minAmount: 100,
        maxAmount: 50_000,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      // A product an operator has switched off: it must not be browsable.
      await ctx.db.insert("vtuServiceCatalog", {
        serviceType: "airtime",
        productCode: "airtime-glo",
        displayName: "Glo Airtime",
        customerIdentifierLabel: "Phone number",
        requiresAmount: true,
        requiresPackageCode: false,
        minAmount: 100,
        maxAmount: 50_000,
        active: false,
        createdAt: now,
        updatedAt: now,
      });
      // A data bundle, active but NOT routable yet, and a different shape:
      // no amount, a package code instead.
      await ctx.db.insert("vtuServiceCatalog", {
        serviceType: "data",
        productCode: "data-mtn-1gb",
        displayName: "MTN 1GB Monthly",
        customerIdentifierLabel: "Phone number",
        requiresAmount: false,
        requiresPackageCode: true,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
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
      await ctx.db.insert("vtuServiceRouting", {
        productCode: "airtime-mtn",
        provider: "pairgate",
        providerProductCode: "airtime.mtn.{amount}",
        priority: 1,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      // Airtel is routed to the same provider. Without a row, routing fails
      // closed and the product is honestly shown as not buyable — which is the
      // behaviour the next test's "unrouted" case relies on.
      await ctx.db.insert("vtuServiceRouting", {
        productCode: "airtime-airtel",
        provider: "pairgate",
        providerProductCode: "airtime.airtel.{amount}",
        priority: 2,
        active: true,
        createdAt: now,
        updatedAt: now,
      });
      await ctx.db.insert("adminSettings", {
        key: "point_rate",
        value: { ngnPerPoint: RATE, usdPerPoint: 0.01 },
        category: "pricing",
        updatedAt: now,
      });
    });
  }

  test("groups active products by service type and omits the inactive ones", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedCatalog(t);

    const catalog = await t.query(api.vtuCatalog.listCatalog, {});
    const groups = catalog.groups.map((g: any) => g.serviceType);
    expect(groups).toEqual(["airtime", "data"]);

    const airtime = catalog.groups.find((g: any) => g.serviceType === "airtime");
    expect(airtime.products.map((p: any) => p.productCode).sort()).toEqual([
      "airtime-airtel",
      "airtime-mtn",
    ]);
    // The switched-off product is not browsable, at any depth of the payload.
    expect(JSON.stringify(catalog)).not.toContain("airtime-glo");
    expect(JSON.stringify(catalog)).not.toContain("Glo Airtime");

    const mtn = airtime.products.find((p: any) => p.productCode === "airtime-mtn");
    expect(mtn.displayName).toBe("MTN Airtime");
    expect(mtn.customerIdentifierLabel).toBe("Phone number");
    expect(mtn.requiresAmount).toBe(true);
    expect(mtn.requiresPackageCode).toBe(false);
    expect(mtn.minAmount).toBe(100);
    expect(mtn.maxAmount).toBe(100_000);
    expect(mtn.airtimeNetwork).toBe("mtn");
  });

  test("exposes no routing or provider detail to the browser", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedCatalog(t);

    const catalog = await t.query(api.vtuCatalog.listCatalog, {});
    const json = JSON.stringify(catalog);

    // The routing table is not the customer's business. Pricing is a number the
    // server resolved; the route that produced it is not the browser's, and a
    // provider's product code leaks the aggregator contract.
    expect(json).not.toContain("pairgate");
    expect(json).not.toContain("provider");
    expect(json).not.toContain("priority");
    expect(json).not.toContain("airtime.mtn.{amount}");
    expect(json).not.toContain("encryptedApiKey");

    // Belt and braces: not one product carries a provider-shaped key.
    for (const group of catalog.groups) {
      for (const product of group.products) {
        expect(Object.keys(product).sort()).toEqual([
          "airtimeNetwork",
          "customerIdentifierLabel",
          "displayName",
          "fixedPoints",
          "indicativeMaxPoints",
          "indicativeMinPoints",
          "maxAmount",
          "minAmount",
          "priceResolved",
          "productCode",
          "purchasable",
          "requiresAmount",
          "requiresPackageCode",
        ]);
      }
    }
  });

  test("prices what it can and says so when it cannot", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedCatalog(t);

    const catalog = await t.query(api.vtuCatalog.listCatalog, {});
    const airtime = catalog.groups.find((g: any) => g.serviceType === "airtime");
    const data = catalog.groups.find((g: any) => g.serviceType === "data");

    // Routable and amount-based: buyable, and the range is derived from the
    // catalog's own bounds at the platform rate.
    const mtn = airtime.products.find((p: any) => p.productCode === "airtime-mtn");
    expect(mtn.purchasable).toBe(true);
    // No routing-row override, so there is no single price for the product and
    // the card says "from" rather than inventing one.
    expect(mtn.fixedPoints).toBeNull();
    expect(mtn.indicativeMinPoints).toBe(Math.ceil(100 / RATE));
    expect(mtn.indicativeMaxPoints).toBe(Math.ceil(100_000 / RATE));

    // Airtel is routable and priced on its own row: routing is the backend's
    // decision, and two products of one type can cost differently.
    const airtel = airtime.products.find((p: any) => p.productCode === "airtime-airtel");
    expect(airtel.purchasable).toBe(true);
    expect(airtel.indicativeMaxPoints).toBe(Math.ceil(50_000 / RATE));

    // Active, listed, and honestly marked as not buyable yet: no route, and a
    // shape (no amount) the purchase panel cannot yet fill.
    const bundle = data.products.find((p: any) => p.productCode === "data-mtn-1gb");
    expect(bundle.purchasable).toBe(false);
    expect(bundle.requiresAmount).toBe(false);
    expect(bundle.requiresPackageCode).toBe(true);
    expect(bundle.airtimeNetwork).toBeNull();
    // A product that varies by nothing has no range to show.
    expect(bundle.indicativeMinPoints).toBeNull();
    expect(bundle.indicativeMaxPoints).toBeNull();
  });

  test("a routing-row override is the one case that shows a single price", async () => {
    const t = convexTest(schema, modules);
    await seedUser(t);
    await seedCatalog(t);
    await t.run(async (ctx) => {
      const row = await ctx.db
        .query("vtuServiceRouting")
        .withIndex("by_productCode_provider", (q: any) =>
          q.eq("productCode", "airtime-mtn").eq("provider", "pairgate"),
        )
        .first();
      if (!row) throw new Error("route missing");
      await ctx.db.patch(row._id, { pointsCostOverride: 5 });
    });

    const catalog = await t.query(api.vtuCatalog.listCatalog, {});
    const mtn = catalog.groups
      .find((g: any) => g.serviceType === "airtime")
      .products.find((p: any) => p.productCode === "airtime-mtn");
    expect(mtn.fixedPoints).toBe(5);
  });

  test("browsing the catalog does not change what buying costs", async () => {
    const t = convexTest(schema, modules);
    const userId = await seedUser(t);
    await seedCatalog(t);

    // Browse first, so the query has run against the same tables the purchase
    // will read.
    await t.query(api.vtuCatalog.listCatalog, {});

    const bought = await purchase(t, userId, { requestId: "req_browse_then_buy" });
    expect(bought.pointsDebited).toBe(EXPECTED_POINTS);
    expect(await balanceOf(t, userId)).toBe(START_BALANCE - EXPECTED_POINTS);

    // The route was resolved inside the purchase, and snapshotted on the row —
    // never re-read by the browser, and never re-derived by the catalog query.
    const tx = await t.run(async (ctx) => ctx.db.get(bought.transactionId));
    expect(tx?.routedProvider).toBe("pairgate");
    expect(tx?.routedProviderProductCode).toBe(SERVICE_CODE);
    expect(tx?.nairaPrice).toBe(1000);
    expect(tx?.ngnPerPoint).toBe(RATE);
  });
});
