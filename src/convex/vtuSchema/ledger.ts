/**
 * The VTU money log: transactions and their idempotency claims.
 *
 * These two tables are together because they are the same concern — "what
 * happened to this purchase, and is its key still held" — and separating them
 * would put the two halves of every reconciliation in different files.
 *
 * They are deliberately separate from `pointLedger`, which lives in
 * `schema.ts` and is shared with the document engine. The ledger records
 * money; these record the provider-facing lifecycle a ledger row has no
 * business carrying.
 */

import { v } from "convex/values";
import { defineTable } from "convex/server";
import {
  vtuDeliveryValidator,
  vtuReversalReasonValidator,
  vtuTransactionStatusValidator,
  vtuUnresolvedReasonValidator,
} from "./types";

export const vtuLedgerTables = {
  // The transaction log is deliberately SEPARATE from `pointLedger`. The
  // ledger records money only; this table records the provider-facing
  // lifecycle (customer phone/meter, provider reference, raw payloads,
  // status) that a ledger row has no business carrying.
  vtuTransactions: defineTable({
    userId: v.id("users"),
    /** Client-generated. The idempotency key derives from this and is NEVER
     *  namespaced by provider — a retry must dedupe across providers too. */
    clientRequestId: v.string(),
    /** e.g. "airtime.mtn.1000". Resolves the catalog cell and any price
     *  override, so the price can never be chosen by the client. */
    serviceCode: v.string(),
    /**
     * The ROUTE, snapshotted at purchase time. Write-once: set by
     * `beginPurchase` in the same patch that inserts the row, and never
     * updated afterwards.
     *
     * These three exist because the routing table is MUTABLE while a
     * transaction is in flight. An operator who re-points "airtime-mtn"
     * from Pairgate to AidaPay between dispatch and settlement must not
     * change where an already-dispatched purchase settles, so the webhook
     * handler reads the provider off THIS row and never re-routes.
     *
     * NULL on every pre-slice-3 row, and deliberately so. Backfilling would
     * mean running Pairgate adapter logic inside a slice-3 migration, which
     * couples the migration to the adapter — exactly the boundary this
     * architecture exists to keep clean. Read these through
     * `effectiveProvider` in `vtuServiceRouting.ts`, which treats a null as
     * "routed implicitly to pairgate" and is the only place that knows it.
     */
    routedProvider: v.optional(v.string()),
    routedProviderProductCode: v.optional(v.string()),
    routedProviderPackageCode: v.optional(v.string()),
    /** Matches `vtuProviders.name`, i.e. `adapter.name`. Kept as the
     *  denormalised route for the slice-1/2 code paths that read it. */
    provider: v.string(),
    status: vtuTransactionStatusValidator,
    /** Destination, stored MASKED — phone numbers are personal data. */
    customerIdentifier: v.string(),
    network: v.optional(v.string()),
    amountNgn: v.optional(v.number()),
    /**
     * What the provider delivered, when the CUSTOMER needs it: a prepaid meter
     * token and its units, a serial, a PIN.
     *
     * Written by whichever path carries the value — the dispatch response, a
     * webhook, or a reconciliation poll — and never overwritten with nothing,
     * so a later status update cannot erase the token an earlier one supplied.
     */
    delivery: v.optional(vtuDeliveryValidator),

    // ── Rate snapshot, frozen at debit time ──────────────────────
    // These make a historical transaction auditable after the rate moves.
    // Without them you cannot reconstruct what the customer was actually
    // charged, and a reversal would credit a different number of points
    // than were taken.
    nairaPrice: v.number(),
    ngnPerPoint: v.number(),
    pointsDebited: v.number(),

    providerReference: v.optional(v.string()),
    /** "vtu:purchase:<clientRequestId>" — copied here so a refund can find
     *  the claim to release without re-deriving it. */
    idempotencyKey: v.string(),
    debitLedgerId: v.optional(v.id("pointLedger")),
    reversalLedgerId: v.optional(v.id("pointLedger")),
    failureCode: v.optional(v.string()),
    failureReason: v.optional(v.string()),
    /**
     * Required whenever `status` is `reversed`. Optional in the schema only
     * because Convex cannot express a cross-field constraint; the mutation
     * that writes the transition REQUIRES it, so a `reversed` row with no
     * reason cannot be created.
     */
    reversalReason: v.optional(vtuReversalReasonValidator),
    /**
     * Which path wrote the last transition.
     *
     * One of `dispatch | webhook | reconciliation | admin`. A free string
     * rather than an enum, so a new writer needs no migration.
     *
     * `dispatch` supersedes the historical `provider_response` spelling: rows
     * written before slice 5 still carry the old value, and they are left
     * alone. Nothing filters on this field, so the two spellings coexist
     * without a backfill — and a backfill would rewrite an audit trail to say
     * something it did not say at the time.
     */
    source: v.optional(v.string()),
    /** Sanitized payloads. Secrets stripped on write by sanitizeForLog. */
    rawRequest: v.optional(v.any()),
    rawResponse: v.optional(v.any()),
    resolvedAt: v.optional(v.number()),
    reversedAt: v.optional(v.number()),

    // ── Reconciliation bookkeeping ─────────────────────────────────

    /**
     * How many times the sweep has polled the provider about this row.
     *
     * Counted so `maxReconcileAttempts` can be enforced, and incremented
     * BEFORE the verdict is applied so a poll whose result is `unknown` still
     * counts — otherwise a transaction the provider never answers would be
     * polled forever without ever reaching the escalation threshold.
     */
    reconcileAttempts: v.optional(v.number()),
    lastReconcileAt: v.optional(v.number()),
    /**
     * Why the sweep gave up. Set only alongside `status: "unresolved"`.
     *
     * `never_dispatched` is here for a row found in `pending` past its
     * dispatch window: no HTTP call was ever made, so the money is provably
     * refundable, but the cause is a defect in our own dispatch path and is
     * surfaced for a human rather than silently cleaned up.
     */
    unresolvedReason: v.optional(vtuUnresolvedReasonValidator),

    // ── Receipt pointer ────────────────────────────────────────────

    /**
     * The receipt document the customer should be shown RIGHT NOW, or absent
     * when no receipt has been asked for yet.
     *
     * CURRENT AUTHORITATIVE, not one-per-transaction, and the difference is the
     * whole point of the pair below. A receipt is generated lazily, on the first
     * "View receipt" click, and a generated document is IMMUTABLE — so when the
     * transaction is later reversed, the pre-reversal receipt cannot be edited
     * to say so. It is superseded instead: `vtu-receipt-amended` is generated as
     * a SECOND document and this pointer MOVES to it. The original stays in
     * storage with its own share link, still readable and still a true statement
     * about the moment it was issued, while every future click follows the
     * pointer to the document that is currently true.
     *
     * An append-only history of receipts per transaction was the alternative and
     * was rejected: it would need a second table, an ordering rule, and a
     * "which one is current" question asked at every read — all to answer a
     * question the customer does not have, which is "what does my receipt say
     * now". Reading a superseded receipt stays possible through the document's
     * own share link and through `receiptTemplateKey`, which records WHICH
     * template produced what this pointer currently names.
     */
    receiptDocumentId: v.optional(v.id("renderedDocuments")),
    /**
     * The template that produced `receiptDocumentId` — `"vtu-receipt"` or
     * `"vtu-receipt-amended"`.
     *
     * Stored beside the id rather than derived from the document row, because
     * the two answer different questions: the id says WHERE the receipt is, this
     * says WHICH KIND it is. A read that needs "is this receipt still the current
     * kind" must not have to load a second table to find out, and a template
     * that is later renamed or re-seeded cannot make a historical pointer lie
     * about what was issued.
     */
    receiptTemplateKey: v.optional(v.string()),

    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId", "createdAt"])
    .index("by_clientRequestId", ["clientRequestId"])
    .index("by_provider_reference", ["providerReference"])
    .index("by_status", ["status", "createdAt"])
    // The sweep's index. Staleness is measured on `updatedAt`, not
    // `createdAt`: a row that went pending -> processing at T+30s must not be
    // judged stale by when it was created. Cannot reuse `by_status`, which
    // sorts on `createdAt`, and `.filter()` on a table scan is forbidden.
    .index("by_status_updatedAt", ["status", "updatedAt"]),

  /**
   * Idempotency key claims, in their own table rather than left implicit in
   * `pointLedger`.
   *
   * The ledger answers "was this charged". This table answers "is this key
   * currently claimed". They are different questions, because a FAILED
   * transaction must RELEASE its key while its ledger rows stay forever. A
   * ledger-only key cannot be released without either mutating an append-only
   * record or lying about whether the debit happened.
   *
   * Convex indexes declare no uniqueness constraint; uniqueness is enforced
   * by check-then-insert inside a mutation, which is a serializable
   * transaction — two concurrent requests with the same key cannot both pass.
   */
  vtuIdempotency: defineTable({
    /** "vtu:purchase:<clientRequestId>" */
    key: v.string(),
    scope: v.string(),
    userId: v.id("users"),
    transactionId: v.optional(v.id("vtuTransactions")),
    createdAt: v.number(),
  })
    .index("by_key", ["key"])
    .index("by_user", ["userId", "createdAt"]),
};
