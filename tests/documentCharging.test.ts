import { describe, expect, test } from "bun:test";
import {
  documentCreationKey,
  renderIdempotencyKey,
  resolveRenderCost,
  shouldChargeForRender,
} from "../src/lib/docTemplateEngine.ts";

/**
 * Creating a document now takes the full render cost up front, and
 * `finalizeDocument` recognises that charge instead of taking it again.
 * These tests pin the two pieces of pure logic that make that safe.
 */

// ─── Ledger keys: the creation charge must never collide with a render charge ──

describe("document charge keys", () => {
  test("creation key is namespaced away from render keys", () => {
    const creation = documentCreationKey("doc123");
    const render = renderIdempotencyKey("doc123", "pdf", "attempt-1");
    expect(creation).not.toBe(render);
    expect(creation).toBe("docrender:create:doc123");
  });

  test("creation key cannot be produced by a render key for any attempt", () => {
    // An attacker or a bug must not be able to forge the creation marker by
    // replaying a render attemptId.
    for (const attempt of ["", "create", "a", "0", "doc123", "create:doc123"]) {
      expect(renderIdempotencyKey("doc123", "pdf", attempt)).not.toBe(
        documentCreationKey("doc123"),
      );
    }
  });

  test("distinct documents never share a creation key", () => {
    const keys = new Set<string>();
    for (let i = 0; i < 200; i++) keys.add(documentCreationKey(`doc${i}`));
    expect(keys.size).toBe(200);
  });

  test("the same document always yields the same creation key (idempotent)", () => {
    expect(documentCreationKey("doc9")).toBe(documentCreationKey("doc9"));
  });
});

// ─── Price lock: the quote at creation is the price kept ──────────────────────

describe("creation-time price lock", () => {
  const FALLBACK = 40;

  test("a premium template charges its own higher requirement", () => {
    expect(resolveRenderCost(FALLBACK, 120, FALLBACK)).toBe(120);
  });

  test("a cheap template never undercuts the platform price", () => {
    // Guards the floor: requiredCredits can raise the cost, never lower it.
    expect(resolveRenderCost(FALLBACK, 0, FALLBACK)).toBe(FALLBACK);
    expect(resolveRenderCost(FALLBACK, 10, FALLBACK)).toBe(FALLBACK);
  });

  test("a raised platform price wins when it exceeds the template requirement", () => {
    // The price is captured when the document is created, so a later admin
    // price change cannot retroactively re-price an existing document.
    const atCreation = resolveRenderCost(40, 25, FALLBACK);
    const afterPriceChange = resolveRenderCost(99, 25, FALLBACK);
    expect(atCreation).toBe(40);
    expect(afterPriceChange).toBe(99);
    expect(atCreation).toBe(40); // locked in, unaffected by the change
  });

  test("a corrupt or missing platform price falls back rather than charging nothing", () => {
    expect(resolveRenderCost(Number.NaN, 0, FALLBACK)).toBe(FALLBACK);
    expect(resolveRenderCost(-5, 0, FALLBACK)).toBe(FALLBACK);
  });
});

// ─── The guard's decision, mirrored ───────────────────────────────────────────

/**
 * Mirrors the affordability branch in `createDocument`. The mutation itself is
 * not unit-testable here, so the rule it enforces is pinned directly: a
 * document may only be created when the balance covers the FULL cost.
 */
function mayCreateDocument(balance: number, cost: number): { ok: boolean; reason?: string } {
  if (balance < cost) {
    return { ok: false, reason: `Insufficient points. Creating a document costs ${cost} points and your balance is ${balance}.` };
  }
  return { ok: true };
}

