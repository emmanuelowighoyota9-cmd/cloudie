import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../src/convex/schema";
import { api, internal } from "../src/convex/_generated/api";

/**
 * End-to-end tests for the document points-charging rules, executed against a
 * real Convex backend implementation (`convex-test`) rather than a mirror of
 * the logic.
 *
 * The pure-function tests in `documentCharging.test.ts` pin the arithmetic. They
 * cannot catch the things that actually broke in practice: a debit that never
 * lands, a ledger row whose key does not round-trip, a `metadata` marker that
 * does not survive the write, or a mutation that charges while its own
 * transaction rolls back. Those only show up when the handlers really run
 * against a database, so these tests seed a real one and assert on balances,
 * ledger rows, and the persisted document.
 *
 * `convex-test` is normally driven by Vitest, which supplies the module map via
 * `import.meta.glob`. Bun has no `import.meta.glob`, so the map is passed
 * explicitly as the second argument — the same mechanism, minus the Vite magic.
 */

const modules = {
  "src/convex/_generated/api.js": () => import("../src/convex/_generated/api.js"),
  "src/convex/_generated/server.js": () => import("../src/convex/_generated/server.js"),
  "src/convex/schema.ts": () => import("../src/convex/schema"),
  "src/convex/docTemplates.ts": () => import("../src/convex/docTemplates"),
  "src/convex/adminApi.ts": () => import("../src/convex/adminApi"),
  "src/convex/pricing.ts": () => import("../src/convex/pricing"),
  "src/convex/points.ts": () => import("../src/convex/points"),
  "src/convex/storage.ts": () => import("../src/convex/storage"),
};

const CREATE_COST = 40; // DEFAULT_RENDER_COST in docTemplates.ts, in points
/** NGN per point at the platform rate these tests leave in place. */
const RATE = 15;
/** What a document actually costs: the wallet is debited in NGN. */
const CREATE_COST_NGN = CREATE_COST * RATE;

/** A minimal but valid template schema: one required text field. */
const SCHEMA = {
  fields: [
    { id: "fullName", label: "Full name", type: "text", required: true, maxLength: 120 },
  ],
};

type Harness = ReturnType<typeof convexTest>;

async function seed(harness: Harness, opts: { balance: number; requiredCredits?: number }) {
  const now = Date.now();
  const userId = await harness.run(async (ctx) =>
    ctx.db.insert("users", {
      name: "Ada",
      email: "ada@example.com",
      walletBalanceNgn: opts.balance,
      createdAt: now,
    }),
  );
  const templateId = await harness.run(async (ctx) =>
    ctx.db.insert("documentTemplates", {
      documentType: "general",
      name: "Test certificate",
      slug: `test-cert-${userId}`,
      renderer: "svg",
      status: "active",
      visibility: "public",
      sensitivity: "standard",
      requiredCredits: opts.requiredCredits ?? CREATE_COST,
      supportedFormats: ["png", "pdf"],
      schema: SCHEMA,
      configuration: { pages: [] },
      createdById: userId,
      isActive: true,
      currentVersion: 1,
      createdAt: now,
      updatedAt: now,
    }),
  );
  await harness.run(async (ctx) =>
    ctx.db.insert("documentTemplateVersions", {
      templateId,
      version: 1,
      title: "Test certificate",
      blocks: {
        schema: SCHEMA,
        configuration: { pages: [] },
        sensitivity: "standard",
        requiredCredits: opts.requiredCredits ?? CREATE_COST,
        supportedFormats: ["png", "pdf"],
      },
      pointsCost: opts.requiredCredits ?? CREATE_COST,
      createdById: userId,
      createdAt: now,
    }),
  );
  return { userId, templateId };
}

/** The authoritative monetary balance: the NGN wallet, not the retired points field. */
const balanceOf = (t: Harness, userId: any) =>
  t.run(async (ctx) => (await ctx.db.get(userId))?.walletBalanceNgn ?? 0);

const ledgerFor = (t: Harness, userId: any) =>
  t.run(async (ctx) =>
    ctx.db
      .query("walletLedger")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .collect(),
  );

const docOf = (t: Harness, documentId: any) =>
  t.run(async (ctx) => ctx.db.get(documentId));

/**
 * Store a fake rendered PDF and return its real storage id.
 *
 * `generateUploadUrl` only hands back a URL; `finalizeDocument` wants the
 * `_storage` id the upload would have produced, so the blob is stored directly.
 */
const uploadedPdf = (t: Harness) =>
  t.run(async (ctx) =>
    ctx.storage.store(new Blob(["%PDF-1.4 fake render"], { type: "application/pdf" })),
  );

/**
 * Drive a mutation as the seeded user.
 *
 * `withIdentity` returns a new accessor carrying the same
 * `mutation`/`query` methods, so the callback receives the identity-bound
 * client. (It is deliberately not `run`, which hands back a raw ctx.)
 */
