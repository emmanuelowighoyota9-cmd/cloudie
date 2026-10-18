# Neon Migration Status & Inventory

## 1. SQL Migrations (`migrations/`)

All migrations are ordered, transactional, and verified via SHA-256 checksums in `schema_migrations` using `api/scripts/migrate.mjs` (protected by a PostgreSQL session advisory lock):

1. `001_foundation.sql` — Core identity (`users`, `auth_sessions`), multi-tenant hierarchy (`tenants`, `tenant_memberships`), `platform_settings`, and `idempotency_keys`.
2. `002_tenant_banking.sql` — Double-entry tenant banking (`banking_customers`, `banking_accounts`, `banking_ledger_groups`, `banking_ledger_entries`, `banking_transfers`, `banking_cards`, `banking_loans`).
3. `003_core_services.sql` — Customer profiles (`customer_profiles`), wallets & ledger (`wallets`, `wallet_ledger_entries`), logistics (`shipments`, `shipment_events`), marketplace (`catalog_products`, `orders`, `order_items`), `notifications`, `admin_audit_logs`, and `webhook_events`.
4. `004_auth_fields.sql` — Authentication hardening, suspension/termination lifecycle fields, wallet & points balances on `users`, and default `wallet_ledger_entries` constraints.
5. `005_financial_integrity.sql` — Deferred constraint triggers (`cloudie_assert_ledger_group_balanced`) and immutability triggers (`cloudie_prevent_posted_ledger_entry_mutation`) enforcing balanced, append-only posted ledger groups.
6. `006_operations_complete.sql` — RBAC (`roles`, `permissions`, `role_permissions`), `service_prices`, VTU catalog & routing (`vtu_products`, `vtu_routes`), `payment_records`, `crypto_deposit_requests`, `provider_configs`, `service_orders`, and `background_jobs`.

### Running Migrations

```bash
# Dry-run verification (validates order and SHA-256 checksums)
npm run migrate:dry-run

# Apply pending migrations to DATABASE_URL (or TEST_DATABASE_URL)
DATABASE_URL="postgresql://..." npm run migrate

# Verify Convex -> Neon record counts and relational integrity
DATABASE_URL="postgresql://..." npm --prefix api run reconcile
```

---

## 2. Convex to Neon API Migration Inventory

| Convex Module / Function | Neon API Endpoint (`api/src/server.ts`) | Frontend Adapter (`src/lib/neonClient.tsx`) |
| --- | --- | --- |
| `users:currentUser`, `users:viewer`, `auth:*` | `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me` | `ConvexAuthProvider`, `useAuth`, `useConvexAuth`, `useAuthActions` |
| `platform:getPublicConfig`, `platform:getAdminConfig`, `platform:saveAdminConfig` | `GET /api/public/config`, `GET /api/admin/settings`, `POST /api/admin/settings` | `platform:getPublicConfig`, `platform:getAdminConfig`, `platform:saveAdminConfig` |
| `wallet:getBalance`, `points:getBalance`, `trackingUser:myPointsBalance` | `GET /api/wallet/summary` | Returns primitive numeric balance (NGN/Points) |
| `wallet:getLedger`, `wallet:getAdminLedger` | `GET /api/wallet/ledger`, `GET /api/admin/transactions` | `normalizeLedgerEntry` with camelCase + snake_case parity |
| `wallet:fundDemo`, `payments:verifyPaystackAndCredit` | `POST /api/wallet/fund`, `POST /api/payments/paystack/initialize`, `POST /api/payments/paystack/verify` | Reactive invalidation via `notifyNeonQueries()` |
| `cryptoBilling:*` | `GET /api/crypto/config`, `GET /api/crypto/deposits`, `POST /api/crypto/deposits` | Full customer + admin deposit review support |
| `shipments:listMy`, `shipments:getById`, `shipments:create`, `shipments:updateStatus` | `GET /api/shipments`, `GET /api/shipments/:id`, `POST /api/shipments`, `POST /api/shipments/:id/events` | `normalizeShipment` & `normalizeShipmentEvent` |
| `trackingQueries:publicTracking`, `shipments:trackByNumber` | `GET /api/public/track/:trackingNumber` | Public shipment lookup + timeline normalization |
| `marketplace:*` | `GET /api/catalog`, `GET /api/orders`, `POST /api/orders`, `POST /api/admin/catalog` | `normalizeCatalogProduct` & `normalizeOrder` |
| `vtu:*`, `vtuCatalog:*`, `vtuPurchase:*`, `vtuAdmin:*` | `GET /api/vtu/catalog`, `GET /api/vtu/transactions`, `POST /api/vtu/purchase` | Airtime, Data, Electricity, Cable TV, Exam PINs |
| `tenants:*`, `banking:*`, `bankingAdmin:*` | `GET /api/tenants`, `POST /api/tenants`, `GET /api/admin/tenants`, `POST /api/admin/tenants/:id/status` | Tenant provisioning, banking workspace & admin controls |
| `notifications:*` | `GET /api/notifications`, `POST /api/notifications/:id/read`, `POST /api/notifications/read-all` | Unread count, mark read, mark all read |
| `adminApi:*`, `adminDashboard:*`, `adminUsers:*`, `audit:*` | `GET /api/admin/overview`, `GET /api/admin/users`, `GET /api/admin/users/:id`, `POST /api/admin/users/:id/wallet-adjust`, `GET /api/admin/audit-logs` | Full admin KPIs, user/vendor detail, wallet adjustments, audit trail |
