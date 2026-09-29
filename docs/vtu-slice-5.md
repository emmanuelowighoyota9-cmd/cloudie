# VTU slice 5 — reconciliation

Implemented and harness-verified against `convex-test` (343 tests). Nothing in
this slice has been exercised against a live aggregator — see the slice 4
status note at the end, which applies here too.

## What ships

**One writer of terminal status.** `settleTransaction` in `vtuInternal.ts` is
the only path that moves a transaction to `confirmed`, `reversed`, or
`unresolved`. The webhook handler, the dispatch path, the sweep, and the admin
queue all call it; nothing patches a status directly. Its first act is to check
the verdict against the transaction's *current* status, so the second caller in
a race sees the first caller's commit and no-ops. The reversal and its ledger
credit happen inside the same Convex transaction as the status write.

**The sweep.** `runReconcileSweep` (a Node action, registered as a 5-minute
cron) selects candidates from the `(status, updatedAt)` index, resolves the
provider from the transaction's `routedProvider` snapshot — it never re-routes —
and applies the provider's own staleness policy after selection, because the
index cannot see a provider row.

The per-provider rate limit is enforced *before* dispatch by an atomic
read-modify-write on the provider row (`reserveReconcileBudget`), not by
counting polls afterwards. AidaPay's published 3-per-5-minutes budget lands
exactly on the 5-minute window at its published rate:
`floor(0.6 × 5) = 3`. Reserving and then failing to dispatch under-spends,
which is the safe direction; overspending is the outcome that gets an account
blocked for every purchase, not just reconciliation.

**Escalation.** A transaction that reaches `maxReconcileAttempts` without a
verdict, cannot be asked (no reference, no adapter, no `verify()` implementation,
no credential), or was never dispatched at all becomes `unresolved` with a
reason. It is never reversed automatically: the provider has not confirmed
failure, so refunding risks paying twice.

**The queue.** `/admin/vtu/unresolved` lists each such row with why it is
there, what was sent, what came back, and two actions — *Confirm delivered* and
*Refund customer*. Both go through `settleTransaction` with `source: "admin"`
and write an audit row. Both no-op if the row was settled in the meantime.

---

## What changes for existing users

**For a transaction that completes normally: nothing.** The webhook still
arrives first and settles it through the same path as before, the ledger is
unchanged, and no code on the happy path moved. The balance a customer sees, the
points they are charged, and the transaction list they see are identical.

**For a transaction that used to get stuck:** the points are now resolved. In
the common case the sweep polls the provider the purchase was dispatched to and
settles on the answer — confirmed means the debit stands, a provider-confirmed
failure means the points come back. In the remaining cases the transaction moves
to `unresolved` and a human decides, instead of sitting in `unknown` forever
with the money in limbo.

**No new UI for non-admin users.** The purchase flow, the transaction history,
and every customer-facing error string are untouched. The only new surface is
the admin queue at `/admin/vtu/unresolved` and its sidebar entry; a customer
cannot reach it, and the queries behind it re-verify the admin role server-side.

Two operator-visible behaviours worth knowing, both deliberate:

- A **disabled** provider is still polled for transactions it already
  dispatched. Disabling stops new purchases but does not strand old ones —
  otherwise an operator pausing a provider would convert every stuck row into
  an unresolved one.
- Escalation is **loud but free**: it does not spend a rate-limited call, does
  not touch the ledger, and does not change the customer's balance. The
  decision — and the refund — belongs to a person.

---

## Slice 4 status

Slice 4 is **adapter implemented, harness-verified, pending live verification**.
The AidaPay adapter, its admin configuration (bearer / `Authorization` /
`Signature` / `/account`, token sealed twice, PIN sealed separately), and its
harness tests are in place; no request has been made to aidapay.ng production
or sandbox, and the same is true of every `verify()` call this slice makes.

`src/convex/providers/aidapay.ts` names this section from its own file header,
so the two are read together: when the live run changes this status, change
that header in the same commit.

---

## On the two items slices 2–4 deliberately left unbuilt

Both shipped here, and the reasoning recorded in
`vtu-slices-2-4.md` under *Still deliberately unbuilt* still explains why they
were deferred rather than built early. The reconciliation poller needed a rate
budget before it was safe to write — an early version would have polled freely
and taken down a provider account — and the admin reversal needed a single
writer first, since widening the transition guard for two independent callers is
exactly how a double credit gets in.
