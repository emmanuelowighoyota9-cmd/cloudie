# Banking Tenancy — implementation, operations and guarantees

Banking tenancy is a module of the existing Cloudie Operations Platform. It is not a
separate application: the same React + Vite frontend, the same Convex backend/database,
the same Convex Auth session, and the same Cloudie admin surface serve it.

**Cloudie is not a bank and this module moves no real money by default.** Every tenant
runs in `sandbox` settlement mode unless an authorized settlement integration is
configured; the UI labels sandbox tenants as simulated on every money surface.

---

## 1. Why the existing stack instead of Turso/Prisma/Next

| Proposed | Actually used | Reason |
| --- | --- | --- |
| Postgres/Turso + Prisma | Convex (reactive document DB) | The platform already stores customers, tenants, wallets and audit logs in Convex. Adding a second database would split financial state across two stores with no shared transaction boundary — the opposite of a double-entry guarantee. |
| Next.js App Router API | Convex queries/mutations + Convex HTTP routes (`src/convex/http.ts`) | Same authorization model, same session, and one atomic mutation boundary per financial write. |
| Server-managed HttpOnly cookie sessions | Convex Auth (`@convex-dev/auth`) | Sessions are already HttpOnly cookies managed server-side. No second auth system was introduced. |
| Zod | Convex validators (`v.*`) | Every public function validates its arguments before the handler runs. |

The only Vercel-relevant surface is the static frontend build (`vite build` → `dist/`) plus
the Convex deployment it talks to.

---

## 2. Data model (Convex, `src/convex/schema.ts`)

Tenant core

- `tenantSites` — the tenant. `siteType: "bank"`, legal/display name, `subdomain`, `ownerId`,
  currency, plan, `bankingMode` (`sandbox` | `live`), `lifecycleStatus`, `subscriptionPlan`,
  `subscriptionRenewsAt`, `branding`, `kycPolicy`, `bankingEnabled`.
- `tenantDomains` — custom-domain mappings resolved before subdomain matching.
- `tenantUsers` — membership + banking role (`owner`, `admin`, `compliance`, `finance`,
  `support`, `customer`); scoped by `by_tenant_and_user`.
- `tenantLedger`, `tenantAccounts` — legacy/site ledger plus the banking account records
  (`balanceMinor`, `availableBalanceMinor`, `ledgerBalanceMinor`, `status`).

Money movement (all carry `tenantId`)

- `bankingDeposits`, `bankingWithdrawals`, `bankingTransfers` — one row per financial
  operation, with `reference`, `status`, `settlementMode`, `idempotencyKey`, `ledgerGroupId`.
- `bankingLedgerEntries` — the double-entry journal. Each row has `groupId`,
  `debitMinor`, `creditMinor`, `currency`, `relatedKind`, `relatedId`.
- `bankingFeeConfig` — per-tenant fees and limits (snapshotted onto each transaction).
- `bankingIdempotency` — idempotency keys scoped by key + tenant + operation kind.
- `bankingApprovals` — dual-approval workflow for ledger corrections.
- `bankingBeneficiaries`, `bankingApiKeys`, `bankingTemplates`, `bankingWebhookEvents`.
- `kycRecords`, `kycEvents` — KYC submissions and review trail.
- `auditLogs`, `notifications` — every privileged action is written here.

All banking tables are additive. No existing table is altered or dropped by this module.
Convex applies schema changes through its normal push (`convex dev --once` /
`convex deploy`); there is no SQL migration to run, and no destructive step exists.

---

## 3. Tenant resolution and isolation

Resolution order (`src/convex/tenantResolver.ts`, `src/lib/tenantHost.ts`,
`src/convex/http.ts`):

1. Hostname is lower-cased, port-stripped, and matched against `tenantDomains` (custom
   domains), then against the `subdomain` suffix (e.g. `crestline-capitalfive.g0ki.com`).
2. Path fallbacks exist for preview/localhost: `/t/:subdomain/banking`,
   `/:tenant/banking`, `/site/:siteId/banking`.
3. Apex/app hosts (`g0ki.com`, `vercel.app`, `convex.site`, …) never resolve to a tenant.
4. The resolved tenant must be a `bank` site and active; otherwise the branded
   maintenance page renders (`TenantSuspendedPage`).

Isolation rules enforced in handlers, not just the UI:

