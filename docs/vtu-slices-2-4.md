# VTU slices 2–4 — design notes

Sketched, not built. Recorded here so slice 1's call sites are not painted
into a corner, and so the assumptions baked into the adapter boundary are
written down where a future change can be checked against them.

## The boundary, and what slice 4 tests it

`src/convex/vtuShared.ts` defines `VtuProviderAdapter`. Above
`src/convex/vtuRegistry.ts`, no file imports a concrete adapter and no file
names a provider. Consumers call `getAdapter(name)` and know only the
interface.

Slice 4 is the test of that. Plugging VTpass or ClubKonnect in should require
**one new adapter file and one registry entry** — and nothing else. If a
second adapter needs changes anywhere above the registry, the boundary was drawn
in the wrong place, and fixing it is only cheap now, while nothing above the
line has ever heard of Pairgate.

The assumption this rests on, stated so slice 4 can falsify it: the two
aggregators will differ in **wire format** and agree on **capability**. The
three-state result (`success | failed | unknown`) and the `VtuServiceType`
vocabulary were chosen to survive exactly that. The specific risk is a fourth
state — for example "requires a later settlement confirmation" — which would
mean `unknown` is not expressive enough and the boundary needs widening. Better
to learn that in slice 4 than to have over-built slice 1 around a guess.

---

## Slice 2 — providers configurable in admin

**Table**

```ts
vtuProviders: defineTable({
  name: v.string(),              // matches adapter.name
  displayName: v.string(),
  baseUrl: v.string(),
  encryptedApiKey: v.string(),   // sealed, see below
  encryptedWebhookSecret: v.optional(v.string()),
  authHeader: v.optional(v.string()),
  callbackSignatureHeader: v.optional(v.string()),
  active: v.boolean(),
  priority: v.optional(v.number()),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_name", ["name"]).index("by_active", ["active", "priority"])
```

**Encryption.** Convex does not encrypt field values at rest, so this is
application-level: AES-256-GCM under a key derived from a master secret in the
environment, following the `emailCrypto.ts` precedent. `vtuCrypto.ts` already
provides the primitives and is already a `"use node"` module.

The rule that must not be broken: **decryption happens only inside the action
that calls the provider.** A query the client can subscribe to must never
decrypt, because Convex subscriptions stream results to the browser — a
subscribed query that decrypted would ship the API key to the client. Today
`getProviderConfig` returns only sealed blobs and the master key is read from
`process.env` inside the action, which is what keeps that property true.

**Registry** becomes a table lookup keyed on `adapter.name`, with
`priority` breaking ties when more than one provider is active. Slice 1's
`getAdapter` signature does not change.

**Admin page.** CRUD plus a "test connection" button that hits the provider's
balance/health endpoint. Migration is a table insert, not a code change: Pairgate
moves from a hard-coded constant to a row, with no behaviour change for users.

---

## Slice 3 — per-product routing

**Table**

```ts
vtuServiceRouting: defineTable({
  serviceCode: v.string(),       // "airtime.mtn.1000"
  provider: v.string(),          // adapter.name
  pointsCostOverride: v.optional(v.number()),
  active: v.boolean(),
  createdAt: v.number(),
  updatedAt: v.number(),
}).index("by_serviceCode", ["serviceCode"])
```

Two providers run in parallel, and `beginPurchase` resolves which one owns a
given product. This is where a provider outage stops being an outage: a failed
attempt on provider A can be re-attempted on provider B.

**What this forces on slice 1's design, and it already holds.** The idempotency
key is `vtu:purchase:<clientRequestId>` and is *not* namespaced by provider,
precisely so a retry routed to a different aggregator still de-duplicates. If
the key had included the provider name, this slice would have double-charged
every failover.

**Admin catalog page.** CRUD over `vtuServiceRouting` and the VTU rows of
`pointPricing` (the `serviceCode` / `active` columns added in slice 1).

---

## Slice 4 — second real adapter

Deliverable is one file implementing `VtuProviderAdapter` plus a registry entry
and a `vtuProviders` row. VTpass and ClubKonnect are both plausible; pick on
sandbox quality and whether they carry electricity, which Pairgate's public
material does not clearly evidence.

`verify()` already exists on the interface specifically so the reconciliation
poller — still deliberately absent — can be added in this slice without an
interface break.

---

## Still deliberately unbuilt

> **Superseded by slice 5.** Both items below shipped in `vtu-slice-5.md` —
> the reconciliation poller and the audited admin reversal. Kept as written,
> because the reasoning is what made them safe to defer: the poller needed a
> rate budget before it could be written without risking a blocked provider
> account, and the reversal needed a single writer of terminal status before
> widening the allow-set would mean anything.

**The reconciliation poller.** Slice 1 is webhook-only by decision, so a
transport timeout leaves a transaction in `unknown` with the points still
debited and no automatic recovery. That is a real gap, accepted on purpose:
reversing on a timeout would refund airtime that may have been delivered at the
carrier.

The measurement that decides whether to build it is rows sitting in `unknown`,
which is why that status is real and is never coerced to `pending` or `failed`.
Once the rate is known, the poller is a small addition — and it should be
written against observed failure modes rather than guesses.

**Manual/admin reversal.** `confirmed → reversed` is refused by the transition
guard in slice 1. A later slice needs to widen that guard deliberately, and
should do so as an explicit, audited admin action rather than by loosening the
allow-set.
