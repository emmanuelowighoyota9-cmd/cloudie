> **Unverified.** The claims below have not been confirmed against the live  
> Neon database. As of this writing, `neondb` on branch `br-winter-snow-b5spd77h`  
> reports zero application tables. The migration history in this file is  
> retained for audit only. Treat every "applied" marker below as historical,  
> not current, until `scripts/neon-diagnose.sh` has been run and its output  
> committed alongside this file.

# Neon Migration Status & Inventory

## Current verification status — NOT CONFIRMED

The migrations in this directory have not been confirmed to apply cleanly against the live Neon database. Run `scripts/neon-diagnose.sh` to establish the actual state before treating this file as a record of applied migrations.

## Unverified historical claim (audit-only)

**Unverified — retained for audit.** The prior version of this document claimed that all seven migrations were applied to the connected Neon database (`neondb`) on 2026-10-19; that `schema_migrations` contained checksums; that re-running `npm run migrate` was a no-op (0 applied, 7 up-to-date); that the 005 ledger-integrity behavior test passed; and that `api/scripts/e2e-live.ts` passed. Those claims are preserved below as historical context only. They are not accepted as current live-database evidence because a subsequent read-only table inventory returned zero application tables. The mismatch must be resolved against the exact Neon branch/endpoint before anyone treats migration state as verified.

### Historical migration inventory (unverified)

1. `001_foundation.sql` — Core identity (`app_users`), tenant hierarchy (`tenant_sites`), wallet ledger (`wallet_ledger`), `platform_settings`, and `schema_migrations` bookkeeping.
2. `002_tenant_banking.sql` — Double-entry tenant banking (`tenant_users`, `tenant_accounts`, `banking_beneficiaries`, `banking_ledger_groups`, `banking_ledger_entries`, `banking_deposits`, `banking_withdrawals`, `banking_transfers`).
3. `003_core_services.sql` — Service subscriptions, logistics (`shipments`, `shipment_events`), documents (`user_documents`), `kyc_records`, `storage_files`, marketplace (`catalog_products`, `commerce_orders`, `commerce_order_items`), and `user_notifications`.
4. `004_auth_fields.sql` — API authentication fields (`password_hash`, `password_changed_at` on `app_users`) and session storage (`api_sessions`).
5. `005_financial_integrity.sql` — Deferred constraint triggers (`cloudie_assert_ledger_group_balanced`) and immutability triggers (`cloudie_prevent_posted_ledger_entry_mutation`) intended to enforce balanced, append-only posted ledger groups.
6. `006_operations_complete.sql` — RBAC (`roles`, `permissions`, `role_permissions`), `service_prices`, VTU catalog & routing (`vtu_products`, `vtu_routes`), `payment_records`, `crypto_deposit_requests`, `provider_configs`, `service_orders`, and `background_jobs`. Historical notes say its foreign keys were corrected to reference `app_users` and `tenant_sites`.
7. `007_admin_audit_logs.sql` — Administrative audit trail (`admin_audit_logs`) used by `recordAuditLog()` and `GET /api/admin/audit-logs` in `api/src/server.ts`.

The repository runner is `api/scripts/migrate.mjs` (root scripts: `npm run migrate` and `npm run migrate:dry-run`). It sorts the numbered SQL files lexically, uses a PostgreSQL advisory lock, and executes each full SQL file through `client.query(migration.sql)`. The numbered dependency order is 001 → 002 → 003 → 004 → 005 → 006 → 007. The direct diagnostic script below intentionally uses `psql -v ON_ERROR_STOP=1 -f` to localize SQL-file errors; it does not replace the checksum-aware migration runner or prove that runner bookkeeping is correct.

### Running diagnostics safely

Use a disposable Neon branch and a **direct, non-pooled** connection string. Do not point the diagnostic at the production branch. The script refuses the known production branch ID and pooled connection strings; supply the exact disposable branch ID returned by Neon when prompted by the script's environment requirements.

```bash
# See scripts/neon-diagnose.sh for required variables and safety checks.
bash scripts/neon-diagnose.sh
```

### Historical API route inventory (not a cutover-readiness claim)

The prior document described the following API routes as verified on 2026-10-19. This list is retained as historical context, not fresh evidence of deployment or database state.

