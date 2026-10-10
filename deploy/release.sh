#!/usr/bin/env bash
#
# Build the frontend and publish it to the nginx web root.
#
#   sudo ./deploy/release.sh
#
# Reads /etc/cloudieexpress/cloudieexpress.env (see deploy/env.example) for the
# domain, web root and the production Convex URL, then:
#
#   1. installs dependencies and runs the production build (tsc -b && vite build)
#   2. copies dist/ into a timestamped release directory
#   3. atomically flips the `current` symlink nginx serves
#   4. keeps the last 5 releases and prunes the rest
#   5. verifies the live domain: / and a deep route must both return HTTP 200
#
# Rollback is a symlink flip — see deploy/README.md.

set -euo pipefail

ENV_FILE="${ENV_FILE:-/etc/cloudieexpress/cloudieexpress.env}"
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${DEPLOY_DIR}/.." && pwd)"
KEEP_RELEASES="${KEEP_RELEASES:-5}"

log()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

[[ ${EUID} -eq 0 ]] || die "Run as root: sudo $0"
[[ -f "$ENV_FILE" ]] || die "Missing $ENV_FILE — copy deploy/env.example there and fill it in."
command -v npm >/dev/null 2>&1 || die "npm not found. Install Node.js 20+ on this server."

# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

DOMAIN="${DOMAIN:-cloudieexpress.duckdns.org}"
WEBROOT_ROOT="${WEBROOT_ROOT:-/var/www/cloudieexpress}"
VITE_CONVEX_URL="${VITE_CONVEX_URL:-}"

[[ -n "$VITE_CONVEX_URL" ]] || die "VITE_CONVEX_URL is empty in $ENV_FILE."
[[ "$VITE_CONVEX_URL" != *"example-deployment"* ]] || die "VITE_CONVEX_URL in $ENV_FILE is still the placeholder."
[[ "$VITE_CONVEX_URL" == https://* ]] || die "VITE_CONVEX_URL must be an https URL (got: $VITE_CONVEX_URL)."
[[ -d "$WEBROOT_ROOT" ]] || die "$WEBROOT_ROOT does not exist — run deploy/bootstrap.sh first."

log "Building in ${REPO_DIR} against ${VITE_CONVEX_URL}"
cd "$REPO_DIR"
npm install --legacy-peer-deps --no-audit --no-fund --prefer-offline
VITE_CONVEX_URL="$VITE_CONVEX_URL" npm run build

[[ -f "$REPO_DIR/dist/index.html" ]] || die "Build produced no dist/index.html."
[[ -d "$REPO_DIR/dist/assets" ]] || die "Build produced no dist/assets — is this a real Vite build?"
grep -q '<div id="root">' "$REPO_DIR/dist/index.html" || die "dist/index.html does not look like the app shell."

STAMP="$(date -u +%Y%m%d-%H%M%S)"
RELEASE="${WEBROOT_ROOT}/releases/${STAMP}"
log "Publishing release ${STAMP}"
mkdir -p "$RELEASE"
cp -a "$REPO_DIR/dist/." "$RELEASE/"

# Atomic swap: nginx keeps serving the old release until the symlink flips.
ln -sfn "$RELEASE" "${WEBROOT_ROOT}/current.tmp"
mv -Tf "${WEBROOT_ROOT}/current.tmp" "${WEBROOT_ROOT}/current"

log "Pruning old releases (keeping ${KEEP_RELEASES})"
# shellcheck disable=SC2012
ls -1dt "${WEBROOT_ROOT}"/releases/*/ 2>/dev/null | tail -n "+$((KEEP_RELEASES + 1))" | xargs -r rm -rf

log "Verifying https://${DOMAIN}"
FAILED=0
check_route() {
  local path="$1" label="$2" out code
  out="$(curl -sS --max-time 15 -w '\n%{http_code}' "https://${DOMAIN}${path}" || true)"
  code="$(printf '%s' "$out" | tail -n1)"
  if [[ "$code" != "200" ]]; then
    warn "${label} (${path}) returned HTTP ${code:-none}"
    FAILED=1
    return
  fi
  if ! printf '%s' "$out" | grep -q '<div id="root">'; then
    warn "${label} (${path}) returned 200 but not the app shell (SPA fallback problem?)"
    FAILED=1
    return
  fi
  log "${label} (${path}) → 200, app shell served"
}

check_route "/" "home"
check_route "/dashboard" "deep route"

if [[ "$FAILED" -ne 0 ]]; then
  die "Release published but live verification failed. nginx or DNS is the suspect."
fi

log "Release ${STAMP} is live at https://${DOMAIN}"
