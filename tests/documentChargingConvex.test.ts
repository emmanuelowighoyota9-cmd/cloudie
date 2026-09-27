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

const CREATE_COST = 40; // DEFAULT_RENDER_COST in docTemplates.ts

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
      pointsBalance: opts.balance,
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

const balanceOf = (t: Harness, userId: any) =>
  t.run(async (ctx) => (await ctx.db.get(userId))?.pointsBalance ?? 0);

const ledgerFor = (t: Harness, userId: any) =>
  t.run(async (ctx) =>
    ctx.db
      .query("pointLedger")
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
    const { userId, templateId } = await seed(t, { balance: 500 });

    const result = await as(t, userId, (tt) =>
      tt.mutation(api.docTemplates.createDocument, {
        templateId,
        values: { fullName: "Ada Lovelace" },
      }),
    );

    expect(result.charged).toBe(CREATE_COST);
    expect(await balanceOf(t, userId)).toBe(500 - CREATE_COST);

    const ledger = await ledgerFor(t, userId);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].amount).toBe(-CREATE_COST);
    expect(ledger[0].balanceAfter).toBe(500 - CREATE_COST);
    // Namespaced away from render keys so it can never be mistaken for one.
    expect(ledger[0].idempotencyKey).toBe(`docrender:create:${result.documentId}`);
  });

  test("persists the creation marker and the per-render price", async () => {
    const t = convexTest(schema, modules);
    const { userId, templateId } = await seed(t, { balance: 500 });

    const result = await as(t, userId, (tt) =>
      tt.mutation(api.docTemplates.createDocument, {
        templateId,
        values: { fullName: "Ada Lovelace" },
      }),
    );

    const doc = await docOf(t, result.documentId);
    expect(doc!.status).toBe("draft");
    expect(doc!.pointsCost).toBe(CREATE_COST);
    expect(doc!.renderPrice).toBe(CREATE_COST);
    // This marker is what stops finalizeDocument charging a second time.
    expect((doc!.metadata as any).pointsChargedAtCreation).toBe(CREATE_COST);
  });

  test("an unaffordable creation leaves no orphan draft and no debit", async () => {
    const t = convexTest(schema, modules);
    const { userId, templateId } = await seed(t, { balance: CREATE_COST - 1 });

    await expect(
      as(t, userId, (tt) =>
        tt.mutation(api.docTemplates.createDocument, {
          templateId,
          values: { fullName: "Ada Lovelace" },
        }),
      ),
    ).rejects.toThrow(/Insufficient points/);

    // The balance check runs before the insert, so a rejected request must not
    // leave a document behind — and must not have moved any points.
    expect(await balanceOf(t, userId)).toBe(CREATE_COST - 1);
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
      balance: 500,
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
    expect(await balanceOf(t, userId)).toBe(500 - CREATE_COST);
    expect(await ledgerFor(t, userId)).toHaveLength(1);

    const doc = await docOf(t, documentId);
    expect(doc!.status).toBe("completed");
    expect(doc!.pointsCost).toBe(CREATE_COST);
    // Still quoted at the creation price, not the lifetime total.
    expect(doc!.renderPrice).toBe(CREATE_COST);
    expect((doc!.metadata as any).lastAttemptId).toBe(attemptId);
  });

  test("a re-render with a new attemptId is billed as new work", async () => {
    const { t, userId, documentId } = await created({ balance: 500, attemptId: "attempt-1" });
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

    expect(outcome.charged).toBe(CREATE_COST);
    expect(await balanceOf(t, userId)).toBe(500 - CREATE_COST * 2);
    expect(await ledgerFor(t, userId)).toHaveLength(2);

    const doc = await docOf(t, documentId);
    // pointsCost accumulates across renders...
    expect(doc!.pointsCost).toBe(CREATE_COST * 2);
    // ...but the displayed price stays the price of one render.
    expect(doc!.renderPrice).toBe(CREATE_COST);
  });

  test("retrying the same attemptId never charges twice", async () => {
    const { t, userId, documentId, attemptId } = await created({
      balance: 500,
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
    expect(await balanceOf(t, userId)).toBe(500 - CREATE_COST);
    expect(await ledgerFor(t, userId)).toHaveLength(1);
  });

  test("a re-render the customer cannot afford changes nothing", async () => {
    // Enough for creation only.
    const t = convexTest(schema, modules);
    const { userId, templateId } = await seed(t, { balance: CREATE_COST });
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
    ).rejects.toThrow(/Insufficient points/);

    // The failed charge must not have half-applied: the document stays on its
    // previous completed render and the balance is untouched.
    expect(await balanceOf(t, userId)).toBe(0);
    const doc = await docOf(t, result.documentId);
    expect(doc!.status).toBe("completed");
    expect((doc!.metadata as any).lastAttemptId).toBe("attempt-1");
    expect(doc!.pointsCost).toBe(CREATE_COST);
  });
});

// ─── The displayed price is always a real, already-paid price ───────────────

describe("renderPrice stays a price, not a running total", () => {
  test("renderPrice never exceeds the total actually charged", async () => {
    const t = convexTest(schema, modules);
    const { userId, templateId } = await seed(t, { balance: 1000 });

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
    expect(doc!.pointsCost).toBe(CREATE_COST * 3);
    expect(await balanceOf(t, userId)).toBe(1000 - CREATE_COST * 3);
    // ...but the badge still quotes one render.
    expect(doc!.renderPrice).toBe(CREATE_COST);
    expect(doc!.renderPrice!).toBeLessThanOrEqual(doc!.pointsCost!);
  });
});
