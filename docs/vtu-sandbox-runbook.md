# AidaPay live verification runbook

The harness proves our side of the contract: routing, the ledger, the budget,
the signature *check*, the status mapping, the reconciliation sweep. Every one
of those tests runs against a stub we wrote, so every one of them can pass
while AidaPay does something else entirely.

This is the list of things only a live call can prove. Work top to bottom;
each step names what to observe, where to observe it, and what a failure
looks like. Budget five minutes if it goes well.

**Nothing here writes to `aidapay.ng` production.** Row must be `sandbox`, or a
limited-live account AidaPay issues for this purpose.

---

## 0. Prerequisites

- [ ] Sandbox API token and account PIN entered in **Keys** (never pasted into
      a chat, a file, or a provider row by hand from a transcript).
- [ ] `/admin/vtu/providers` → AidaPay row: `status: sandbox`, `authScheme
      bearer`, `authHeader Authorization`, `callbackSignatureHeader Signature`,
      `healthPath /account`, token sealed as **both** API key and webhook
      secret, PIN sealed separately.
- [ ] `/admin/vtu/catalog` → an MTN airtime product with a routing row whose
      provider is AidaPay and whose priority beats Pairgate's, so the test
      purchase actually lands on it. **Revert the priority afterwards** — until
      then Pairgate remains the default for every real customer.
- [ ] A real test recipient number that can receive airtime and be checked.

---

## 1. `GET /account` — auth and health

**Observe:** test-connection on the provider row returns `ok` with a latency.

**Proves:** the base URL, `healthPath`, and bearer composition are right, and
the token is the one AidaPay accepts. The harness stubs `fetch`, so it proves
nothing about any of this.

**Failure modes worth recording separately:** 401 (token or auth scheme wrong),
404 (path wrong), 200 with an unexpected body (shape assumptions wrong — see §4).

---

## 2. Purchase → does a webhook actually fire?

**Observe, in this order:**

1. The purchase returns and `/admin/transactions` shows the row moving
   `pending → processing → confirmed`, with `routedProvider: "aidapay"`.
2. **Whether a webhook arrives at all**, and how long after the purchase.
   Watch the Convex function logs for `POST /api/webhooks/vtu`.
3. The `ref` AidaPay echoes is our Convex transaction id (the adapter sends
   `ref: attemptId`).

**Proves:** that AidaPay calls us. Every settlement path in slice 5 assumes the
webhook is the normal case and reconciliation is the fallback; if AidaPay does
not fire a webhook for a completed purchase, reconciliation silently becomes
the *primary* path and the whole latency story changes.

**Failure modes:**
- No webhook within a minute → record it as a finding before assuming a
  delivery problem; it may be a callback-URL configuration on AidaPay's side.
- Webhook arrives but is refused → see §3; that is a signature problem, not a
  delivery problem.

---

## 3. The signature — header name, casing, key, encoding

The harness computes the expected HMAC itself from the same key it then
verifies against, so it cannot detect a mismatch in *any* of these four:

| # | Observation | Where |
|---|---|---|
| 3a | Header name as delivered — `Signature`, `signature`, `X-Signature`, something else | function logs, request headers |
| 3b | Whether it arrived at all under a name containing "signature" (the route's precondition) | same |
| 3c | Whether the signature **verifies against the access token** (we seal the token twice and use it as the HMAC key) | webhook result: applied vs 401 |
| 3d | Encoding: hex or base64, and whether prefixed `sha256=` (the adapter strips that prefix and accepts both) | compare the raw header to a locally computed HMAC |

**Pass:** the webhook reaches `applyCallback` and settles the row with
`source: "webhook"`.

**Fail:** a 401 with `reason: signature_mismatch` while 3a–3d all look right
means the key material or the signed payload differs from our assumption —
compute the HMAC locally over the *exact* raw body and compare before touching
any code.

Also record: **what AidaPay does when we answer non-2xx** (retry interval, how
many times). It is what tells us whether a 422 from the broken-adapter branch
is the right response.

---

## 4. Payload shape and status vocabulary

**Observe:** the actual JSON, and specifically

- is the transaction nested under `data` or top-level?
- which field carries the terminal status, and its exact spelling?
- which field carries the charge: `cost`, `amount`, or `price`?

**Proves:** the adapter's assumptions (`dataOf`, `referenceOf`, the cost
fields) against reality rather than against documentation.