function as(t: Harness, userId: string, fn: (client: any) => Promise<any>) {
  return fn(t.withIdentity({ subject: userId }));
}

// ─── Creation charges the full render cost ──────────────────────────────────

describe("createDocument charges at creation", () => {
  test("debits the customer and records one creation ledger row", async () => {
    const t = convexTest(schema, modules);
    const { userId, templateId } = await seed(t, { balance: 500 * RATE });

    const result = await as(t, userId, (tt) =>
      tt.mutation(api.docTemplates.createDocument, {
        templateId,
        values: { fullName: "Ada Lovelace" },
      }),
    );

    expect(result.charged).toBe(CREATE_COST_NGN);
    expect(await balanceOf(t, userId)).toBe(500 * RATE - CREATE_COST_NGN);

    const ledger = await ledgerFor(t, userId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].amountNgn).toBe(-CREATE_COST_NGN);
    expect(ledger[0].balanceAfterNgn).toBe(500 * RATE - CREATE_COST_NGN);
    // Namespaced away from render keys so it can never be mistaken for one.
    expect(ledger[0].idempotencyKey).toBe(`docrender:create:${result.documentId}`);
  });

  test("persists the creation marker and the per-render price", async () => {
    const t = convexTest(schema, modules);
    const { userId, templateId } = await seed(t, { balance: 500 * RATE });

    const result = await as(t, userId, (tt) =>
      tt.mutation(api.docTemplates.createDocument, {
        templateId,
        values: { fullName: "Ada Lovelace" },
      }),
    );

    const doc = await docOf(t, result.documentId);
    expect(doc!.status).toBe("draft");
    expect(doc!.pointsCost).toBe(CREATE_COST_NGN);
    expect(doc!.renderPrice).toBe(CREATE_COST_NGN);
    // This marker is what stops finalizeDocument charging a second time.
    expect((doc!.metadata as any).pointsChargedAtCreation).toBe(CREATE_COST_NGN);
  });

  test("an unaffordable creation leaves no orphan draft and no debit", async () => {
    const t = convexTest(schema, modules);
    const { userId, templateId } = await seed(t, { balance: CREATE_COST_NGN - 1 });

    await expect(
      as(t, userId, (tt) =>
        tt.mutation(api.docTemplates.createDocument, {
          templateId,
          values: { fullName: "Ada Lovelace" },
        }),
      ),
    ).rejects.toThrow(/Insufficient NGN wallet balance/);

    // The balance check runs before the insert, so a rejected request must not
    // leave a document behind — and must not have moved any money.
    expect(await balanceOf(t, userId)).toBe(CREATE_COST_NGN - 1);
    expect(await t.run((ctx) => ctx.db.query("renderedDocuments").collect())).toHaveLength(0);
    expect(await ledgerFor(t, userId)).toHaveLength(0);
  });
});

// ─── First render is already paid for ───────────────────────────────────────

