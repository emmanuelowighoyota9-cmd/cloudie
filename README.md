# Cloudie Operations Platform

## Freebuff production deployment

This repository is a Vite + React application with Convex as its backend.

### Freebuff build command

Use:

```bash
npm run build:freebuff
```

Equivalent command:

```bash
npx convex deploy --cmd "npm run build" --cmd-url-env-var-name VITE_CONVEX_URL
```

Convex deploys the production backend, regenerates generated types, pushes the schema/functions/indexes, and runs the Vite production build.

### Required Freebuff/CI secret

Set:

```text
CONVEX_DEPLOY_KEY=<Convex production deploy key>
```

Generate this from the Convex production deployment settings. Do not expose it as a Vite/public variable.

### Required Convex production secrets

Set these in the **Convex production deployment**, not in browser/public environment variables:

```text
LOGSPANEL_API_KEY=<Logspanel API key>
```

Also configure any existing Convex authentication/payment/provider secrets required by the application.

### Public frontend variable

If Freebuff runs the combined Convex deployment command above, the production `VITE_CONVEX_URL` is injected automatically for the frontend build.

Do not put `CONVEX_DEPLOY_KEY` or `LOGSPANEL_API_KEY` into `VITE_*` variables.

### SPA hosting

The generated Vite output is `dist/`. Freebuff should serve `dist/` as an SPA so
direct routes such as `/dashboard`, `/marketplace`, and `/admin` fall back to
`index.html`.

If a host answers unknown paths with a static 404 instead (no rewrite support),
the build's `dist/404.html` still recovers: it parks the requested path in
`sessionStorage`, sends the browser to `/`, and `src/main.tsx` replays it before
the router mounts. Deep links therefore keep working with or without rewrites.

## Custom domain: cloudieexpress.duckdns.org

The domain is served from a VPS (nginx + Let's Encrypt) while Convex remains the
backend — the same production deployment the frontend already talks to.

Setup, verification, updates and rollback are documented in
[`deploy/README.md`](./deploy/README.md). In short, on the VPS:

```bash
sudo EMAIL=you@example.com ./deploy/bootstrap.sh   # nginx + certificate
sudo nano /etc/cloudieexpress/cloudieexpress.env   # set VITE_CONVEX_URL
sudo ./deploy/release.sh                           # build + publish + verify
```

The nginx site (`deploy/nginx/`) serves `index.html` and `sw.js` uncached, caches
`/assets/*` immutably, and falls back to the app shell for deep routes.

### Post-deployment smoke test

Check:

1. Landing page
2. Authentication
3. Dashboard
4. Marketplace
5. Admin login
6. Admin Marketplace
7. Logspanel catalog sync
8. Logspanel test purchase with a non-production/test product
9. Pending-order refresh
10. Logout and protected-route redirects