| Area | Routes |
| --- | --- |
| Health | `GET /health`, `GET /ready`, `GET /api/health`, `GET /api/ready` |
| Auth | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/csrf`, `GET /api/me` |
| Profile | `GET /api/profile`, `PATCH /api/profile` |
| Public config | `GET /api/public-config` |
| Wallet | `GET /api/wallet/summary`, `GET /api/wallet/ledger` |
| Shipments & tracking | `GET /api/shipments`, `GET /api/shipments/:id`, `POST /api/shipments`, `PATCH /api/shipments/:id`, `GET /api/tracking/:trackingNumber` |
| Marketplace | `GET /api/catalog`, `GET /api/orders`, `POST /api/orders` |
| Notifications | `GET /api/notifications`, `POST /api/notifications/:id/read`, `PATCH /api/notifications/:id/read`, `POST /api/notifications/read-all` |
| Documents | `GET /api/documents` |
| Tenants | `GET /api/tenants`, `POST /api/tenants` |
| Admin | `GET /api/admin/users`, `PATCH /api/admin/users/:id`, `POST /api/admin/users/:id/wallet-adjust`, `GET /api/admin/transactions`, `GET /api/admin/audit-logs`, `GET /api/admin/shipments`, `GET|POST /api/admin/settings`, `GET /api/admin/reports`, `POST /api/admin/catalog`, `PATCH /api/admin/catalog/:id`, `DELETE /api/admin/catalog/:id` |

The API's actual feature parity and deployment state must be re-verified before any cutover. See `docs/convex-to-neon-cutover-gates.md` and `docs/neon-migration-trace.md`; the earlier trace described 373 Convex references across 37 modules without Neon API coverage.


## Direct Neon verification — 2026-10-21

This section records a fresh read-only inventory and an isolated schema exercise. It does not mark production as migrated.

- Neon project: `cloudie` (`lively-sky-99526507`).
- Production branch: `production` (`br-winter-snow-b5spd77h`). A read-only public-table inventory returned **zero application tables**. No SQL was executed against this branch during the schema exercise.
- Earlier disposable schema-exercise branch: `test-migrations` (`br-nameless-morning-b5o1qitn`), a child of the production branch. It was used for direct SQL schema exercises and is not the target for the checksum-aware runner.
- Applied migrations `001_foundation.sql` through `007_admin_audit_logs.sql` to the test branch using the SQL statements from the repository files. All seven files completed without SQL errors.
- Re-applied the seven files on the test branch. The repeat pass completed without SQL errors, providing evidence that the DDL is repeatable on this branch.
- Post-run inventory: 36 public base tables, 10 public triggers, and 483 public constraints.
- Sample row counts after the schema exercise: `app_users` = 0, `wallet_ledger` = 0, `tenant_sites` = 0, `admin_audit_logs` = 0.
- The `schema_migrations` table has zero rows. This is expected for the direct SQL exercise: it bypassed `api/scripts/migrate.mjs` and therefore does **not** verify checksum bookkeeping, advisory-lock behavior, or the repository runner's idempotency.
- No production schema, customer records, credentials, wallets, or payments were changed by this exercise.

### Remaining blockers

1. Verify the deployed API's actual `DATABASE_URL` branch without revealing credentials. The healthy API endpoint only confirms a successful `SELECT 1`; it does not establish schema readiness.
2. Run the repository's checksum-aware migration runner against the disposable branch and verify all seven checksums/versions are recorded. Do not run it against production until an explicit data/schema plan and recovery path are approved.
3. Implement and verify feature parity, authentication/session transport, existing-user recovery/mapping, tenant and admin authorization, and complete marketplace/financial behavior.
4. Keep production traffic on the existing working path until the cutover and rollback gates in `docs/convex-to-neon-cutover-gates.md` are satisfied.

**Status: test-branch schema applied and repeat-applied; production cutover blocked.**


### Checksum-aware runner verification workflow

A manual GitHub Actions workflow is available at `.github/workflows/neon-migration-runner-test.yml`. To run it:

1. The clean runner-test branch is `migration-runner-test-clean` (`br-lively-rain-b5vq2oju`). A branch-specific guard table was created there with marker `cloudie-migration-runner-test-clean-br-lively-rain-b5vq2oju`; the workflow verifies this marker before migrating.
2. In GitHub repository **Settings → Secrets and variables → Actions → Secrets**, set `CLOUDIE_NEON_TEST_DATABASE_URL` to the **direct** connection string for `neondb` on that exact clean branch. Never commit or paste the connection string into an issue, PR, or chat.
3. The workflow checks the branch marker and, on a fresh database, refuses unexpected public tables. Do not point the secret at production or the earlier manually migrated test branch.
4. Open **Actions → Verify Neon migration runner (test branch) → Run workflow** only after the workflow change is merged or available on the default branch.
5. Require the migration runner, second dry-run, and seven-version checksum assertion to pass. Save the successful run URL and output before treating the repository migration runner as verified.

The workflow uses the repository runner and writes migration bookkeeping only to the disposable test branch. It does not deploy the API, change frontend routing, or migrate production data.
