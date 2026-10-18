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

## 4. Verification & Test Suite

```bash
# Frontend TypeScript check
bunx tsc -b --noEmit

# Frontend & domain unit tests (Vitest / Bun test runner)
bun test

# Backend API TypeScript check & security/smoke test suite
npm --prefix api run typecheck
npm --prefix api test

# Live deployment smoke check against cloudie.wuaze.com & Render API
npm run smoke:live
```
