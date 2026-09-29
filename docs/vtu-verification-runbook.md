# AidaPay live verification runbook

The harness proves our side of the contract: routing, the ledger, the budget,
the signature *check*, the status mapping, the reconciliation sweep. Every one
of those tests runs against a stub we wrote, so every one of them can pass
while AidaPay does something else entirely.

This is the list of things only a live call can prove. Work top to bottom;
each step names what to observe, where to observe it, and what a failure
looks like. Budget five minutes if it goes well.

## There is no sandbox — verification runs against production

AidaPay publishes no sandbox endpoint, so there is no safe host to point at.
Verification therefore runs against production with **the blast radius held to
the test purchase and nothing else**: Pairgate is disabled for the duration so
no real customer's airtime can route to AidaPay, the purchase is the ₦50
minimum, and Pairgate is re-enabled immediately afterwards (§8). A live
`/my_account` read is the one step that needs no such fencing, because it is a
`GET` that moves no money.

**Do this in a quiet window.** Pairgate being disabled means that between §1
and §8 this deployment cannot serve any real airtime purchase: a customer who
tries will be told the product is not available rather than being routed
somewhere unexpected. That is the correct failure, but it is a failure, and it
lasts as long as the run does.

---

## 0. Prerequisites

- [ ] Production API token, webhook secret, and account PIN entered in **Keys**
      (never pasted into a chat, a file, or a provider row by hand from a
      transcript).
- [ ] `/admin/vtu/providers` → AidaPay row: `status: active`, `authScheme
      bearer`, `authHeader Authorization`, `callbackSignatureHeader Signature`,
      `baseUrl https://aidapay.ng`, `healthPath /api/v1/my_account`, token
      sealed as **both** API key and webhook secret, PIN sealed separately.
- [ ] **`baseUrl` is the bare origin.** The adapter appends
      `/api/v1/buy` and `/api/v1/transaction/{ref}` itself, so a row whose
      `baseUrl` ends in `/api/v1` produces `.../api/v1/api/v1/buy` on every
      purchase and nothing else in the row will look wrong.
- [ ] `/admin/vtu/catalog` → an MTN airtime product with **two** routing rows:
      Pairgate at its usual priority and AidaPay at **priority 2**, so AidaPay
      would win if it were enabled. Leave Pairgate's row untouched — it is what
      §8 restores.
- [ ] The AidaPay row's webhook callback URL set to
      `https://<deployment>/api/webhooks/vtu` **with the header
      `x-vtu-provider: aidapay`**. There is one VTU webhook route and it is not
      per-provider; the provider is named by that header, and it defaults to
      `pairgate` when absent. A callback posted to
      `/api/webhooks/vtu/aidapay` returns 404, and one posted without the header
      is verified against Pairgate's secret and fails as a 401.
- [ ] A real test recipient number that can receive airtime and be checked.
- [ ] Confirmed nobody else is buying airtime on this deployment for the next
      ten minutes.

---

## 1. `GET /api/v1/my_account` — auth and health

Run this first, before any fencing: it is read-only, moves no money, and a
failure here means every later step would fail for the same reason.

**Observe:** test-connection on the provider row returns `ok` with a latency,
and the Convex function logs show `GET https://aidapay.ng/api/v1/my_account`.

**Proves:** the base URL, `healthPath`, and bearer composition are right, and
the token is the one AidaPay accepts. The harness stubs `fetch`, so it proves
nothing about any of this.

**Failure modes worth recording separately:** 401 (token or auth scheme wrong),
404 (path wrong — check for a doubled `/api/v1`), 200 with an unexpected body
(shape assumptions wrong — see §4).

**Known gap, read before trusting a pass.** The probe stops at the HTTP status:
it checks 401/403, then `response.ok`, and never parses the body. AidaPay's
envelope is `{ success, message, data }`, so a **200 with `success: false`** —
valid token, suspended or misconfigured account — is reported here as `ok`, and
the account detail is under `data.names` (plural) rather than `data.name`. Treat
this step as proof that the path and the credential header are right, and as
*no evidence at all* about the account's state. Confirm the account is live in
AidaPay's own dashboard.

---

## 2. ₦50 purchase → does a webhook actually fire?

**Fence first, in this order:**

1. `/admin/vtu/providers` → **set Pairgate to `disabled`**. Without this, the
   test purchase routes to whichever provider wins on priority, and Pairgate
   winning is the outcome that sends real money to a live aggregator on a
   customer's phone. Confirm the provider list shows Pairgate disabled before
   going further.
2. Confirm the AidaPay routing row is at priority 2 and the Pairgate row is
   still at its own priority — AidaPay now wins because its competitor is
   disabled, not because the priorities moved. That is the difference between a
   reversible test and an outage.

**Then buy the minimum.** `/vtu/airtime` → MTN → **₦50**, to the test recipient.
The ₦50 minimum is the catalog's `minAmount` floor: it is the smallest real
purchase AidaPay will accept, and it keeps the exposure of a live run to a few
points.

**Observe, in this order:**

1. The purchase returns and `/admin/transactions` shows the row moving
   `pending → processing → confirmed`, with `routedProvider: "aidapay"`.
2. **Whether a webhook arrives at all**, and how long after the purchase.
   Watch the Convex function logs for `POST /api/webhooks/vtu`.
3. The `ref` AidaPay echoes is our Convex transaction id (the adapter sends
   `ref: attemptId`).

**Proves:** that AidaPay calls us, and that disabling Pairgate really does send
this one purchase to AidaPay rather than falling back. Every settlement path in
slice 5 assumes the webhook is the normal case and reconciliation is the
fallback; if AidaPay does not fire a webhook for a completed purchase,
reconciliation silently becomes the *primary* path and the whole latency story
changes.