- The tenant id is used only to *look up* the tenant. Authorization comes from the
  caller's identity plus that tenant's own owner/membership rows
  (`requireBankAdmin` in `src/convex/bankingAdmin.ts`, `requireTenantUser` in
  `src/convex/bankingCustomer.ts`).
- Every read/write joins on `tenantId`; an account id from tenant B fails
  `acct.tenantId !== args.tenantId` before the balance is touched.
- Non-members of a portal receive empty data (soft probe), never another tenant's rows.
- Super Admin ownership of the platform is separate from tenant staff roles: a tenant
  administrator cannot reach `/admin/*` because `RequireAdmin` and every admin Convex
  function check `users.role === "admin"`.

---

## 4. Role-based access control

`src/convex/bankingAccess.ts` is the single source of truth:

| Role | Notable permissions |
| --- | --- |
| `owner` (tenant owner or Cloudie super admin) | everything, including `staff.manage`, `fees.manage`, `ledger.approve` |
| `admin` (Tenant Administrator) | customers, accounts, transactions, KYC review, fees, staff (bounded by `canGrantRole`) |
| `compliance` | KYC review, audit, ledger view, **no** fee or ledger approval rights |
| `finance` | fees, ledger view, ledger correction requests, **no** staff management |
| `support` | read-only customers and transactions |
| `customer` | portal only; no console permission |

- `permissionsFor(role)` is used by the UI (`myTenantPermissions`) and re-checked by
  `requirePermission` on every console mutation.
- `canGrantRole` prevents a tenant administrator from minting a peer with more rights
  than it holds; `owner` is not assignable.
- Dual approval: `requestLedgerAdjustment` → `decideLedgerAdjustment`. The requester can
  never approve their own correction, a rejection requires a reason, and only roles with
  `ledger.approve` may decide. The adjustment itself is a balanced ledger entry, never a
  balance overwrite.

---

## 5. Double-entry ledger guarantees

- Amounts are integer **minor units** everywhere (`amountMinor`, `feeMinor`); no floating
  point arithmetic touches balances.
- Every operation writes one `groupId` whose entries must satisfy
  `sum(debitMinor) === sum(creditMinor)` (`verifyDebitsEqCredits`); an unbalanced group
  throws and the mutation rolls back.
- One Convex mutation = one atomic transaction: a failed write leaves no partial ledger.
- Posted rows are immutable in practice — there is no mutation that edits
  `bankingLedgerEntries`. Corrections happen through a new, linked reversing group.
- Balance fields on `tenantAccounts` are a projection of the ledger; the client can never
  supply a balance, and no admin function accepts a balance override.
- Idempotency: `idempotencyKey` is unique per key + tenant + kind. Replays return the
  original record; reusing a key in another tenant or for another operation is a conflict,
  not a replay.
- Concurrency: `createWithdrawal` / `createTransfer` re-read the account and compare
  `availableBalanceMinor` inside the same atomic mutation, so two racing withdrawals
  cannot both pass the funds check (covered by a test).
- Because Convex serializes mutations on the documents they touch, an insufficient-funds
  attempt throws before any ledger row is written.

Transaction lifecycle: `pending` → `processing` → `completed` | `failed` | `reversed` |
`cancelled`. Only `pending`/`processing` rows are actionable; terminal rows are no-ops for
webhooks and reconciliation.

---

## 6. Tenant lifecycle and subscriptions

Statuses: `draft`, `active`, `suspended`, `disabled`, `archived` (see
`VALID_LIFECYCLE`).

- `setTenantLifecycle` is **super-admin only** and requires a reason; it flips
  `lifecycleStatus` + `isActive`, writes an audit record, and notifies the tenant owner.
- Financial mutations call `assertTenantActive` server-side and throw
  `TENANT_UNAVAILABLE` when the tenant is not active — suspension blocks API traffic, not
  just the UI.
- `bankingCron.tenantStatusCheck` runs hourly: tenants past `subscriptionRenewsAt` (plus
  grace) are moved to `suspended` safely — status only. Deposits, withdrawals, transfers,
  ledger entries, KYC records and audit logs are preserved.
- `renewTenantSubscription` extends `subscriptionRenewsAt` and records the change.
  Restoration from `suspended`/`disabled`/`archived`/`draft` is the same audited status
  flip. Nothing replays: no queued or historical financial operation is re-executed on
  restore, and the cron job only reads status.
