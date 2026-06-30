#!/usr/bin/env bash
# Nexlify IPTV Panel — one-command install
#
#   curl -fsSL 'https://nexlify.live/install/panel.sh?v=177' | sudo bash -s -- --domain YOUR_IP_OR_DOMAIN
#
# Then open the login URL, sign in with the admin password shown at the end,
# and paste your license key under Admin → License.
#
# Env overrides: PANEL_DIR, PANEL_ARCHIVE_URL, NEXLIFY_LICENSE_KEY
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
PANEL_ARCHIVE_URL="${PANEL_ARCHIVE_URL:-https://nexlify.live/downloads/nexlify-panel.tar.gz}"
PANEL_CACHE_BUST="${PANEL_CACHE_BUST:-v180}"
CREDS_ROOT="/root/nexlify"
DOMAIN=""
EMAIL=""
LICENSE_KEY="${NEXLIFY_LICENSE_KEY:-}"
SKIP_NGINX=0
SKIP_SSL=0
SKIP_FIREWALL=0
FORCE_FRESH=0
MONOLITHIC=0

usage() {
  cat <<'EOF'
Nexlify Panel — Linux installer

Usage:
  curl -fsSL 'https://nexlify.live/install/panel.sh?v=177' | sudo bash -s -- --domain YOUR_IP_OR_DOMAIN

Options:
  --domain HOST          Server IP or domain (required)
  --email EMAIL          Optional — enables HTTPS when DNS points here
  --license KEY          Optional — activate during install (default: enter in panel after login)
  --fresh                Wipe /opt/nexlify-panel before install
  --skip-nginx           Do not configure nginx
  --skip-ssl             HTTP only (no certbot)
  --skip-firewall        Do not open ufw ports
  --monolithic           Panel + stream engine on this host (main server + local agent)
  -h, --help             Show this help

Examples:
  curl -fsSL 'https://nexlify.live/install/panel.sh?v=177' | sudo bash -s -- --domain YOUR_IP_OR_DOMAIN
  curl -fsSL 'https://nexlify.live/install/panel.sh?v=177' | sudo bash -s -- --domain panel.example.com --email you@example.com
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
    --fresh) FORCE_FRESH=1; shift ;;
    --monolithic) MONOLITHIC=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

log() { echo ""; echo "==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

[ -n "$DOMAIN" ] || die "--domain is required (your server IP or hostname, e.g. 203.0.113.10 or panel.example.com)"

case "$PANEL_ARCHIVE_URL" in
  *\?*) ;;
  *) PANEL_ARCHIVE_URL="${PANEL_ARCHIVE_URL}?${PANEL_CACHE_BUST}" ;;
esac

INSTALL_LOG="/tmp/nexlify-install-$$.log"
: > "$INSTALL_LOG"
INSTALL_TOTAL=10
INSTALL_STEP=0

progress_step() {
  INSTALL_STEP=$((INSTALL_STEP + 1))
  local label="$*"
  local pct=$((INSTALL_STEP * 100 / INSTALL_TOTAL))
  local width=36
  local n=$((pct * width / 100))
  [ "$n" -gt "$width" ] && n=$width
  local bar pad
  bar="$(printf '%*s' "$n" '' | tr ' ' '#')"
  pad="$(printf '%*s' "$((width - n))" '' | tr ' ' '-')"
  echo ""
  echo "[$bar$pad] ${pct}%  $label"
}

quiet_step() {
  local label="$1"
  shift
  progress_step "$label"
  if ! "$@" >>"$INSTALL_LOG" 2>&1; then
    echo "" >&2
    echo "ERROR: $label failed. Last output:" >&2
    tail -40 "$INSTALL_LOG" >&2
    return 1
  fi
  return 0
}

