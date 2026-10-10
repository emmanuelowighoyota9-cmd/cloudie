# Serving Cloudie Express on `cloudieexpress.duckdns.org`

This directory installs the domain on a VPS you control. The VPS serves the
built SPA (`dist/`); **Convex stays the backend** — data, auth, file storage and
background jobs keep running on the same production Convex deployment the
frontend already points at. There is no second database and no second copy of
the data.

| Piece | Runs on |
| --- | --- |
| `index.html` + `/assets/*` (the Vite build) | your VPS, via nginx |
| Database, auth, actions, crons, file storage | Convex (`https://<deployment>.convex.cloud`) |
| DNS | DuckDNS (`A` record → your VPS public IP) |
| TLS certificate | Let's Encrypt, issued and renewed by certbot on the VPS |

Files:

- `nginx/cloudieexpress.duckdns.org.conf` — the production server block (installed to `/etc/nginx/sites-available/`).
- `nginx/cloudieexpress-headers.conf` — shared security headers (installed to `/etc/nginx/snippets/`).
- `bootstrap.sh` — installs nginx + certbot, checks DNS, installs the site, issues the certificate. Run **on the VPS as root**.
- `release.sh` — builds the frontend and publishes it atomically. Run **on the VPS as root**.
- `env.example` — copied to `/etc/cloudieexpress/cloudieexpress.env` the first time.

---

## 1. Point DuckDNS at the VPS

DuckDNS keeps the `duckdns.org` zone on its own nameservers and only offers an
`A`/`AAAA` record for your subdomain — there is no CNAME option, which is fine
here because the target really is a server IP.

In the DuckDNS dashboard, set `cloudieexpress` to your VPS public IP. Or do it
from the VPS itself: leaving `ip=` empty makes DuckDNS record the address the
request came from, so this is self-correcting even if the IP changes.

```bash
# Run ON the VPS. <TOKEN> is the token on your DuckDNS account page (secret — never commit it).
curl "https://www.duckdns.org/update?domains=cloudieexpress&token=<TOKEN>&ip="
# Expected: OK
```

Confirm it resolves to the VPS before continuing:

```bash
dig +short cloudieexpress.duckdns.org     # must print the VPS public IP
curl -4 ifconfig.me                       # the VPS's own public IP, for comparison
```

Also open inbound **80** and **443** in the VPS firewall/security group (80 is
needed every 90 days for certificate renewal).

## 2. Get the code onto the VPS

The project is mirrored to GitHub automatically after every change.

```bash
sudo apt-get update && sudo apt-get install -y git
git clone <your-repo-url> ~/cloudieexpress
cd ~/cloudieexpress
```

Node.js 20+ is needed for the build:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v && npm -v
```

## 3. Install nginx + TLS

```bash
cd ~/cloudieexpress
sudo EMAIL=you@example.com ./deploy/bootstrap.sh
```

The script installs nginx and certbot, creates `/var/www/cloudieexpress`, checks
that the domain resolves to this machine, writes the nginx site, and requests the
certificate. If DNS is not in place yet it stops with the exact DuckDNS command
to run; to serve plain HTTP meanwhile use `sudo ./deploy/bootstrap.sh --no-tls`
and re-run with `EMAIL=` once DNS has propagated.

## 4. Point the build at the production Convex backend

```bash
sudo nano /etc/cloudieexpress/cloudieexpress.env
```

Set `VITE_CONVEX_URL` to the **production** deployment URL from the Convex
dashboard (the value looks like `https://joyous-bison-657.convex.cloud`) and
leave `DOMAIN` / `WEBROOT_ROOT` as they are. Only public values belong in this
file — it is compiled into the browser bundle.

## 5. Publish the frontend

```bash
cd ~/cloudieexpress
sudo ./deploy/release.sh
```

This installs dependencies, runs the production build (`tsc -b && vite build`),
copies `dist/` into `/var/www/cloudieexpress/releases/<timestamp>`, flips the
`current` symlink, prunes old releases, then fetches `https://cloudieexpress.duckdns.org/`
and `/dashboard` and fails loudly unless both return the app shell.

---

## Verification checklist

```bash
curl -I  http://cloudieexpress.duckdns.org           # 301 → https
curl -I  https://cloudieexpress.duckdns.org/         # 200, cache-control: no-store
curl -I  https://cloudieexpress.duckdns.org/dashboard # 200, app shell (SPA fallback)
curl -sI https://cloudieexpress.duckdns.org/sw.js    # 200, cache-control: no-cache
sudo certbot renew --dry-run                         # renewal path works
sudo nginx -t                                        # the shipped config parses
```

Then in a browser on the real domain:

1. Landing page renders and assets load (no mixed-content warnings).
2. Sign in with an email OTP — the code arrives and lands on `/dashboard`.
3. Authenticated pages reload correctly on a hard refresh (proof the SPA
   fallback works for deep routes such as `/vtu/airtime`).
4. Public tracking works without sign-in: `/track`.
5. A shared document link (`/d/<slug>`) built from `window.location.origin` opens
   on the new domain.

## Updating the site

```bash
cd ~/cloudieexpress
git pull
sudo ./deploy/release.sh
```

Visitors pick up the new bundle on their next load: `index.html` and `sw.js` are
sent `no-store` / `no-cache`, while `/assets/*` is content-hashed and cached
immutably. To force every client at once after a big change, bump
`CACHE_VERSION` in `public/sw.js` so the service worker discards its old caches.

## Rollback

Releases are directories; the live one is a symlink. Nothing is overwritten.

```bash
ls -1dt /var/www/cloudieexpress/releases/*
sudo ln -sfn /var/www/cloudieexpress/releases/<previous> /var/www/cloudieexpress/current.tmp
sudo mv -Tf /var/www/cloudieexpress/current.tmp /var/www/cloudieexpress/current
```

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Blank page, console shows MIME/`Unexpected token '<'` | an asset 404'd and fell back to HTML | `curl -I` the asset; re-run `deploy/release.sh` (the config returns a real 404 for `/assets/*`) |
| `Did you forget to run convex dev?` or failed queries | `VITE_CONVEX_URL` was wrong/empty at build time | fix the env file, re-run `deploy/release.sh` (the URL is baked into the bundle) |
| `certbot` fails validation | port 80 closed, or DNS not pointing here | open port 80; `dig +short` the domain; re-run `bootstrap.sh` |
| Old UI after a deploy | browser kept the cached shell/service worker | hard-reload once; the shipped config sends `index.html`/`sw.js` uncached |
| HTTP/2 not negotiated | the shipped config uses plain `listen 443 ssl;` to stay valid on every nginx version | add `http2 on;` as the first line of the TLS `server` block (nginx ≥ 1.25.1), then `sudo nginx -t && sudo systemctl reload nginx` |

### DuckDNS specifics

- No wildcard DNS, so tenant sites stay on their canonical hosts:
  `<tenant>.g0ki.com` or the path form `/site/<id>/banking`. A host such as
  `cloudieexpress.duckdns.org` is treated as an app host, never as a tenant
  subdomain (see `src/lib/tenantHost.ts` and `src/convex/tenantResolver.ts`).
- Keep the DuckDNS updater running on the VPS (a cron entry calling the same
  `.../update?...&ip=` URL, every 5 minutes) if your provider can change the
  public IP.
- If outbound port 80 is blocked, use a DNS-01 challenge instead:
  `certbot certonly --manual --preferred-challenges dns -d cloudieexpress.duckdns.org`,
  publishing the given TXT value with
  `curl "https://www.duckdns.org/update?domains=cloudieexpress&token=<TOKEN>&txt=<value>&clear=true"`.
