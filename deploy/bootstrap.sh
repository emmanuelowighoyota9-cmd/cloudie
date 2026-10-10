#!/usr/bin/env bash
#
# Provision cloudieexpress.duckdns.org on a Debian/Ubuntu VPS.
#
#   sudo ./deploy/bootstrap.sh                  # full install (DNS must point here) + TLS
#   sudo ./deploy/bootstrap.sh --no-tls         # HTTP only, before DNS propagates
#   sudo EMAIL=you@example.com ./deploy/bootstrap.sh
#
# Order of operations:
#   1. install nginx + certbot (apt)
#   2. create the web root (/var/www/cloudieexpress) and the ACME webroot
#   3. check the domain resolves to this machine's public IP
#   4. install the nginx site + shared header snippet from deploy/nginx/
#   5. issue a Let's Encrypt certificate and switch the site to HTTPS
#
# Idempotent: re-running replaces the config and keeps the existing certificate.
# It does NOT deploy the frontend build — run deploy/release.sh for that.

set -euo pipefail

DOMAIN="${DOMAIN:-cloudieexpress.duckdns.org}"
EMAIL="${EMAIL:-}"
WEBROOT_ROOT="${WEBROOT_ROOT:-/var/www/cloudieexpress}"
ACME_ROOT="${ACME_ROOT:-/var/www/certbot}"
ENV_FILE="${ENV_FILE:-/etc/cloudieexpress/cloudieexpress.env}"
SNIPPET_DEST="/etc/nginx/snippets/cloudieexpress-headers.conf"
SITE_AVAILABLE="/etc/nginx/sites-available/${DOMAIN}"
SITE_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"
DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${DEPLOY_DIR}/.." && pwd)"
TEMPLATE="${DEPLOY_DIR}/nginx/${DOMAIN}.conf"

WITH_TLS=1
for arg in "$@"; do
  case "$arg" in
    --no-tls) WITH_TLS=0 ;;
    -h|--help) sed -n '2,17p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "Unknown option: $arg" >&2; exit 64 ;;
  esac
done

log()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m[!]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[x]\033[0m %s\n' "$*" >&2; exit 1; }

[[ ${EUID} -eq 0 ]] || die "Run as root: sudo $0"
[[ -f "$TEMPLATE" ]] || die "Missing nginx template: $TEMPLATE"
command -v apt-get >/dev/null 2>&1 || die "This script targets Debian/Ubuntu (apt-get not found)."

if [[ "$WITH_TLS" -eq 1 && -z "$EMAIL" ]]; then
  die "TLS needs a contact address for Let's Encrypt. Re-run as:
    sudo EMAIL=you@example.com $0
  or install HTTP first with --no-tls."
fi

export DEBIAN_FRONTEND=noninteractive

log "Installing nginx, certbot and the certbot nginx plugin"
apt-get update -qq
apt-get install -y -qq nginx certbot python3-certbot-nginx curl rsync ca-certificates >/dev/null

log "Creating web root ${WEBROOT_ROOT} and ACME webroot ${ACME_ROOT}"
mkdir -p "${WEBROOT_ROOT}/releases" "${WEBROOT_ROOT}/current" "${ACME_ROOT}/.well-known/acme-challenge"
if [[ ! -e "${WEBROOT_ROOT}/current/index.html" ]]; then
  printf '%s\n' '<!doctype html><title>Cloudie Express</title><p>Deploy in progress — run deploy/release.sh.</p>' \
    > "${WEBROOT_ROOT}/current/index.html"
fi

log "Writing environment file ${ENV_FILE}"
mkdir -p "$(dirname "${ENV_FILE}")"
if [[ ! -f "$ENV_FILE" ]]; then
  install -m 0644 "${DEPLOY_DIR}/env.example" "$ENV_FILE"
  warn "Set VITE_CONVEX_URL in ${ENV_FILE} before running deploy/release.sh"
else
  log "Keeping the existing ${ENV_FILE}"
fi

# ── DNS preflight ───────────────────────────────────────────────────
# DuckDNS holds the duckdns.org zone on its own nameservers and only offers an
# A/AAAA record per subdomain, so the check is a straight IP comparison.
log "Checking that ${DOMAIN} resolves to this server"
SERVER_IP="$(curl -fsS --max-time 10 https://api.ipify.org 2>/dev/null || true)"
if [[ -z "$SERVER_IP" ]]; then
  SERVER_IP="$(curl -fsS --max-time 10 https://ifconfig.me/ip 2>/dev/null || true)"
fi
DOMAIN_IPS="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk '{print $1}' | sort -u | tr '\n' ' ' || true)"

printf '    public IP of this server : %s\n' "${SERVER_IP:-<unknown>}"
printf '    A record for %s : %s\n' "$DOMAIN" "${DOMAIN_IPS:-<none>}"

if [[ -z "${SERVER_IP}" ]]; then
  if [[ "$WITH_TLS" -eq 1 ]]; then
    die "Could not determine this server's public IP (no outbound HTTPS?). Re-run with --no-tls."
  fi
  warn "Public IP unknown — skipping the DNS comparison."
elif [[ "${DOMAIN_IPS}" != *"${SERVER_IP}"* ]]; then
  if [[ "$WITH_TLS" -eq 1 ]]; then
    die "DNS is not pointing here yet. Point cloudieexpress.duckdns.org at ${SERVER_IP}
    (DuckDNS dashboard, or:
       curl \"https://www.duckdns.org/update?domains=cloudieexpress&token=<TOKEN>&ip=${SERVER_IP}\"
    ), wait a minute, then re-run this script.
    To serve plain HTTP now, re-run with --no-tls."
  fi
  warn "DNS does not match this server yet — continuing without TLS."
fi

# ── nginx ───────────────────────────────────────────────────────────
log "Installing ${SNIPPET_DEST}"
install -m 0644 "${DEPLOY_DIR}/nginx/cloudieexpress-headers.conf" "$SNIPPET_DEST"

install_http_only_site() {
  # Temporary HTTP-only site: the ACME challenge must be reachable before a
  # certificate exists.
  cat > "$SITE_AVAILABLE" <<HTTPCONF
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    location /.well-known/acme-challenge/ {
        root ${ACME_ROOT};
        default_type "text/plain";
    }

    location / {
        root ${WEBROOT_ROOT}/current;
        index index.html;
        try_files \$uri \$uri/ /index.html;
    }
}
HTTPCONF
}

