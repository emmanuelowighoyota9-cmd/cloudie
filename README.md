> **Deployment / migration status (verified from repository):** The frontend is still Convex-dependent. The Neon API under `api/` is a migration scaffold, not yet a complete replacement for Convex data, payments, VTU providers, and wallet writes. Do not remove the remaining Convex runtime or switch customer traffic solely because the Neon API health endpoint responds; complete feature parity, test against a staging database, and plan credential/data migration first. The free-hosting build artifact is produced by `.github/workflows/infinityfree-build.yml`; it does not automatically upload files to InfinityFree `htdocs`. See `migrations/STATUS.md` and `api/README.md` before changing production routing.

# Cloudie Operations Platform

Production-ready multi-service operations platform powered by **React + Vite + TypeScript** on the frontend, **Hono + Node.js** on Render (`api/`), and **Neon PostgreSQL** (`migrations/`).

---

## Architecture Overview

| Layer | Technology / Hosting | Location |
| --- | --- | --- |
| **Frontend SPA** | React 19, Vite, TypeScript, Tailwind CSS (InfinityFree `htdocs`) | `src/`, `public/` |
| **Backend API** | Node.js 20+, Hono, Zod, `pg`, JWT + Session Cookies + CSRF (Render) | `api/src/server.ts`, `render.yaml` |
| **Database** | Neon PostgreSQL with ordered SHA-256 verified migrations | `migrations/001_*.sql` – `006_*.sql` |

---

## 1. Database Setup & Migrations (Neon PostgreSQL)

Ordered SQL migrations live in [`migrations/`](./migrations/) and are managed by [`api/scripts/migrate.mjs`](./api/scripts/migrate.mjs), which acquires a PostgreSQL advisory lock and verifies SHA-256 checksums in `schema_migrations`.

```bash
# Preview ordered migrations and checksums without touching a database
npm run migrate:dry-run

# Apply migrations to Neon PostgreSQL
DATABASE_URL="postgresql://<user>:<password>@<neon-host>/<dbname>?sslmode=require" npm run migrate

# Verify table counts and relational integrity
DATABASE_URL="postgresql://<user>:<password>@<neon-host>/<dbname>?sslmode=require" npm --prefix api run reconcile
```

---

## 2. Backend API (Render: `cloudie-operations-api-stage`)

The backend service is defined in [`render.yaml`](./render.yaml) with `rootDir: api`.

- **Build command:** `npm install && npm run build`
- **Start command:** `npm run start`
- **Health check endpoint:** `/healthz` (database readiness at `/readyz`)

### Required Render Environment Variables

| Variable | Description |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | Neon PostgreSQL connection string (`sslmode=require`) |
| `JWT_SECRET` | Random 32+ byte secret used to sign session tokens |
| `CORS_ORIGINS` | `https://cloudie.wuaze.com,http://localhost:5173,http://localhost:3000` |

### Local API Verification

```bash
npm --prefix api run typecheck
npm --prefix api test
```

---

## 3. Frontend Build & InfinityFree Deployment (`https://cloudie.wuaze.com`)

InfinityFree serves the compiled static SPA from `htdocs/` while all API requests go to Render (`VITE_NEON_API_URL`).

### Build Command

```bash
VITE_NEON_API_URL=https://cloudie-operations-api-stage.onrender.com npm run build
```

### InfinityFree Upload Checklist

1. Run the build command above to generate `dist/`.
2. Upload the **contents** of `dist/` directly into your InfinityFree `htdocs/` directory:
   - `index.html`
   - `404.html` (handles deep-link recovery when static 404s occur)
   - `.htaccess` (rewrites SPA routes to `index.html`)
   - `assets/*`, `manifest.webmanifest`, `sw.js`, and icons
3. Never place `DATABASE_URL`, `JWT_SECRET`, or provider secret keys inside `VITE_*` variables.

---

## 4. Verification

Run the four local typecheck and unit-test commands in order with the repository script:

```bash
bash scripts/verify.sh
```

The script runs:

```bash
bunx tsc -b --noEmit
bun test
npm --prefix api run typecheck
npm --prefix api test
```

The frontend uses Bun's built-in test runner; no Vitest or Jest runner is configured. To invoke the script directly after checkout, run `chmod +x scripts/verify.sh` once, then `./scripts/verify.sh`.

The script reports success only if all four commands exit zero. It does **not** prove live Convex purchase behavior. Separately verify a real buy → escrow → credited cycle and an insufficient-wallet rejection against a deployed Convex environment. A live deployment smoke check can also be run with `npm run smoke:live`.

**Live backend verification** (manual only; not run in CI):
1. Deploy a Convex dev environment and prepare a buyer test account with sufficient wallet balance and a separate approved vendor test account that owns the selected package.
2. Set `CONVEX_URL`, `BUYER_AUTH_TOKEN`, `VENDOR_AUTH_TOKEN`, and `TEST_PACKAGE_ID` in your environment. The buyer token must belong to the buyer test user; the vendor token must belong to the approved vendor who owns the package.
3. Before the insufficient-funds step, set the test user's wallet balance below the package price using the approved test setup/admin workflow.
4. Run `bun run verify:convex`.

This script requires credentials and mutable test data and is intentionally not run in CI.