- While unavailable, customers and staff see the branded maintenance page; it exposes the
  tenant name and a support path, never subscription internals or stack traces.

Cron jobs (`src/convex/crons.ts`), all bounded reads:

- `banking ledger audit` — every 30 minutes, read-only drift detection.
- `banking tenant status check` — hourly, subscription expiry.
- `banking fee reconciliation check` — every 6 hours, flags stale pending deposits for
  operator review (never auto-credits).

---

## 7. API and webhooks

HTTP routes (`src/convex/http.ts`), all requiring a Convex session and tenant-scoped:

```
POST /api/banking/tenants/:tenantId/join
POST /api/banking/tenants/:tenantId/accounts        (also /api/banking/accounts)
GET  /api/banking/tenants/:tenantId/accounts-list   (also /api/banking/accounts-list)
POST /api/banking/tenants/:tenantId/transfers       (also /api/banking/transfers)
POST /api/banking/tenants/:tenantId/deposits        (also /api/banking/deposits)
POST /api/banking/tenants/:tenantId/withdrawals     (also /api/banking/withdrawals)
POST /api/banking/tenants/:tenantId/admin/transfer-override
POST /api/banking/tenants/:tenantId/admin/deposit-override
POST /api/banking/tenants/:tenantId/admin/fees
GET  /api/banking/docs                              (machine-readable route list)
POST /api/banking/webhook                           (HMAC-verified settlement callback)
GET  /api/tenants/resolve?host=…                    (public tenant resolution)
GET  /api/tenants/:subdomain/health                 (tenant-scoped health)
```

Errors are structured (`UNAUTHORIZED` 401, `FORBIDDEN` 403, `TENANT_UNAVAILABLE` 423,
`INSUFFICIENT_FUNDS` 422, `CONFLICT` 409, …). `Idempotency-Key` is accepted on financial
writes.

Webhook verification (`src/convex/bankingWebhook.ts`):

1. Raw body is read and the `x-cloudie-signature` HMAC-SHA256 is compared against
   `BANKING_WEBHOOK_SECRET` using a timing-safe comparison.
2. A missing or wrong signature is rejected before any lookup.
3. `eventId` is deduplicated in `bankingWebhookEvents`; a replay is a no-op.
4. `reference` must match a deposit in the same tenant; unknown references are recorded
   and ignored rather than retried forever.
5. Amount and currency must match the deposit exactly, otherwise the event is rejected
   without crediting.
6. A `sandbox` tenant refuses live settlement events; a `live` tenant needs a configured
   settlement provider.

Nothing may be marked `completed` merely because a webhook mentions a reference — the
deposit is only credited by the verified handler, and only once.

---

## 8. Frontend routes

Customer portal (branded per tenant):

```
/site/:siteId/banking          branded banking app (balance, accounts, transfers, beneficiaries, statements, KYC)
/site/:siteId/dashboard        classic view
/site/:siteId/accounts
/site/:siteId/transactions
/site/:siteId/kyc
/site/:siteId/admin            tenant owner console
/t/:subdomain/banking          path-hosted portal, resolves to the canonical site route
/:tenant/banking               slug alias
/banking                       wildcard-host entry (crestline-capitalfive.g0ki.com/banking)
```

Cloudie Super Admin:

```
/admin/tenants/banking                 banking tenant directory
/admin/tenants/new                     create a tenant from a design kit
/admin/tenants/:tenantId/banking       tenant console: overview, customers/KYC, transactions,
                                       team & permissions, approvals, audit log, design kit, settings
/admin/tenants/:tenantId/banking/settings
```

`/admin/*` is gated by `RequireAdmin`; every underlying Convex function re-checks the role
server-side.

---

## 9. Environment variables

Required for the banking module:

| Variable | Purpose |
| --- | --- |
| `BANKING_WEBHOOK_SECRET` | HMAC-SHA256 key for `POST /api/banking/webhook`. Generate with `openssl rand -hex 32`. |
| `APP_MASTER_KEY` | Encrypts stored provider credentials at rest (`src/convex/lib/encryption.ts`). Already required by the platform. |
| `CONVEX_SITE_URL` | Used to build callback/health URLs in admin surfaces. |

Optional, only for a tenant switched to `bankingMode: "live"`:

