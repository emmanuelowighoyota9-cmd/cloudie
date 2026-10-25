# Remediation Status

Each finding from `COMPREHENSIVE_AUDIT.md`, its current state, the test that
proves it, and what remains.

Legend: **Fixed** — code changed and regression-tested. **Open** — confirmed,
not yet fixed. **Partial** — the harmful behaviour is removed, a lesser
residual remains.

---

## P0-1 — Wallet adjustment mixed NGN and points

**Status: Fixed**

| Item | Detail |
| --- | --- |
| Affected | `api/src/server.ts` `POST /api/admin/users/:id/wallet-adjust` |
| New module | `api/src/walletAdjust.ts` |
| Unit separation | `amountNgn` and `pointsDelta` are independent; neither derives from the other |
| Clamping | Removed; insufficient debit returns `INSUFFICIENT_FUNDS` |
| Ledger accuracy | Ledger `amount_ngn` equals the real balance change |
| Concurrency | `SELECT … FOR UPDATE` + compare-and-set |
| Idempotency | `wallet_ledger.idempotency_key` written; replay returns original result |
| Audit | Written in the same transaction, before `COMMIT`; failure aborts the mutation |
| Rollback | Every failure path rolls back |

**Tests**

* `api/src/walletAdjust.test.ts` — 16 cases (see audit §B P0-1).
* `api/src/server.smoke.ts` — non-admin gets 403; zero and absurd amounts are
  rejected before any database access.

**Evidence:** `npm --prefix api test` → 56 pass / 0 fail.

**Residual risk.** The frontend `wallet:adminAdjust` shim passes an explicit
`points_delta`, so a NGN-only UI action correctly moves no points. Any *future*
caller that wants a points adjustment must pass `points_delta` explicitly; the
API will not infer it.

---

## P0-2 — Fabricated dashboard metrics

**Status: Fixed**

| Item | Detail |
| --- | --- |
| Affected | `api/src/server.ts` `GET /api/admin/reports`; `src/lib/neonClient.tsx` |
| Active users | Counted as `NOT is_suspended AND NOT is_terminated`, not copied from the total |
| Suspended users | Counted from `is_suspended`, no longer hard-coded to `0` |
| Missing metrics | Reported as `null`, never `0` |
| Frontend | No cross-metric fallback; `null` renders as unavailable |

**Tests**

* `api/src/server.smoke.ts` — "admin reports count active and suspended users
  instead of fabricating them" (asserts `activeUsers ≠ totalUsers`, a real
  suspended count, and `null` for an unavailable metric).
* `src/__tests__/adminDashboardShape.test.tsx` — "active is never inferred from
  the total user count"; "a missing active count does not fall back to the
  total".

**Evidence:** 631 frontend + 56 API tests pass.

**Metric definitions** (documented, source of truth = the SQL in `server.ts`):

| Metric | Definition |
| --- | --- |
| `activeUsers` | users where `NOT is_suspended AND NOT is_terminated` |
| `suspendedUsers` | users where `is_suspended` |
| `terminatedUsers` | users where `is_terminated` |
| `adminUsers` | users where `role = 'admin'` |
| `walletBalanceNgn` | `SUM(wallet_balance_ngn)` — total NGN liability, naira |
| `pointsOutstanding` | `SUM(points_balance)` — total points, separate unit |
| `escrowPending` | orders in `('pending','paid','escrow')` |
| `disputedOrders` | orders where `status = 'disputed'` |
| `ledgerEvents24h` | `wallet_ledger` rows in the last 24 hours |
| any `null` | source table missing or count failed — **not** a zero |

---

## P1-1 — Audit failure shown as an empty log

**Status: Partial**

The **write** path is fixed: a critical mutation cannot succeed without its
audit record (P0-1 fix, proven by the "an audit failure aborts the mutation"
test).

The **read** path (`GET /api/admin/audit-logs`) still returns `{ logs: [] }` on
error, so an outage remains indistinguishable from an empty trail on that page.
Open: return a typed `unavailable` state instead.

---

## P1-2 — Bearer token in `sessionStorage`

**Status: Open (documented, not migrated)**

A partial cookie migration would break authentication, which the brief
prohibits. Current mitigations (HttpOnly session cookie, double-submit CSRF,
`SameSite=Lax`, `Secure` in production) are in place and tested. The recommended
migration path is documented in `docs/security/SECURITY_REVIEW.md`.

---

## P1-3 — No password reset or email verification

**Status: Open (not implemented)**

Requires an email provider and a reset-token table. No regression risk to
existing flows.

---

## P2-1 — In-memory rate limiter

**Status: Open**

Real protection within a single instance; does not survive restart or
scale-out. Recommended: move buckets to a shared store.

---

## Auth/session persistence (navigation invariants)

**Status: Verified present, no fix required**

| Invariant | State | Evidence |
| --- | --- | --- |
| Three-state session (`loading`/`authed`/`anon`) | Present | `src/hooks/useSession.tsx` |
| Skeleton while loading, never a redirect | Present | `RequireAuth`, `AppShell`; nav test "holds a skeleton while the session is unresolved instead of redirecting" |
| Single guard (shell does not redirect independently) | Present | `AppShell.tsx` comment + `RequireAuth.tsx` |
| Stable session key (no route-keyed refetch) | Present | `useSession.tsx` one request per page load, shared via `inFlightSession` |
| 5xx/network error does not end the session | Present | `readSession()` falls back to cached user on non-401 |
| Slow first read cannot overturn a concurrent sign-in | Present | functional `setState` guard in `useSession.tsx` |
| Drawer close/logout on close | Absent (correct) | nav test "keeps the session across drawer open/close and two workspace changes" |
| CSRF header on logout | Present | nav test "the logout request carries the Neon CSRF header" |
| Logout revokes server-side session | Present | `api_sessions.revoked_at = NOW()` in `/api/auth/logout` |

The `window.location.reload()` calls in `src/main.tsx` are guarded stale-chunk
recovery for lazy-loaded routes; they do not clear tokens and are not in nav
logic.
