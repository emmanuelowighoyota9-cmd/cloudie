# Neon migration — phase 1 foundation

This folder starts an additive PostgreSQL foundation for users, tenant sites, wallet ledger entries, platform settings, and migration bookkeeping.

## Safety boundaries
- This is not a complete migration. The frontend and existing business logic still use Convex.
- Never put a Neon connection string in a `VITE_*` variable or browser bundle.
- Apply only to a temporary Neon development branch first; do not run against production until schema mapping, data import, and rollback are reviewed.
- IDs are text so a controlled import can preserve existing Convex IDs.
- Reconcile wallet balances against ledger history before cutover. Never derive balances from incomplete history.
- InfinityFree can serve the static Vite build, but cannot run the Node API needed for secure Neon access. A separate server-side runtime is required.

## Workflow
1. Create a temporary Neon branch.
2. Review and apply `001_foundation.sql` there.
3. Inspect tables, constraints, and indexes; add automated integration tests.
4. Complete auth/roles, tenant membership, banking accounts and double-entry ledger, deposits/withdrawals/transfers, and remaining service domains.
5. Prove import counts, financial reconciliation, and feature parity before any production cutover.

All migrations 001–007 have been applied to the connected Neon database (`neondb`) and recorded in `schema_migrations` with SHA-256 checksums; see `STATUS.md` for the applied-state evidence and verification commands.