| Variable | Purpose |
| --- | --- |
| `PAYSTACK_SECRET_KEY` / `PAYSTACK_WEBHOOK_SECRET` | Settlement provider credentials (the platform's existing Paystack integration). |

No Turso/Prisma/`DATABASE_URL` variable is needed — the database is the Convex
deployment. Never commit secrets; set them in Settings → Environment (production) or the
project Keys tab (development).

---

## 10. Operations runbook

**Create a tenant** — `/admin/tenants/new`, pick a design kit, set slug, currency, plan,
renewal date. The creator becomes `ownerId`. Apply the kit to brand both the customer app
and the console.

**Add staff** — `/admin/tenants/:id/banking` → Team & permissions → add an existing Cloudie
account by email with `admin`, `compliance`, `finance` or `support`. The grant is audited
and the user is notified. Staff roles are verified on every console call.

**Suspend** — tenant console → Lifecycle controls → enter a reason → Suspend. Transactions
stop immediately; all history stays browsable. **Restore** — same control, opposite
direction; nothing is replayed.

**Renew** — subscription panel (`renewTenantSubscription`) extends the renewal date; the
hourly cron will not suspend a renewed tenant.

**Review KYC** — tenant console → Customers & accounts → KYC list, or `/admin/kyc` for the
platform-wide queue. Approvals record reviewer identity and timestamp.

**Ledger corrections** — tenant console → Approvals. A finance/compliance officer requests
the adjustment with a reason; a different officer with `ledger.approve` decides. The
correction posts as a balanced entry.

**Webhook setup** — configure the provider to POST to
`https://<deployment>.convex.site/api/banking/webhook` with an HMAC-SHA256 signature over
the raw body in `x-cloudie-signature`, signed with `BANKING_WEBHOOK_SECRET`.

---

## 11. Verification

Run from the repository root:

```bash
bun test tests/banking.test.ts        # ledger / isolation / lifecycle unit suite
bun test tests/bankingTenancy.test.ts # convex-test: RBAC, transfers, approvals, webhooks
./node_modules/.bin/tsc -p tsconfig.app.json --noEmit
./node_modules/.bin/tsc -p tsconfig.test.json --noEmit
./node_modules/.bin/tsc -p api/tsconfig.json --noEmit
./node_modules/.bin/convex dev --once   # pushes schema/functions and regenerates types
```

Latest recorded results (2026-10-29):

- `tests/banking.test.ts` — 21 pass, 0 fail.
- `tests/bankingTenancy.test.ts` — 24 pass, 0 fail (RBAC matrix, balanced ledger,
  idempotency replays, concurrent-withdrawal race, tenant isolation, suspension blocking,
  dual approval, webhook HMAC/duplicate handling).
- `tsc` for app, tests and `api/` — clean.

Covered by tests: tenant isolation for customers/accounts/ledger/transactions, forged
tenant ids (rejected by membership lookup), unbalanced journal rejection, duplicate
idempotency keys, failed writes leaving no ledger rows, self-approval prevention, suspended
tenant refusing new financial operations, restoration preserving history, webhook signature
failure, amount mismatch, and duplicate events.

---

## 12. Known limitations

- **No real banking partner.** No payout/deposit provider is wired for this module, so a
  tenant set to `live` refuses withdrawals with `SETTLEMENT_PROVIDER_NOT_CONFIGURED`
  instead of pretending to settle. Sandbox tenants are clearly labelled as simulated.
- **Live deposits** require both a provider integration and `BANKING_WEBHOOK_SECRET`; the
  verified webhook handler is implemented and tested, but no provider account exists in
  this deployment.
- **KYC documents** are recorded as metadata plus references; object storage upload is
  handled by the platform's existing `uploadedDocuments` flow. No verification vendor is
  configured, so "approved" always means a human reviewer approved it.
- **Tenant staff UI for non-owners.** Owners use `/site/:id/admin`; tenant staff roles are
  fully authorized and audited server-side and appear in the Cloudie console
  (`/admin/tenants/:id/banking`), but there is no separate staff-branded standalone
  console route yet. A finance officer reaches the same data through the console when they
  also hold a Cloudie admin account, or through the `/api/banking/*` endpoints.
- **MFA** for super admins is not implemented in this module; it depends on the platform's
  auth provider.
- **Statements** are rendered from ledger data and downloadable as JSON/CSV from the
  portal; PDF generation reuses the platform document pipeline and is out of scope here.
