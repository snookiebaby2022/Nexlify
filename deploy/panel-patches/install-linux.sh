#!/usr/bin/env bash
# Nexlify IPTV Panel — all-in-one Linux installer (Ubuntu/Debian)
#
# Fresh VPS (downloads panel archive):
#   curl -fsSL https://nexlify.live/install/panel.sh | sudo bash -s -- \
#     --domain panel.example.com --email you@example.com --license XSTR-...
#
# From extracted panel folder:
#   sudo bash scripts/install-linux.sh --domain panel.example.com --email you@example.com
#
# Env overrides: PANEL_DIR, PANEL_ARCHIVE_URL, NEXLIFY_LICENSE_KEY
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
PANEL_ARCHIVE_URL="${PANEL_ARCHIVE_URL:-https://nexlify.live/downloads/nexlify-panel.tar.gz}"
DOMAIN=""
EMAIL=""
LICENSE_KEY="${NEXLIFY_LICENSE_KEY:-}"
SKIP_NGINX=0
SKIP_SSL=0
SKIP_FIREWALL=0

usage() {
  cat <<'EOF'
Nexlify Panel — Linux installer

Usage:
  sudo bash install-linux.sh [options]

Options:
  --domain HOST          Public hostname (e.g. panel.example.com) — required for nginx
  --email EMAIL          Let's Encrypt contact (enables HTTPS when DNS points here)
  --license KEY          Nexlify license key (XSTR-...)
  --dir PATH             Install directory (default: /opt/nexlify-panel)
  --archive-url URL      Panel tarball (default: nexlify.live/downloads/nexlify-panel.tar.gz)
  --skip-nginx           Do not configure nginx
  --skip-ssl             HTTP only (no certbot)
  --skip-firewall        Do not open ufw ports
  -h, --help             Show this help

Examples:
  curl -fsSL https://nexlify.live/install/panel.sh | sudo bash -s -- \
    --domain panel.example.com --email ops@example.com --license XSTR-XXXX
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --email) EMAIL="${2:-}"; shift 2 ;;
    --license) LICENSE_KEY="${2:-}"; shift 2 ;;
    --dir) PANEL_DIR="${2:-}"; shift 2 ;;
    --archive-url) PANEL_ARCHIVE_URL="${2:-}"; shift 2 ;;
    --skip-nginx) SKIP_NGINX=1; shift ;;
    --skip-ssl) SKIP_SSL=1; shift ;;
    --skip-firewall) SKIP_FIREWALL=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

log() { echo ""; echo "==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

if [ "$(id -u)" -ne 0 ]; then
  die "Run as root: sudo bash install-linux.sh ..."
fi

if [ -f /etc/os-release ]; then
  . /etc/os-release
  case "${ID:-}" in
    ubuntu|debian) ;;
    *) echo "WARN: tested on Ubuntu/Debian; continuing on ${ID:-unknown}" ;;
  esac
else
  die "Cannot detect OS (/etc/os-release missing)"
fi

export DEBIAN_FRONTEND=noninteractive

log "Installing system packages"
apt-get update -qq
apt-get install -y -qq curl ca-certificates gnupg nginx postgresql postgresql-contrib \
  redis-server ffmpeg build-essential python3 openssl rsync

if ! command -v node >/dev/null 2>&1 || [ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt 20 ]; then
  log "Installing Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y -qq nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  log "Installing PM2"
  npm install -g pm2
fi

if ! command -v certbot >/dev/null 2>&1; then
  apt-get install -y -qq certbot python3-certbot-nginx
fi

mkdir -p "$(dirname "$PANEL_DIR")"

if [ -f "$PANEL_DIR/package.json" ] && grep -q '"name": "nexlify"' "$PANEL_DIR/package.json" 2>/dev/null; then
  log "Using existing panel at $PANEL_DIR"
elif [ -n "${PANEL_ARCHIVE_URL:-}" ]; then
  log "Downloading panel from $PANEL_ARCHIVE_URL"
  tmp="$(mktemp)"
  curl -fL "$PANEL_ARCHIVE_URL" -o "$tmp"
  rm -rf "$PANEL_DIR"
  mkdir -p "$PANEL_DIR"
  tar -xzf "$tmp" -C "$PANEL_DIR"
  rm -f "$tmp"
else
  die "No panel at $PANEL_DIR and PANEL_ARCHIVE_URL not set"
fi

cd "$PANEL_DIR"
[ -f package.json ] || die "Invalid panel directory (package.json missing)"

find scripts -name '*.sh' -exec sed -i 's/\r$//' {} + 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true

log "PostgreSQL database"
PG_PASS="$(openssl rand -hex 16)"
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='nexlify'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE USER nexlify WITH PASSWORD '${PG_PASS}';"
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='nexlify'" | grep -q 1 || \
  sudo -u postgres psql -c "CREATE DATABASE nexlify OWNER nexlify;"
sudo -u postgres psql -c "ALTER USER nexlify WITH PASSWORD '${PG_PASS}';" >/dev/null

JWT_SECRET="$(openssl rand -hex 32)"
CRON_SECRET="$(openssl rand -hex 24)"
BILLING_SECRET="$(openssl rand -hex 24)"
ADMIN_PASS="$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)"
CREDS_FILE="$PANEL_DIR/.install-credentials"
DOMAIN="${DOMAIN:-$(hostname -f 2>/dev/null || echo localhost)}"

