# VTU slice 6 — the customer-facing surfaces

Implemented and harness-verified against `convex-test` (377 tests). Slice 6
changes nothing about how money moves. Every query here is read-only over data
the money path already wrote, and the one write it adds — issuing a receipt —
writes a document, never a ledger row.

## What ships

**A catalog to browse at `/vtu`.** `api.vtuCatalog.listCatalog` reads each
service type through the `(serviceType, active)` index and returns client-safe
scalars only: display name, what we will ask for, the shape of the product, the
amount bounds, a price and a Buy flag. A routing-row override is the one level
that yields a single number for a whole product, so that is the only case that
shows a fixed price; everything else shows an indicative range derived from the
catalog's own bounds, or says it will price it at the point of purchase.

The boundary is the point. Server-side routing and cost resolution may produce
a *scalar* — `getAirtimeOffers` and `previewCost` have always done this, because
an override on a routing row means a grid reading its price anywhere else would
advertise one number and charge another. What may not cross the wire is a
provider name, a provider product or package code, a priority, a routing row, or
a skipped-candidate list. `tests/vtuSurfaces.test.ts` pins this by asserting the
exact key set of a product and that the serialized payload contains no
provider-shaped string; removing the leak from one product's row fails it.

**A history at `/vtu/history`.** `api.vtu.listMyHistory` is cursor-paginated on
the `by_user` index, newest first, and returns an empty finished page rather
than throwing when a session expires mid-page. `failed` has no entry in the copy
map, so a client that receives one renders nothing — the status is decided and
reversed inside one mutation and is never a resting state.

**Receipts, generated on the first click.** Two templates, `vtu-receipt` and
`vtu-receipt-amended`, seeded with the platform set. `prepareReceipt` builds the
values server-side from the transaction's own snapshot and hands the browser the
frozen schema, layout and values to render. A receipt is a record of what the
customer was told at the time, pinned at generation: `nairaPrice`,
`ngnPerPoint` and `pointsDebited` are read from the row, never re-derived, and
the status text is the same string the history row showed. Generation is
idempotent through the transaction's `receiptDocumentId` / `receiptTemplateKey`
pair, and an interrupted render resumes the same document rather than minting a
second receipt number for one purchase.

**Receipts are free.** `billable: false` on both templates, honoured at
creation, at render and in the quote. Charging for the paperwork that proves a
charge is a loop with no good answer. The control test is in the same file: the
same engine, the same code path, a billable template, still charged — so the
exemption is proven to be scoped rather than an engine that charges nothing.

**A reversal amends, it does not rewrite.** A generated document is immutable,
so a refund that lands after a receipt was issued cannot edit it. The
transaction carries the receipt that is *currently authoritative*; when a
reversal post-dates the receipt on file, the amended sibling is generated as a
second document and the pointer moves. The first receipt stays in storage with
its own share link and is still a true statement about the moment it was issued.
A receipt first requested *after* the refund is the plain template: there is
nothing to supersede, and the customer is not handed a second document
apologising for a receipt that was right.

**A receipt is not a document in the library.** Receipts carry the
`vtu_receipt` library tag, which `listMyDocuments` and `getStudioStats` both
filter on. Storage is still counted against the account — it is a physical fact
about disk — but the count above the list and the list itself cannot disagree.

## What changes for existing users

Customers can now browse the catalog instead of seeing only the airtime form,
read their VTU history with the real status and rate they were charged, and get
a receipt for any purchase on request. The purchase flow itself is unchanged:
the same routing, the same ledger, the same idempotency keys, the same
settlement, the same rate snapshot. The airtime page is preserved as a deep link
at `/vtu/airtime` and reachable from every product card on `/vtu`, so an old
bookmark, a support message or a printed receipt that says "buy airtime" still
lands somewhere that works. A transaction bought before this slice has no
`receiptDocumentId`, and asking for a receipt for it issues one from the same
snapshot it was bought at — no backfill, no migration, nothing to run.

## What did not change

Routing, the ledger, the idempotency keys, the webhook handler and its signature
verification, the settlement logic, the status vocabulary, and the rate snapshot
on `vtu_transactions` are all untouched. The catalog page and the history page
are read-only queries; `routeProduct` and `resolvePointsCost` are still called
only from the purchase mutation and from the two price queries that already
existed.

## Migration and operator action

**The migration is the two fields on `vtuTransactions`:** `receiptDocumentId`
and `receiptTemplateKey`, both optional. Existing rows simply have them absent,
and a receipt is issued on first view. No backfill.

**The operator does nothing to make this work.** Two optional, idempotent
actions improve the preview only: *Admin → VTU Providers → Run migration* and
*Admin → VTU Catalog & Routing → Run seed migration*. Until both are run, the
catalog page reads empty and the airtime form has no offers — which is the state
both surfaces were already in.

## Out of scope

Filters on history, notifications when a transaction goes `unresolved`, bulk
receipt generation, a receipts tab, a new document category, and any change to
the purchase, settlement or reconciliation paths.