describe("finalizeDocument honours the creation charge", () => {
  /** Create a document and return the ids needed to finalize it. */
  async function created(opts: { balance: number; attemptId: string }) {
    const t = convexTest(schema, modules);
    const { userId, templateId } = await seed(t, { balance: opts.balance });
    const result = await as(t, userId, (tt) =>
      tt.mutation(api.docTemplates.createDocument, {
        templateId,
        values: { fullName: "Ada Lovelace" },
      }),
    );
    return { t, userId, documentId: result.documentId, attemptId: opts.attemptId };
  }

  test("the first render is free — it was paid for at creation", async () => {
    const { t, userId, documentId, attemptId } = await created({
      balance: 500 * RATE,
      attemptId: "attempt-1",
    });
    const storageId = await uploadedPdf(t);

    const outcome = await as(t, userId, (tt) =>
      tt.mutation(api.docTemplates.finalizeDocument, {
        documentId,
        attemptId,
        pdfStorageId: storageId,
        pageCount: 1,
        sizeBytes: 1024,
      }),
    );

    expect(outcome.charged).toBe(0);
    // Total spent stays at the creation charge — no second debit.
    expect(await balanceOf(t, userId)).toBe(500 * RATE - CREATE_COST_NGN);
    expect(await ledgerFor(t, userId)).toHaveLength(1);

    const doc = await docOf(t, documentId);
    expect(doc!.status).toBe("completed");
    expect(doc!.pointsCost).toBe(CREATE_COST_NGN);
    // Still quoted at the creation price, not the lifetime total.
    expect(doc!.renderPrice).toBe(CREATE_COST_NGN);
    expect((doc!.metadata as any).lastAttemptId).toBe(attemptId);
  });

  test("a re-render with a new attemptId is billed as new work", async () => {
    const { t, userId, documentId } = await created({ balance: 500 * RATE, attemptId: "attempt-1" });
    const first = await uploadedPdf(t);
    await as(t, userId, (tt) =>
      tt.mutation(api.docTemplates.finalizeDocument, {
        documentId,
        attemptId: "attempt-1",
        pdfStorageId: first,
        pageCount: 1,
        sizeBytes: 1024,
      }),
    );

    // A genuinely new render attempt, after an edit.
    const second = await uploadedPdf(t);
    const outcome = await as(t, userId, (tt) =>
      tt.mutation(api.docTemplates.finalizeDocument, {
        documentId,
        attemptId: "attempt-2",
        pdfStorageId: second,
        pageCount: 2,
        sizeBytes: 2048,
      }),
    );

    expect(outcome.charged).toBe(CREATE_COST_NGN);
    expect(await balanceOf(t, userId)).toBe(500 * RATE - CREATE_COST_NGN * 2);
    expect(await ledgerFor(t, userId)).toHaveLength(2);

    const doc = await docOf(t, documentId);
    // pointsCost accumulates across renders...
    expect(doc!.pointsCost).toBe(CREATE_COST_NGN * 2);
    // ...but the displayed price stays the price of one render.
    expect(doc!.renderPrice).toBe(CREATE_COST_NGN);
  });

  test("retrying the same attemptId never charges twice", async () => {
    const { t, userId, documentId, attemptId } = await created({
      balance: 500 * RATE,
      attemptId: "attempt-1",
    });
    const storageId = await uploadedPdf(t);

    const args = {
      documentId,
      attemptId,
      pdfStorageId: storageId,
      pageCount: 1,
      sizeBytes: 1024,
    };
    await as(t, userId, (tt) => tt.mutation(api.docTemplates.finalizeDocument, args));
    // A flaky network retrying the same render must be free.
    const retry = await as(t, userId, (tt) =>
      tt.mutation(api.docTemplates.finalizeDocument, args),
    );

    expect(retry.alreadyCompleted).toBe(true);
    expect(retry.charged).toBe(0);
    expect(await balanceOf(t, userId)).toBe(500 * RATE - CREATE_COST_NGN);
    expect(await ledgerFor(t, userId)).toHaveLength(1);
  });

  test("a re-render the customer cannot afford changes nothing", async () => {
    // Enough for creation only.
    const t = convexTest(schema, modules);
    const { userId, templateId } = await seed(t, { balance: CREATE_COST_NGN });
    const result = await as(t, userId, (tt) =>
      tt.mutation(api.docTemplates.createDocument, {
        templateId,
        values: { fullName: "Ada Lovelace" },
      }),
    );
    const first = await uploadedPdf(t);
    await as(t, userId, (tt) =>
      tt.mutation(api.docTemplates.finalizeDocument, {
        documentId: result.documentId,
        attemptId: "attempt-1",
        pdfStorageId: first,
        pageCount: 1,
        sizeBytes: 1024,
      }),
    );

    const second = await uploadedPdf(t);
    await expect(
      as(t, userId, (tt) =>
        tt.mutation(api.docTemplates.finalizeDocument, {
          documentId: result.documentId,
          attemptId: "attempt-2",
          pdfStorageId: second,
          pageCount: 1,
          sizeBytes: 1024,
        }),
      ),
    ).rejects.toThrow(/Insufficient NGN wallet balance/);

    // The failed charge must not have half-applied: the document stays on its
    // previous completed render and the balance is untouched.
    expect(await balanceOf(t, userId)).toBe(0);
    const doc = await docOf(t, result.documentId);
    expect(doc!.status).toBe("completed");
    expect((doc!.metadata as any).lastAttemptId).toBe("attempt-1");
    expect(doc!.pointsCost).toBe(CREATE_COST_NGN);
  });
});

// ─── The displayed price is always a real, already-paid price ───────────────

describe("renderPrice stays a price, not a running total", () => {
  test("renderPrice never exceeds the total actually charged", async () => {
    const t = convexTest(schema, modules);
    const { userId, templateId } = await seed(t, { balance: 1000 * RATE });

    const result = await as(t, userId, (tt) =>
      tt.mutation(api.docTemplates.createDocument, {
        templateId,
        values: { fullName: "Ada Lovelace" },
      }),
    );

    // Create, then render three times over.
    for (const attemptId of ["a1", "a2", "a3"]) {
      const storageId = await uploadedPdf(t);
      await as(t, userId, (tt) =>
        tt.mutation(api.docTemplates.finalizeDocument, {
          documentId: result.documentId,
          attemptId,
          pdfStorageId: storageId,
          pageCount: 1,
          sizeBytes: 1024,
        }),
      );
    }

    const doc = await docOf(t, result.documentId);
    // Three charges in total: the creation charge covers the FIRST render, and
    // the two later attempts are billed as new work.
    expect(doc!.pointsCost).toBe(CREATE_COST_NGN * 3);
    expect(await balanceOf(t, userId)).toBe(1000 * RATE - CREATE_COST_NGN * 3);
    // ...but the badge still quotes one render.
    expect(doc!.renderPrice).toBe(CREATE_COST_NGN);
    expect(doc!.renderPrice!).toBeLessThanOrEqual(doc!.pointsCost!);
  });
});