if [ ! -f .env ]; then
  cp .env.example .env
fi

set_kv() {
  local k="$1" v="$2"
  if grep -q "^${k}=" .env 2>/dev/null; then
    sed -i "s|^${k}=.*|${k}=${v}|" .env
  else
    echo "${k}=${v}" >> .env
  fi
}

set_kv DATABASE_URL "postgresql://nexlify:${PG_PASS}@localhost:5432/nexlify"
set_kv JWT_SECRET "$JWT_SECRET"
set_kv CRON_SECRET "$CRON_SECRET"
set_kv BILLING_WEBHOOK_SECRET "$BILLING_SECRET"
set_kv PORT 3000
set_kv PANEL_PORT 3000
set_kv WEBSITE_PORT 3001
set_kv STREAM_HTTP_PORT 3001
set_kv PANEL_BEHIND_NGINX 1
set_kv PANEL_BIND_HOST 127.0.0.1
set_kv PANEL_ASSUME_PROXY_SSL 1
set_kv PANEL_PUBLIC_PORT 443
set_kv PANEL_PRIMARY_DOMAIN "$DOMAIN"
set_kv NEXT_PUBLIC_SERVER_URL "https://${DOMAIN}"
set_kv NEXT_PUBLIC_WEBSITE_URL "https://${DOMAIN}"
set_kv REDIS_URL "redis://localhost:6379"
set_kv NEXLIFY_LICENSE_API_URL "https://nexlify.live"
set_kv NEXLIFY_LICENSE_REQUIRE_ONLINE 1

if [ -n "$LICENSE_KEY" ]; then
  set_kv NEXLIFY_LICENSE_KEY "$LICENSE_KEY"
fi

log "Installing npm dependencies"
npm ci

log "Database schema & seed"
npx prisma generate
npx prisma db push
npm run db:seed

log "Setting admin password"
ADMIN_PASS="$ADMIN_PASS" npx tsx -e "
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
const pass = process.env.ADMIN_PASS || 'changeme';
const prisma = new PrismaClient();
const hash = await bcrypt.hash(pass, 10);
await prisma.panelUser.update({ where: { username: 'admin' }, data: { passwordHash: hash } });
await prisma.\$disconnect();
"

log "Building panel"
npm run build

log "PM2 services"
bash scripts/pm2-start.sh
bash scripts/pm2-boot-enable.sh || true

if [ "$SKIP_NGINX" -eq 0 ] && [ -n "$DOMAIN" ] && [ "$DOMAIN" != "localhost" ]; then
  log "Nginx reverse proxy for $DOMAIN"
  mkdir -p /etc/nginx/conf.d
  cp nginx/nexlify-upstream.conf /etc/nginx/conf.d/nexlify-upstream.conf
  NGINX_SITE="/etc/nginx/sites-available/nexlify-panel-${DOMAIN}"
  cp nginx/panel.nexlify.live-http-only.conf "$NGINX_SITE"
  sed -i "s/server_name panel.nexlify.live;/server_name ${DOMAIN};/" "$NGINX_SITE"
  ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/nexlify-panel-${DOMAIN}"
  nginx -t
  systemctl enable nginx
  systemctl reload nginx

  if [ "$SKIP_SSL" -eq 0 ] && [ -n "$EMAIL" ]; then
    log "Let's Encrypt SSL"
    certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$EMAIL" --redirect || \
      echo "WARN: certbot failed — use HTTP until DNS points here, then: certbot --nginx -d $DOMAIN"
    if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
      cp nginx/panel.nexlify.live.conf "$NGINX_SITE"
      sed -i "s/panel.nexlify.live/${DOMAIN}/g" "$NGINX_SITE"
      nginx -t && systemctl reload nginx
    fi
  fi
fi

if [ "$SKIP_FIREWALL" -eq 0 ] && command -v ufw >/dev/null 2>&1; then
  ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  ufw --force enable >/dev/null 2>&1 || true
fi

for i in $(seq 1 15); do
  if curl -fsS "http://127.0.0.1:3000/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

{
  echo "domain=$DOMAIN"
  echo "panel_dir=$PANEL_DIR"
  echo "admin_user=admin"
  echo "admin_password=$ADMIN_PASS"
  echo "postgres_user=nexlify"
  echo "postgres_password=$PG_PASS"
  echo "installed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
} > "$CREDS_FILE"
chmod 600 "$CREDS_FILE"

log "Install complete"
echo ""
echo "============================================"
echo " Nexlify Panel installed"
echo " URL:      https://${DOMAIN}/login  (or http if SSL pending)"
echo " Admin:    admin / (see $CREDS_FILE)"
echo " PM2:      pm2 status"
echo " Logs:     pm2 logs nexlify"
echo " License:  Admin → License (paste your XSTR- key)"
echo "============================================"
if [ -z "$LICENSE_KEY" ]; then
  echo "Set license: edit $PANEL_DIR/.env → NEXLIFY_LICENSE_KEY=..."
  echo "Then: pm2 restart nexlify --update-env"
fi
echo ""
cat "$CREDS_FILE"