install_tls_site() {
  # Copied verbatim with __DOMAIN__ -> the real hostname, so the shipped file
  # stays the single source of truth for the production server block.
  sed "s/__DOMAIN__/${DOMAIN}/g" "$TEMPLATE" > "$SITE_AVAILABLE"

  # The template leans on certbot's shared TLS parameters. They ship with
  # python3-certbot-nginx, but if this installation lacks them an `include`
  # would make `nginx -t` fail — fall back to nginx's own defaults instead.
  if [[ ! -f /etc/letsencrypt/options-ssl-nginx.conf ]]; then
    warn "Missing /etc/letsencrypt/options-ssl-nginx.conf — using nginx TLS defaults"
    sed -i '/options-ssl-nginx.conf/d' "$SITE_AVAILABLE"
  fi
  if [[ ! -f /etc/letsencrypt/ssl-dhparams.pem ]]; then
    warn "Missing /etc/letsencrypt/ssl-dhparams.pem — using nginx DH defaults"
    sed -i '/ssl_dhparam/d' "$SITE_AVAILABLE"
  fi
}

reload_nginx() {
  nginx -t
  if systemctl is-active --quiet nginx; then
    systemctl reload nginx
  else
    systemctl enable --now nginx >/dev/null
  fi
}

# Ordering matters:
#   * with an existing certificate, go straight to the HTTPS block — a re-run
#     must never downgrade a live HTTPS site (or drop the 80 -> 443 redirect);
#   * without one, install the HTTP-only block first: the ACME challenge on
#     port 80 has to be reachable, and an HTTPS block would fail `nginx -t`
#     because the certificate it references does not exist yet.
CERT_PATH="/etc/letsencrypt/live/${DOMAIN}/fullchain.pem"
if [[ -f "$CERT_PATH" ]]; then
  log "Certificate already present — installing the HTTPS site"
  install_tls_site
elif [[ "$WITH_TLS" -eq 1 ]]; then
  log "Installing the HTTP site (ACME preflight)"
  install_http_only_site
else
  log "Installing the HTTP site (no certificate requested)"
  install_http_only_site
fi

ln -sfn "$SITE_AVAILABLE" "$SITE_ENABLED"
if [[ -e /etc/nginx/sites-enabled/default ]]; then
  log "Disabling the default nginx site"
  rm -f /etc/nginx/sites-enabled/default
fi
reload_nginx

# ── certificate ─────────────────────────────────────────────────────
if [[ "$WITH_TLS" -eq 1 ]]; then
  log "Requesting a Let's Encrypt certificate for ${DOMAIN}"
  certbot certonly --webroot -w "$ACME_ROOT" -d "$DOMAIN" \
    --non-interactive --agree-tos -m "$EMAIL" --keep-until-expiring

  log "Switching the site to HTTPS with the issued certificate"
  install_tls_site
  reload_nginx
fi

# ── report ──────────────────────────────────────────────────────────
SCHEME=http
if [[ -f "$CERT_PATH" ]]; then SCHEME=https; fi
CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "${SCHEME}://${DOMAIN}/" || true)"

printf '\n'
log "Done. nginx is serving ${SCHEME}://${DOMAIN} (HTTP ${CODE:-no response})"
cat <<NEXT

Next steps
  1. Edit ${ENV_FILE} and set VITE_CONVEX_URL to the production Convex URL
     (dashboard -> production deployment -> "Convex Deployment URL", looks like
      https://<deployment>.convex.cloud).
  2. Publish the frontend:
       cd ${REPO_DIR} && sudo ./deploy/release.sh
  3. Confirm certificate auto-renewal:
       sudo certbot renew --dry-run
NEXT

if [[ "$WITH_TLS" -eq 0 ]]; then
  warn "Running HTTP only. Re-run with an EMAIL once DNS points here to add TLS."
fi