// ─── Customer-authored designs are charged per SAVE ────────────────────────

/**
 * The editor promises a charge "per save", and this is what makes that true.
 *
 * The debit was keyed on the template id, so the FIRST save consumed the key
 * and every later one — a new version, a renamed design — was read as a replay
 * by `debitWallet` and silently went unbilled. `debitWallet` refuses a repeat of
 * EITHER the idempotency key or the (reference, referenceId) pair, and both were
 * template-scoped, so both halves have to vary with the save for the charge to
 * land.
 */
describe("a customer-authored design is charged per save", () => {
  const DESIGN_COST = 25; // DEFAULT_DESIGN_COST in docTemplates.ts, in points
  const DESIGN_COST_NGN = DESIGN_COST * RATE;
  const DESIGN = {
    schema: SCHEMA,
    configuration: { renderScale: 1, pages: [{ width: 794, height: 1123, elements: [] }] },
  };

  const createDesign = (t: Harness, userId: any, name = "My certificate") =>
    as(t, userId, (tt) =>
      tt.mutation(api.docTemplates.createMyTemplate, {
        name,
        documentType: "general",
        ...DESIGN,
      }),
    );

  const saveDesign = (t: Harness, userId: any, templateId: any, name?: string) =>
    as(t, userId, (tt) =>
      tt.mutation(api.docTemplates.updateMyTemplate, {
        templateId,
        ...(name ? { name } : {}),
        documentType: "general",
        ...DESIGN,
      }),
    );

  test("creating a design charges the design price, keyed to the first version", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t, { balance: 500 * RATE });

    const result: any = await createDesign(t, userId);

    expect(result.charged).toBe(DESIGN_COST_NGN);
    expect(await balanceOf(t, userId)).toBe(500 * RATE - DESIGN_COST_NGN);

    const ledger = await ledgerFor(t, userId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].amountNgn).toBe(-DESIGN_COST_NGN);
    expect(ledger[0].idempotencyKey).toBe(`document-design:${result.templateId}:v1`);
    // The reference pair is save-scoped too, and not the bare template id.
    expect(ledger[0].referenceId).toBe(`${result.templateId}:v1`);
  });

  test("a SECOND save is charged again — one charge per save, not one per design", async () => {
    const t = convexTest(schema, modules);
    const { userId } = await seed(t, { balance: 500 * RATE });

    const created: any = await createDesign(t, userId);
    const second: any = await saveDesign(t, userId, created.templateId, "My certificate v2");
    const third: any = await saveDesign(t, userId, created.templateId, "My certificate v3");

    expect(second.charged).toBe(DESIGN_COST_NGN);
    expect(third.charged).toBe(DESIGN_COST_NGN);
    // Three saves, three charges. Before the fix this was ONE.
    expect(await balanceOf(t, userId)).toBe(500 * RATE - DESIGN_COST_NGN * 3);

    const ledger = await ledgerFor(t, userId);
    expect(ledger).toHaveLength(3);
    // Distinct keys AND distinct references — either one repeated would have
    // been enough for `debitWallet` to treat the save as a replay.
    expect(new Set(ledger.map((r) => r.idempotencyKey)).size).toBe(3);
    expect(new Set(ledger.map((r) => r.referenceId)).size).toBe(3);
    expect([...ledger.map((r) => r.referenceId)].sort()).toEqual(
      [
        `${created.templateId}:v1`,
        `${created.templateId}:v2`,
        `${created.templateId}:v3`,
      ].sort(),
    );
  });

  test("a design save the customer cannot afford leaves no new version", async () => {
    // Enough for the creation charge only.
    const t = convexTest(schema, modules);
    const { userId } = await seed(t, { balance: DESIGN_COST_NGN });

    const created: any = await createDesign(t, userId);
    await expect(saveDesign(t, userId, created.templateId, "Renamed")).rejects.toThrow(
      /Insufficient NGN wallet balance/,
    );

    expect(await balanceOf(t, userId)).toBe(0);
    expect(await ledgerFor(t, userId)).toHaveLength(1);
    // The charge runs inside the same transaction as the version insert, so a
    // refused save must not leave a version the customer did not pay for.
    const versions = await t.run(async (ctx) =>
      ctx.db
        .query("documentTemplateVersions")
        .withIndex("by_template", (q) => q.eq("templateId", created.templateId))
        .collect(),
    );
    expect(versions).toHaveLength(1);
  });
});