**If the purchase is refused with "product is not available",** the AidaPay
route or the provider row is wrong — that is the routing table failing closed,
and it is a configuration fault rather than a finding about AidaPay.

**Failure modes:**
- No webhook within a minute → record it as a finding before assuming a
  delivery problem; it may be a callback-URL configuration on AidaPay's side.
- Webhook arrives but is refused → see §3; that is a signature problem, not a
  delivery problem.

---

## 3. The signature — header name, casing, key, encoding

### 3.0 Primary tool: AidaPay's Webhook Simulator (docs pages 13–14)

AidaPay's documentation includes a **Webhook Simulator**, and it is the first
thing to reach for rather than the last. It lets us drive the callback side
without waiting on a real purchase, which matters for three reasons: it is
repeatable, it lets a delivery failure be told apart from a signature failure,
and it does not consume an attempt against the per-provider reconcile budget.

Use it to answer 3a–3d below by inspection instead of by inference, then
confirm the same result end-to-end with the real §2 purchase. A simulator pass
that the real webhook then contradicts is itself the finding — it means the
simulator's envelope differs from what production sends, and production is
authoritative.

**Before firing it**, confirm the simulator posts to `/api/webhooks/vtu` with
`x-vtu-provider: aidapay`. It will very likely let us set a custom path; a
per-provider path returns 404 and looks like a signature problem from the
developer's side, because a 404 on the callback URL is what a retry queue
reports as a delivery failure.

### 3a–3d: what the harness cannot prove

The harness computes the expected HMAC itself from the same key it then
verifies against, so it cannot detect a mismatch in *any* of these four:

| # | Observation | Where |
|---|---|---|
| 3a | Header name as delivered — `Signature`, `signature`, `X-Signature`, something else | Webhook Simulator request view, function logs |
| 3b | Whether it arrived at all under a name containing "signature" (the route's precondition) | same |
| 3c | Whether the signature **verifies against the access token** (we seal the token twice and use it as the HMAC key) | webhook result: applied vs 401 |
| 3d | Encoding: hex or base64, and whether prefixed `sha256=` (the adapter strips that prefix and accepts both) | compare the header the simulator shows to a locally computed HMAC |

**Pass:** the webhook reaches `applyCallback` and settles the row with
`source: "webhook"`.

**Fail:** a 401 with `reason: signature_mismatch` while 3a–3d all look right
means the key material or the signed payload differs from our assumption —
compute the HMAC locally over the *exact* raw body and compare before touching
any code.

Also record: **what AidaPay does when we answer non-2xx** (retry interval, how
many times). It is what tells us whether a 422 from the broken-adapter branch
is the right response. The simulator usually exposes a retry policy setting
that is worth reading even if the run never triggers it.

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

**Observe:** force a purchase AidaPay will reject (a malformed or unassigned
recipient for the chosen network is the usual lever — with production there is
no sandbox where a bad number is free, so this step genuinely spends money and
is the one to skip if the run is short), then:

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

- **Recipient actually receives the airtime.** No assertion anywhere in the
  harness proves delivery — this is the product's entire purpose.
- **Real latency from purchase to webhook**, which is what
  `reconcileAfterMs` (processing 60s / unknown 30s) should be calibrated
  against rather than guessed.
- **Whether a production failure behaves the way the stub assumed.** There is no
  sandbox to rehearse §5 in, so the first genuine rejection is also the first
  evidence about it.
- **Whether `/my_account`'s envelope is what the docs say.** The probe does not
  read it, so nothing we own currently depends on it — record the real body
  under `data` so that whoever adds account-detail display has the shape on
  file.

---

## 8. Un-fence, in this order

1. `/admin/vtu/providers` → **set Pairgate back to `active`** (or to whatever it
   was before §2 — `sandbox` on a deployment seeded from
   `migratePairgateFromEnv`).
2. Confirm the provider list shows it active, and that the airtime page prices
   and serves offers again.
3. Leave the AidaPay routing row at priority 2, **and confirm Pairgate's route
   is still at priority 1**. Routing sorts by `route.priority` ASCENDING, so
   priority 2 loses to priority 1 and the AidaPay row is inert — but it is
   inert because of that ordering, not because AidaPay is `active` and
   therefore harmless. If Pairgate's row has drifted to a higher number than 2
   at any point, AidaPay wins and every customer purchase routes to
   production AidaPay. Check the routing page rather than assuming the seed
   value.
4. If §5 was run, confirm the refund landed: exactly one `vtu_refund` row and
   the balance back where it started.

**Do not leave this section for later.** Until it is done the deployment cannot
sell airtime, and the failure a customer sees is "that product is not
available" rather than anything that names the cause.

---

## Sign-off

Slice 4 stays **"adapter implemented, harness-verified, pending live
verification"** until §1–§5 pass, §6 has either passed or been explicitly
deferred with a reason, and **§8 has been completed**. When it changes, update
both:

- `docs/vtu-slice-5.md` → *Slice 4 status*
- `src/convex/providers/aidapay.ts` → file header, which points at that section

The two are named in each other deliberately so neither can drift alone.

## Two defects this runbook assumes still exist

Neither is fixed by this runbook, and both are things the live run will expose
rather than cause:

1. **There is no per-provider webhook path.** One route,
   `POST /api/webhooks/vtu`, with the provider named by the `x-vtu-provider`
   header and defaulting to `pairgate`. An AidaPay callback that omits the
   header is verified against Pairgate's secret and refused as a 401 — a
   confusing failure that looks exactly like a wrong key.
2. **Test-connection ignores the response body.** A 200 with
   `success: false` reports `ok`. See §1.