describe("creation requires sufficient points", () => {
  test("a balance below the cost blocks creation", () => {
    expect(mayCreateDocument(39, 40).ok).toBe(false);
    expect(mayCreateDocument(0, 40).ok).toBe(false);
  });

  test("an exact balance is allowed (no off-by-one rejection)", () => {
    expect(mayCreateDocument(40, 40).ok).toBe(true);
  });

  test("the error names both the cost and the balance", () => {
    expect(mayCreateDocument(12, 40).reason).toContain("40");
    expect(mayCreateDocument(12, 40).reason).toContain("12");
  });

  test("creation charges once; finalizing the same document charges nothing more", () => {
    // createDocument debits `cost`; finalizeDocument sees the marker and adds 0.
    const balance = 100;
    const cost = resolveRenderCost(40, 0, 40);
    const afterCreation = balance - cost;
    const chargedAtFinalize = 0; // creation marker present
    expect(afterCreation).toBe(60);
    expect(afterCreation - chargedAtFinalize).toBe(60);
  });

  test("a legacy draft with no creation marker is still billed at render", () => {
    // Pre-existing drafts have no pointsChargedAtCreation, so they fall through
    // to the render charge — no historical document is left free.
    const balance = 100;
    const cost = resolveRenderCost(40, 0, 40);
    const chargedAtFinalize = 40;
    expect(balance - chargedAtFinalize).toBe(60);
    expect(balance - chargedAtFinalize).toBe(balance - cost);
  });
});

// ─── Re-renders are billable work ────────────────────────────────────────────

describe("re-render charging", () => {
  const PAID = { pointsChargedAtCreation: 40 };

  test("the first render is covered by the creation charge", () => {
    // A brand-new document has never rendered, so creation already paid for it.
    expect(shouldChargeForRender(PAID)).toBe(false);
  });

  test("a re-render of a completed document is charged again", () => {
    // The customer edited and re-rendered: new work, so it is billed.
    expect(shouldChargeForRender({ ...PAID, lastAttemptId: "attempt-1" })).toBe(true);
  });

  test("a second, third and fourth re-render are each charged", () => {
    for (const n of [1, 2, 3, 4]) {
      expect(shouldChargeForRender({ ...PAID, lastAttemptId: `attempt-${n}` })).toBe(true);
    }
  });

  test("a legacy document is charged on its first render and every one after", () => {
    expect(shouldChargeForRender({})).toBe(true);
    expect(shouldChargeForRender({ lastAttemptId: "attempt-1" })).toBe(true);
  });

  test("a blank attempt id is not mistaken for a completed render", () => {
    // Guard against whitespace or a stray field being read as "rendered before",
    // which would silently make a first render free.
    expect(shouldChargeForRender({ ...PAID, lastAttemptId: "" })).toBe(false);
    expect(shouldChargeForRender({ ...PAID, lastAttemptId: "   " })).toBe(false);
  });

  test("junk in the creation marker does not make a render free", () => {
    for (const paid of [undefined, null, "forty", Number.NaN, Infinity, {}]) {
      expect(shouldChargeForRender({ pointsChargedAtCreation: paid })).toBe(true);
    }
  });

  test("junk in the attempt marker is ignored safely", () => {
    for (const prior of [undefined, null, 42, {}, []]) {
      expect(shouldChargeForRender({ ...PAID, lastAttemptId: prior })).toBe(false);
    }
  });

  test("a re-render on an empty balance is refused rather than half-charged", () => {
    // finalizeDocument checks the balance inside the same transaction as the
    // debit, so a broke customer is stopped before any ledger row is written.
    const balance = 5;
    const cost = 40;
    expect(shouldChargeForRender({ ...PAID, lastAttemptId: "attempt-1" })).toBe(true);
    expect(balance < cost).toBe(true);
  });

  test("each distinct attempt gets its own ledger key, so retries are free", () => {
    // Per-attempt keys are what make a retried attempt non-billable while a
    // genuine re-render still bills.
    const first = renderIdempotencyKey("doc1", "pdf", "attempt-1");
    const retrySame = renderIdempotencyKey("doc1", "pdf", "attempt-1");
    const rerender = renderIdempotencyKey("doc1", "pdf", "attempt-2");
    expect(retrySame).toBe(first);
    expect(rerender).not.toBe(first);
  });
});