ensure_admin_password_script() {
  local target="$PANEL_DIR/scripts/set-admin-password.cjs"
  [ -f "$target" ] && return 0
  mkdir -p "$PANEL_DIR/scripts"
  log "Installing scripts/set-admin-password.cjs (bundled with installer)"
  cat > "$target" <<'SETADMINEOF'
#!/usr/bin/env node
/** Set admin panel password after db:seed (used by install-linux.sh). */
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

async function main() {
  const pass = process.env.ADMIN_PASS || "changeme";
  const prisma = new PrismaClient();
  try {
    const hash = await bcrypt.hash(pass, 10);
    await prisma.panelUser.update({
      where: { username: "admin" },
      data: { passwordHash: hash },
    });
    console.log("Admin password updated");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
SETADMINEOF
  chmod 644 "$target"
}

set_admin_password() {
  ensure_admin_password_script
  [ -f scripts/set-admin-password.cjs ] || die "Could not create scripts/set-admin-password.cjs"
  ADMIN_PASS="$ADMIN_PASS" node scripts/set-admin-password.cjs
}

if [ "$(id -u)" -ne 0 ]; then
  die "Run as root: sudo bash install-linux.sh ..."
fi

mkdir -p "$CREDS_ROOT"
chmod 700 "$CREDS_ROOT"

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

progress_step "Installing system packages"
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

panel_install_complete() {
  local f
  for f in \
    "$PANEL_DIR/package.json" \
    "$PANEL_DIR/package-lock.json" \
    "$PANEL_DIR/.env.example" \
    "$PANEL_DIR/prisma/schema.prisma" \
    "$PANEL_DIR/scripts/pm2-start.sh" \
    "$PANEL_DIR/scripts/set-admin-password.cjs" \
    "$PANEL_DIR/scripts/sync-license-env.mjs" \
    "$PANEL_DIR/scripts/ensure-panel-env.sh" \
    "$PANEL_DIR/scripts/verify-install-smoke.sh" \
    "$PANEL_DIR/src/lib/lines.ts" \
    "$PANEL_DIR/src/lib/panel-releases.json" \
    "$PANEL_DIR/nginx/panel.nexlify.live-http-only.conf"
  do
    [ -f "$f" ] || return 1
  done
  grep -q '"name": "nexlify"' "$PANEL_DIR/package.json" 2>/dev/null
}

panel_missing_files() {
  local f missing=""
  for f in \
    "$PANEL_DIR/package.json" \
    "$PANEL_DIR/package-lock.json" \
    "$PANEL_DIR/.env.example" \
    "$PANEL_DIR/prisma/schema.prisma" \
    "$PANEL_DIR/scripts/pm2-start.sh" \
    "$PANEL_DIR/scripts/set-admin-password.cjs" \
    "$PANEL_DIR/scripts/sync-license-env.mjs" \
    "$PANEL_DIR/scripts/ensure-panel-env.sh" \
    "$PANEL_DIR/scripts/verify-install-smoke.sh" \
    "$PANEL_DIR/src/lib/lines.ts" \
    "$PANEL_DIR/src/lib/panel-releases.json" \
    "$PANEL_DIR/nginx/panel.nexlify.live-http-only.conf"
  do
    [ -f "$f" ] || missing="${missing}\n  - ${f#$PANEL_DIR/}"
  done
  printf '%b' "$missing"
}

download_panel_archive() {
  [ -n "${PANEL_ARCHIVE_URL:-}" ] || die "PANEL_ARCHIVE_URL not set"
  tmp="$(mktemp)"
  curl -fL "$PANEL_ARCHIVE_URL" -o "$tmp"
  archive_bytes="$(wc -c < "$tmp" | tr -d ' ')"
  if [ "$archive_bytes" -lt 2000000 ]; then
    rm -f "$tmp"
    die "Panel archive too small (${archive_bytes} bytes) from $PANEL_ARCHIVE_URL — expected ~3MB."
  fi
  rm -rf "$PANEL_DIR"
  mkdir -p "$PANEL_DIR"
  tar -xzf "$tmp" -C "$PANEL_DIR"
  rm -f "$tmp"
}

if [ "$FORCE_FRESH" -eq 1 ] && [ -e "$PANEL_DIR" ]; then
  rm -rf "$PANEL_DIR"
fi

if panel_install_complete; then
  progress_step "Using existing panel copy"
elif [ -e "$PANEL_DIR" ]; then
  echo "WARN: Incomplete panel at $PANEL_DIR — downloading fresh copy"
  rm -rf "$PANEL_DIR"
fi

if [ ! -f "$PANEL_DIR/package.json" ]; then
  progress_step "Downloading panel"
  download_panel_archive
fi

cd "$PANEL_DIR"
[ -f package.json ] || die "Invalid panel directory (package.json missing)"
panel_install_complete || die "Panel archive incomplete after extract. Missing:$(panel_missing_files)\nRun: sudo rm -rf $PANEL_DIR && re-run with --fresh"
ensure_admin_password_script

find scripts -name '*.sh' -exec sed -i 's/\r$//' {} + 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true

progress_step "Configuring PostgreSQL"
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
CREDS_FILE="$CREDS_ROOT/install-credentials"
DOMAIN="${DOMAIN:-$(hostname -f 2>/dev/null || echo localhost)}"

# Raw IP installs: panel on port 80 directly — no nginx, no internal :3000.
if [[ "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  SKIP_SSL=1
  echo "NOTE: IP install — panel on http://${DOMAIN}/ (port 80, no :3000)."
fi

if [ -f "$PANEL_DIR/scripts/panel-port-config.sh" ]; then
  # shellcheck source=scripts/panel-port-config.sh
  . "$PANEL_DIR/scripts/panel-port-config.sh"
elif [ -f scripts/panel-port-config.sh ]; then
  # shellcheck source=scripts/panel-port-config.sh
  . scripts/panel-port-config.sh
fi

if [ "${NEXLIFY_USE_NGINX:-1}" = "0" ]; then
  SKIP_NGINX=1
fi

CREDS_ROOT_FILE="$CREDS_FILE"

resolve_panel_urls() {
  if [ -f "/etc/letsencrypt/live/${DOMAIN}/fullchain.pem" ]; then
    PANEL_BASE_URL="https://${DOMAIN}"
    PANEL_PUBLIC_PORT=443
  else
    PANEL_BASE_URL="http://${DOMAIN}"
    PANEL_PUBLIC_PORT=80
  fi
  LOGIN_URL="${PANEL_BASE_URL}/login"
}

write_credentials_kv() {
  resolve_panel_urls
  local stream_port iptv_url
  stream_port="$(grep '^STREAM_HTTP_PORT=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' || echo 8080)"
  [ -z "$stream_port" ] && stream_port=8080
  if [ "$stream_port" = "80" ]; then
    iptv_url="${PANEL_BASE_URL}"
  else
    iptv_url="http://${DOMAIN}:${stream_port}"
  fi
  cat <<CREDS
domain=$DOMAIN
panel_url=$PANEL_BASE_URL
login_url=$LOGIN_URL
iptv_url=$iptv_url
stream_http_port=$stream_port
panel_dir=$PANEL_DIR
panel_port=${NEXLIFY_PANEL_LISTEN_PORT:-13000}
website_port=${NEXLIFY_WEBSITE_UPSTREAM_PORT:-13001}
nginx_http_port=80
nginx_https_port=443
panel_public_port=$PANEL_PUBLIC_PORT
panel_mode=$([ "${NEXLIFY_USE_NGINX:-1}" = "0" ] && echo direct_port_80 || echo nginx_proxy)
admin_user=admin
admin_password=$ADMIN_PASS
postgres_host=localhost
postgres_port=5432
postgres_user=nexlify
postgres_password=$PG_PASS
postgres_database=nexlify
license_key=${LICENSE_KEY:-not_set_at_install}
install_status=${INSTALL_STATUS:-in_progress}
installed_at=$(date -u +%Y-%m-%dT%H:%M:%SZ)
CREDS
}

print_install_complete() {
  resolve_panel_urls
  local stream_port iptv_hint
  stream_port="$(grep '^STREAM_HTTP_PORT=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '\r' || echo 8080)"
  [ -z "$stream_port" ] && stream_port=8080
  if [ "$stream_port" = "80" ]; then
    iptv_hint="IPTV / Smarters: ${PANEL_BASE_URL}  (port 80 — use your line username/password)"
  elif [ "$PANEL_PUBLIC_PORT" = "443" ]; then
    iptv_hint="IPTV HTTPS: https://${DOMAIN}:443  ·  IPTV HTTP edge: http://${DOMAIN}:${stream_port}  (or http://SERVER_IP:${stream_port})"
  else
    iptv_hint="IPTV / Smarters: http://${DOMAIN}:${stream_port}  (line username/password; domain installs also use https on :443 when SSL is enabled)"
  fi
  echo ""
  echo "================================================================"
  echo " Nexlify Panel — installation complete"
  echo "================================================================"
  echo ""
  echo " 1. Open:   $LOGIN_URL"
  echo " 2. Login:  admin / $ADMIN_PASS"
  echo " 3. License: Admin → License → paste your NXLF1 key"
  echo ""
  echo " IPTV:      $iptv_hint"
  echo " Firewall: ports 22, 80, 443, ${stream_port}, 1935, 554 opened (UFW)"
  echo ""
  echo " Database:  nexlify / $PG_PASS  (localhost:5432)"
  echo " Saved to:  $CREDS_FILE"
  echo "================================================================"
  echo ""
}

save_install_credentials() {
  INSTALL_STATUS="${1:-saved}"
  mkdir -p "$CREDS_ROOT"
  chmod 700 "$CREDS_ROOT"
  resolve_panel_urls
  write_credentials_kv > "$CREDS_FILE"
  chmod 600 "$CREDS_FILE"
}

if [ ! -f .env ]; then
  if [ -f .env.example ]; then
    cp .env.example .env
  else
    die "Missing .env.example in $PANEL_DIR — incomplete panel copy. Run: sudo rm -rf $PANEL_DIR  then re-run with --fresh"
  fi
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
set_kv PORT "${NEXLIFY_PANEL_LISTEN_PORT:-13000}"
set_kv PANEL_PORT "${NEXLIFY_PANEL_LISTEN_PORT:-13000}"
set_kv WEBSITE_PORT "${NEXLIFY_WEBSITE_UPSTREAM_PORT:-13001}"
set_kv PANEL_BEHIND_NGINX "${NEXLIFY_PANEL_BEHIND_NGINX:-1}"
set_kv PANEL_BIND_HOST "${NEXLIFY_PANEL_BIND_HOST:-127.0.0.1}"
set_kv PANEL_PUBLIC_PORT "${NEXLIFY_PANEL_PUBLIC_PORT:-80}"
set_kv PANEL_COOKIE_SECURE 0
set_kv NEXLIFY_LICENSE_COOKIE_SECURE 0
set_kv PANEL_PRIMARY_DOMAIN "$DOMAIN"
set_kv NEXT_PUBLIC_PANEL_URL "https://${DOMAIN}"
bash scripts/ensure-panel-env.sh >>"$INSTALL_LOG" 2>&1
set_kv REDIS_URL "redis://localhost:6379"
set_kv NEXLIFY_LICENSE_API_URL "https://nexlify.live"
set_kv NEXLIFY_LICENSE_REQUIRE_ONLINE 0
set_kv NEXLIFY_VENDOR_URL "https://nexlify.live"
set_kv INSTALL_ADMIN_PASSWORD "$ADMIN_PASS"

configure_panel_license_sync() {
  local vendor="${NEXLIFY_VENDOR_URL:-https://nexlify.live}"
  local secret="${INSTALL_PANEL_SYNC_SECRET:-${PANEL_API_SECRET:-}}"
  if [ -z "$secret" ] && command -v curl >/dev/null 2>&1; then
    secret="$(curl -fsSL "${vendor}/install/panel-sync.env?v=167" 2>/dev/null \
      | grep '^PANEL_API_SECRET=' | cut -d= -f2- | tr -d '\r' || true)"
  fi
  if [ -n "$secret" ]; then
    set_kv NEXLIFY_PANEL_API_SECRET "$secret"
    set_kv PANEL_INTERNAL_SECRET "$secret"
    log "Remote license sync enabled (nexlify.live admin can push licenses to this panel)"
  else
    log "NOTE: License sync secret not loaded — admin auto-push may not work until you run fix-panel-license-sync.sh"
  fi
}
configure_panel_license_sync

if [ -n "$LICENSE_KEY" ]; then
  set_kv NEXLIFY_LICENSE_KEY "$LICENSE_KEY"
  node scripts/sync-license-env.mjs >>"$INSTALL_LOG" 2>&1 || true
fi

export NPM_CONFIG_LOGLEVEL=error
export PRISMA_HIDE_UPDATE_MESSAGE=1
export NO_UPDATE_NOTIFIER=1
export CI=1

export NEXT_TELEMETRY_DISABLED=1

quiet_step "Installing npm dependencies" npm ci --no-audit --no-fund --loglevel=error

quiet_step "Applying database schema" bash -c 'npx prisma generate && npx prisma db push --accept-data-loss'

quiet_step "Seeding database" env QUIET_SEED=1 npm run db:seed

progress_step "Setting admin password"
if ! ADMIN_PASS="$ADMIN_PASS" node scripts/set-admin-password.cjs >>"$INSTALL_LOG" 2>&1; then
  die "Failed to set admin password. Check $INSTALL_LOG and run: ADMIN_PASS='...' node scripts/set-admin-password.cjs"
fi

progress_step "Registering main server"
if [ -f scripts/auto-register-server.cjs ]; then
  DOMAIN="$DOMAIN" node scripts/auto-register-server.cjs >>"$INSTALL_LOG" 2>&1 || {
    echo "WARN: Auto-register main server failed — add manually in Admin → Servers" >&2
  }
fi


ensure_build_memory() {
  local mem_kb
  mem_kb="$(awk '/MemAvailable:/ {print $2}' /proc/meminfo 2>/dev/null || echo 0)"
  if [ "${mem_kb:-0}" -lt 2500000 ] && ! swapon --show 2>/dev/null | grep -q .; then
    log "Low RAM — adding 2G swap for build"
    if [ ! -f /swapfile ]; then
      fallocate -l 2G /swapfile 2>/dev/null || dd if=/dev/zero of=/swapfile bs=1M count=2048 status=none
      chmod 600 /swapfile
      mkswap /swapfile >/dev/null
    fi
    swapon /swapfile 2>/dev/null || true
  fi
}

ensure_build_memory
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=3072}"

if ! quiet_step "Building panel" npm run build; then
  save_install_credentials "build_failed"
  die "Panel build failed. Credentials saved to $CREDS_FILE — see errors above, then: cd $PANEL_DIR && npm run build && bash scripts/pm2-start.sh"
fi

progress_step "Starting services"
bash scripts/pm2-start.sh >>"$INSTALL_LOG" 2>&1
bash scripts/pm2-boot-enable.sh >>"$INSTALL_LOG" 2>&1 || true

if [ "$SKIP_NGINX" -eq 0 ] && [ "${NEXLIFY_USE_NGINX:-1}" = "1" ] && [ -n "$DOMAIN" ] && [ "$DOMAIN" != "localhost" ]; then
  mkdir -p /etc/nginx/conf.d
  cp nginx/nexlify-upstream.conf /etc/nginx/conf.d/nexlify-upstream.conf
  NGINX_SITE="/etc/nginx/sites-available/nexlify-panel-${DOMAIN}"
  cp nginx/panel.nexlify.live-http-only.conf "$NGINX_SITE"
  sed -i "s/server_name panel.nexlify.live;/server_name ${DOMAIN};/" "$NGINX_SITE"
  ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/nexlify-panel-${DOMAIN}"
  nginx -t
  systemctl enable nginx
  systemctl start nginx 2>/dev/null || systemctl reload nginx

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

if [ "${NEXLIFY_USE_NGINX:-1}" = "0" ] && command -v systemctl >/dev/null 2>&1; then
  systemctl stop nginx 2>/dev/null || true
  systemctl disable nginx 2>/dev/null || true
  echo "NOTE: nginx stopped — panel serves port 80 directly."
fi

# Refresh env after SSL / port mode
bash scripts/ensure-panel-env.sh >>"$INSTALL_LOG" 2>&1
if [ -n "$LICENSE_KEY" ]; then
  node scripts/sync-license-env.mjs >>"$INSTALL_LOG" 2>&1 || true
  npx tsx scripts/activate-install-license.ts >>"$INSTALL_LOG" 2>&1 || true
fi
bash scripts/panel-restart-safe.sh >>"$INSTALL_LOG" 2>&1 || bash scripts/pm2-start.sh >>"$INSTALL_LOG" 2>&1

if [ "$SKIP_FIREWALL" -eq 0 ]; then
  progress_step "Configuring IPTV ports, nginx stream edge, and firewall"
  bash scripts/installer-finalize-ports.sh >>"$INSTALL_LOG" 2>&1 || {
    echo "WARN: port finalize failed — run: sudo bash scripts/sync-panel-ports.sh" >&2
  }
fi

if [ "$MONOLITHIC" = "1" ]; then
  progress_step "Monolithic profile — main server + local stream agent"
  grep -q '^NEXLIFY_MONOLITHIC=' "$PANEL_DIR/.env" 2>/dev/null && \
    sed -i 's/^NEXLIFY_MONOLITHIC=.*/NEXLIFY_MONOLITHIC=1/' "$PANEL_DIR/.env" || \
    echo "NEXLIFY_MONOLITHIC=1" >> "$PANEL_DIR/.env"
  grep -q '^NEXLIFY_RTMP_ENABLED=' "$PANEL_DIR/.env" 2>/dev/null || \
    echo "NEXLIFY_RTMP_ENABLED=1" >> "$PANEL_DIR/.env"
  chmod +x scripts/install-monolithic-profile.sh scripts/install-local-stream-agent.sh 2>/dev/null || true
  bash scripts/install-monolithic-profile.sh "$DOMAIN" >>"$INSTALL_LOG" 2>&1 || {
    echo "WARN: monolithic server row failed — create Main Server in Admin → Servers" >&2
  }
  bash scripts/install-local-stream-agent.sh >>"$INSTALL_LOG" 2>&1 || {
    echo "WARN: local agent install failed — run: sudo bash scripts/install-local-stream-agent.sh" >&2
  }
fi

PANEL_HEALTH_HOST="127.0.0.1"
PANEL_HEALTH_PORT="${NEXLIFY_PANEL_LISTEN_PORT:-${PORT:-13000}}"
for i in $(seq 1 15); do
  if curl -fsS "http://${PANEL_HEALTH_HOST}:${PANEL_HEALTH_PORT}/api/health" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! bash scripts/verify-install-smoke.sh >>"$INSTALL_LOG" 2>&1; then
  echo "" >&2
  echo "WARN: Post-install smoke check failed (panel may still work). Last log:" >&2
  tail -20 "$INSTALL_LOG" >&2
fi

progress_step "Verifying admin login"
chmod +x scripts/verify-install-login.sh 2>/dev/null || true
node scripts/sync-license-env.mjs >>"$INSTALL_LOG" 2>&1 || true
bash scripts/panel-restart-safe.sh >>"$INSTALL_LOG" 2>&1 || bash scripts/pm2-start.sh >>"$INSTALL_LOG" 2>&1
sleep 3
if ! ADMIN_PASS="$ADMIN_PASS" bash scripts/verify-install-login.sh >>"$INSTALL_LOG" 2>&1; then
  echo "" >&2
  echo "ERROR: Admin login verification failed. Attempting password repair..." >&2
  ADMIN_PASS="$ADMIN_PASS" node scripts/set-admin-password.cjs >>"$INSTALL_LOG" 2>&1 || true
  bash scripts/panel-restart-safe.sh >>"$INSTALL_LOG" 2>&1 || bash scripts/pm2-start.sh >>"$INSTALL_LOG" 2>&1
  sleep 3
  if ! ADMIN_PASS="$ADMIN_PASS" bash scripts/verify-install-login.sh; then
    die "Admin login failed after install. Run on server: cd $PANEL_DIR && ADMIN_PASS='$ADMIN_PASS' bash scripts/reset-panel-admin.sh"
  fi
fi

save_install_credentials "complete"
progress_step "Install complete"
print_install_complete
if [ -z "$LICENSE_KEY" ]; then
  echo "Tip: activate your license after login at ${LOGIN_URL%/login}/admin/license/add"
fi