**The critical case:** a status word outside
`Completed / Processing / Pending / Refund / Cancelled`. Anything unrecognised
maps to `unknown` — which is safe, but it means the row never settles from a
webhook and always escalates. If AidaPay has a sixth word, this is where we
learn it, and it is a vocabulary addition rather than a bug.

---

## 5. A real failure → does a Refund land in the ledger?

**Observe:** force a purchase AidaPay will reject (invalid recipient for the
chosen network is the usual lever; confirm the sandbox accepts this as a
failure rather than hanging it in `Processing`), then:

1. the verdict AidaPay returns, and whether it arrives as a **webhook**, a
   **`/transaction` poll**, or neither;
2. `vtuTransactions.status` reaching `reversed` with
   `reversalReason: provider_failed` (webhook) or `reconciliation` (sweep);
3. **exactly one** `vtu_refund` ledger row, `pointsBalance` back to the start,
   and the idempotency claim released;
4. `source` naming the path that settled it.

**Proves:** the failure vocabulary (`Refund` vs `Cancelled` → which reversal
reason) and that a *real* failure produces exactly one credit. The harness
asserts this against a stub that returns the verdict we chose.

**Failure mode that matters:** a failure that only ever arrives as an HTTP
error on the purchase call, with no webhook and no terminal status on
`/transaction` — then nothing settles it except the sweep hitting its attempt
limit, and every failed purchase would land in `/admin/vtu/unresolved` for a
human.

---

## 6. Reconciliation against the real `/transaction` endpoint

**Observe:** any row left in `processing` or `unknown` (from §2's timing, a
timeout, or a failure that AidaPay has not yet resolved), then over the next
sweeps:

1. `GET /transaction/{ref}` returns a body the adapter classifies — record the
   shape and the status word;
2. a terminal status appears **within the reconcile window**: 5-minute sweep ×
   `maxReconcileAttempts` 5 ≈ 25 minutes. Later than that and the row escalates
   for a provider that was merely slow, which is a default worth changing;
3. the per-provider budget: with `rateLimitPerMinute: 0.6` each sweep must
   dispatch **at most 3 calls per 5 minutes** — read
   `vtuProviders.reconcileCallsInWindow`, `lastSweepAttempted`,
   `lastSweepResolved`, `lastSweepStillPending` (dashboard only; not surfaced in
   the admin UI yet);
4. what AidaPay returns when the budget *is* exceeded — 429 maps to `unknown`
   and costs an attempt, which is survivable; 403 that classifies as `failed`
   would **refund a delivered top-up**, so record the exact status code and body.

**This is the one item that may not fit the session**: it needs a row that is
genuinely non-terminal. If §2 and §5 both settle immediately, say so and
repeat this section deliberately rather than marking it passed.

---

## 7. What only the live run can say

- **Recipient actually receives the airtime.** No assertion anywhere in 343
  tests proves delivery — this is the product's entire purpose.
- **Real latency from purchase to webhook**, which is what
  `reconcileAfterMs` (processing 60s / unknown 30s) should be calibrated
  against rather than guessed.
- **Whether the sandbox's failure behaviours match production.** A sandbox that
  always succeeds teaches nothing about §5.

---

## Sign-off

Slice 4 stays **"adapter implemented, harness-verified, pending live
verification"** until §1–§5 pass and §6 has either passed or been explicitly
deferred with a reason. When it changes, update both:

- `docs/vtu-slice-5.md` → *Slice 4 status*
- `src/convex/providers/aidapay.ts` → file header, which points at that section

The two are named in each other deliberately so neither can drift alone.
