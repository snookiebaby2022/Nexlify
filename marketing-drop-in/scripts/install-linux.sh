#!/usr/bin/env bash
# Nexlify IPTV Panel — one-command install
#
#   curl -fsSL 'https://nexlify.live/install/panel.sh?v=2.0.22' | sudo bash
#
# Server IP/hostname is detected automatically. Then open the login URL, sign in
# with the admin password shown at the end, and paste your license key under Admin → License.
#
# Env overrides: PANEL_DIR, PANEL_ARCHIVE_URL, NEXLIFY_LICENSE_KEY
set -euo pipefail

# Empty = auto: reuse an existing panel, otherwise install to /home/nexlify.
PANEL_DIR="${PANEL_DIR:-}"
PANEL_ARCHIVE_URL="${PANEL_ARCHIVE_URL:-https://nexlify.live/downloads/nexlify-panel.tar.gz}"
_SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$_SCRIPT_DIR/panel-version.sh" ]; then
  _PV="$(bash "$_SCRIPT_DIR/panel-version.sh" 2>/dev/null || echo 0)"
else
  _PV="0"
fi
PANEL_CACHE_BUST="${PANEL_CACHE_BUST:-v${_PV}}"
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
  curl -fsSL 'https://nexlify.live/install/panel.sh?v=2.0.22' | sudo bash

Options:
  --ip IP                Override auto-detected server IP or hostname
  --domain DOMAIN        Alias for --ip
  --email EMAIL          Email for Let's Encrypt SSL (domain installs only)
  --license KEY          Optional — activate during install (default: enter in panel after login)
  --dir PATH             Install directory (default: /home/nexlify)
  --fresh                Wipe the install directory before install (keeps /home/nexlify/bin)
  --skip-firewall        Do not open ufw ports
  --monolithic           Panel + stream engine on this host (main server + local agent)
  -h, --help             Show this help

Examples:
  curl -fsSL 'https://nexlify.live/install/panel.sh?v=2.0.22' | sudo bash
  curl -fsSL 'https://nexlify.live/install/panel.sh?v=2.0.22' | sudo bash -s -- --license NXLF1-XXXXX
  curl -fsSL 'https://nexlify.live/install/panel.sh?v=2.0.22' | sudo bash -s -- --domain panel.example.com --email admin@example.com
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --ip|--domain) DOMAIN="${2:-}"; shift 2 ;;
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

is_nexlify_panel_root() {
  [ -f "$1/package.json" ] || return 1
  grep -q '"name": "nexlify"' "$1/package.json" 2>/dev/null || return 1
  grep -q '"name": "nexlify-marketing"' "$1/package.json" 2>/dev/null && return 1
  return 0
}

wipe_panel_tree() {
  local d="${1:-}"
  [ -n "$d" ] && [ -e "$d" ] || return 0
  if [ -d "$d/bin" ]; then
    local hold
    hold="$(mktemp -d /tmp/nexlify-bin-XXXXXX)"
    mv "$d/bin" "$hold/bin"
    rm -rf "$d"
    mkdir -p "$d"
    mv "$hold/bin" "$d/bin"
    rmdir "$hold" 2>/dev/null || true
  else
    rm -rf "$d"
  fi
}

if [ -z "$PANEL_DIR" ]; then
  for candidate in /home/nexlify /home/nexlify-panel /opt/nexlify-panel; do
    if is_nexlify_panel_root "$candidate"; then
      PANEL_DIR="$candidate"
      break
    fi
  done
  PANEL_DIR="${PANEL_DIR:-/home/nexlify}"
fi

# Refuse to re-run customer installer on the vendor VPS (marketing + panel.nexlify.live).
# Re-running panel.sh here rotates DB passwords against the wrong Postgres and forces PORT=80.
refuse_vendor_vps_reinstall() {
  if [ "${NEXLIFY_ALLOW_VENDOR_REINSTALL:-}" = "1" ]; then
    return 0
  fi
  local vendor=0
  if [ -d /var/www/nexlify ] && [ -f /var/www/nexlify/package.json ]; then
    vendor=1
  fi
  if [ -f /etc/nginx/sites-enabled/nexlify.live ] || [ -f /etc/nginx/sites-enabled/panel.nexlify.live ]; then
    vendor=1
  fi
  if [ "$vendor" -eq 1 ] && is_nexlify_panel_root "$PANEL_DIR"; then
    die "This host looks like the Nexlify vendor VPS (nexlify.live / panel.nexlify.live already present).
Do not run panel.sh here — it overwrites the live panel and can break Postgres auth.

Update vendor panel:  cd /home/nexlify-panel && git fetch origin main && git reset --hard origin/main && bash scripts/deploy-vps.sh panel
Update marketing:     curl -fsSL https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main/scripts/update-marketing-on-vps.sh | sudo bash

Override only if you really mean it: NEXLIFY_ALLOW_VENDOR_REINSTALL=1"
  fi
}

# Apply nexlify role password on the Postgres that actually listens on host:port
# (vendor VPS: Docker on :5432, system cluster often on :5433 — sudo -u postgres hits 5433).
pg_exec_on_port() {
  local port="$1"
  shift
  local sql="$*"
  local cid="" cluster=""

  if command -v docker >/dev/null 2>&1; then
    cid="$(docker ps -q --filter "publish=${port}" 2>/dev/null | head -1 || true)"
    if [ -z "$cid" ]; then
      cid="$(docker ps --format '{{.ID}} {{.Names}}' 2>/dev/null | awk '/postgres/{print $1; exit}' || true)"
    fi
    if [ -n "$cid" ]; then
      if docker exec "$cid" psql -U nexlify -d postgres -v ON_ERROR_STOP=1 -c "$sql" >/dev/null 2>&1; then
        return 0
      fi
      if docker exec "$cid" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -c "$sql" >/dev/null 2>&1; then
        return 0
      fi
    fi
  fi

  if command -v pg_lsclusters >/dev/null 2>&1; then
    cluster="$(pg_lsclusters -h 2>/dev/null | awk -v p="$port" '$3 == p && $4 == "online" { print $1 "/" $2; exit }')"
    if [ -n "$cluster" ]; then
      sudo -u postgres psql --cluster "$cluster" -v ON_ERROR_STOP=1 -c "$sql" >/dev/null
      return $?
    fi
  fi

  if sudo -u postgres psql -p "$port" -v ON_ERROR_STOP=1 -c "$sql" >/dev/null 2>&1; then
    return 0
  fi
  sudo -u postgres psql -v ON_ERROR_STOP=1 -c "$sql" >/dev/null
}

pg_test_url() {
  local url="$1"
  command -v psql >/dev/null 2>&1 || return 1
  PGPASSWORD="$(python3 - "$url" <<'PY'
import sys, urllib.parse
u = urllib.parse.urlparse(sys.argv[1])
print(urllib.parse.unquote(u.password or ""))
PY
)" \
  psql "$url" -v ON_ERROR_STOP=1 -c 'SELECT 1' >/dev/null 2>&1
}

detect_server_address() {
  local ip fqdn
  if command -v curl >/dev/null 2>&1; then
    for url in "https://api.ipify.org" "https://ifconfig.me/ip" "https://icanhazip.com"; do
      ip="$(curl -fsSL --max-time 8 "$url" 2>/dev/null | tr -d '[:space:]' || true)"
      if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        echo "$ip"
        return 0
      fi
    done
  fi
  if command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
    if [[ "$ip" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
      echo "$ip"
      return 0
    fi
    fqdn="$(hostname -f 2>/dev/null || true)"
    if [ -n "$fqdn" ] && [ "$fqdn" != "localhost" ]; then
      echo "$fqdn"
      return 0
    fi
  fi
  echo "localhost"
}

if [ -z "$DOMAIN" ]; then
  log "Detecting server address..."
  DOMAIN="$(detect_server_address)"
  log "Using server address: $DOMAIN"
fi

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
apt-get install -y -qq curl ca-certificates gnupg nginx postgresql postgresql-contrib postgresql-client \
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
  wipe_panel_tree "$PANEL_DIR"
  mkdir -p "$PANEL_DIR"
  tar -xzf "$tmp" -C "$PANEL_DIR"
  rm -f "$tmp"
}

refuse_vendor_vps_reinstall

if [ "$FORCE_FRESH" -eq 1 ] && [ -e "$PANEL_DIR" ]; then
  wipe_panel_tree "$PANEL_DIR"
fi

# For --fresh, also drop and recreate the PostgreSQL database so migrations deploy cleanly.
if [ "$FORCE_FRESH" -eq 1 ]; then
  log "Fresh install — dropping existing database (if any)"
  pg_exec_on_port 5432 "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='nexlify';" || true
  pg_exec_on_port 5432 "DROP DATABASE IF EXISTS nexlify WITH (FORCE);" || \
    pg_exec_on_port 5432 "DROP DATABASE IF EXISTS nexlify;" || true
fi

if panel_install_complete; then
  progress_step "Using existing panel copy"
elif [ -e "$PANEL_DIR" ]; then
  echo "WARN: Incomplete panel at $PANEL_DIR — downloading fresh copy"
  wipe_panel_tree "$PANEL_DIR"
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
PG_HOST="127.0.0.1"
PG_PORT="5432"
KEEP_EXISTING_DB=0
EXISTING_DB_URL=""
if [ -f .env ]; then
  EXISTING_DB_URL="$(grep -E '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '\r' | sed -e 's/^"//' -e 's/"$//' -e "s/^'//" -e "s/'$//")"
  if [ -n "$EXISTING_DB_URL" ] && pg_test_url "$EXISTING_DB_URL"; then
    KEEP_EXISTING_DB=1
    PG_PASS="$(python3 - "$EXISTING_DB_URL" <<'PY'
import sys, urllib.parse
u = urllib.parse.urlparse(sys.argv[1])
print(urllib.parse.unquote(u.password or ""))
PY
)"
    PG_HOST="$(python3 - "$EXISTING_DB_URL" <<'PY'
import sys, urllib.parse
u = urllib.parse.urlparse(sys.argv[1])
print(u.hostname or "127.0.0.1")
PY
)"
    PG_PORT="$(python3 - "$EXISTING_DB_URL" <<'PY'
import sys, urllib.parse
u = urllib.parse.urlparse(sys.argv[1])
print(u.port or 5432)
PY
)"
    echo "NOTE: Keeping existing DATABASE_URL (Postgres auth already works on ${PG_HOST}:${PG_PORT})."
  fi
fi
if [ "$KEEP_EXISTING_DB" -ne 1 ]; then
  PG_PASS="$(openssl rand -hex 16)"
  pg_exec_on_port "$PG_PORT" "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='nexlify') THEN CREATE USER nexlify WITH PASSWORD '${PG_PASS}'; END IF; END \$\$;" || \
    die "Could not ensure Postgres role nexlify on port ${PG_PORT}"
  pg_exec_on_port "$PG_PORT" "ALTER USER nexlify WITH PASSWORD '${PG_PASS}';" || \
    die "Could not set Postgres password for role nexlify on port ${PG_PORT}. Check Docker/system Postgres."
  # CREATE DATABASE cannot run inside DO blocks — create if missing (ignore already-exists).
  pg_exec_on_port "$PG_PORT" "CREATE DATABASE nexlify OWNER nexlify;" 2>/dev/null || true
  PGPASSWORD="$PG_PASS" psql -h "$PG_HOST" -p "$PG_PORT" -U nexlify -d nexlify -c 'SELECT 1' >/dev/null 2>&1 || \
    die "Postgres password was set but auth still fails on ${PG_HOST}:${PG_PORT} (is another Postgres bound to that port?)."
fi
if [ -x "$PANEL_DIR/scripts/ensure-pg-dump.sh" ]; then
  ENSURE_PG_DUMP_REQUIRED=0 bash "$PANEL_DIR/scripts/ensure-pg-dump.sh" || true
elif [ -x scripts/ensure-pg-dump.sh ]; then
  ENSURE_PG_DUMP_REQUIRED=0 bash scripts/ensure-pg-dump.sh || true
fi

JWT_SECRET="$(openssl rand -hex 32)"
CRON_SECRET="$(openssl rand -hex 24)"
BILLING_SECRET="$(openssl rand -hex 24)"
ADMIN_PASS="$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)"
CREDS_FILE="$CREDS_ROOT/install-credentials"
# Raw IP installs: panel on port 80 directly — no nginx, no internal :3000.
if [[ "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  SKIP_SSL=1
  SKIP_NGINX=1
  NEXLIFY_USE_NGINX=0
  echo "NOTE: IP install — panel on http://${DOMAIN}/ (port 80, no nginx)."
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

set_kv DATABASE_URL "postgresql://nexlify:${PG_PASS}@${PG_HOST}:${PG_PORT}/nexlify"
set_kv JWT_SECRET "$JWT_SECRET"
set_kv CRON_SECRET "$CRON_SECRET"
set_kv BILLING_WEBHOOK_SECRET "$BILLING_SECRET"
if [[ "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || [ "${NEXLIFY_USE_NGINX:-1}" = "0" ]; then
  set_kv PORT "${NEXLIFY_PANEL_LISTEN_PORT:-80}"
  set_kv PANEL_PORT "${NEXLIFY_PANEL_LISTEN_PORT:-80}"
  set_kv PANEL_BIND_HOST "0.0.0.0"
  set_kv PANEL_BEHIND_NGINX "0"
  set_kv PANEL_PUBLIC_PORT "80"
else
  set_kv PORT "${NEXLIFY_PANEL_LISTEN_PORT:-13000}"
  set_kv PANEL_PORT "${NEXLIFY_PANEL_LISTEN_PORT:-13000}"
  set_kv PANEL_BIND_HOST "${NEXLIFY_PANEL_BIND_HOST:-127.0.0.1}"
  set_kv PANEL_BEHIND_NGINX "${NEXLIFY_PANEL_BEHIND_NGINX:-1}"
  set_kv PANEL_PUBLIC_PORT "${NEXLIFY_PANEL_PUBLIC_PORT:-80}"
fi
set_kv WEBSITE_PORT "${NEXLIFY_WEBSITE_UPSTREAM_PORT:-13001}"
set_kv PANEL_COOKIE_SECURE 0
set_kv NEXLIFY_LICENSE_COOKIE_SECURE 0
set_kv PANEL_PRIMARY_DOMAIN "$DOMAIN"
if [[ "$DOMAIN" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  set_kv NEXT_PUBLIC_SERVER_URL "http://${DOMAIN}"
else
  set_kv NEXT_PUBLIC_SERVER_URL "http://${DOMAIN}"
fi
bash scripts/ensure-panel-env.sh >>"$INSTALL_LOG" 2>&1
set_kv REDIS_URL "redis://localhost:6379"
set_kv NEXLIFY_LICENSE_API_URL "https://nexlify.live"
set_kv NEXLIFY_LICENSE_REQUIRE_ONLINE 1
set_kv NEXLIFY_VENDOR_URL "https://nexlify.live"
set_kv INSTALL_ADMIN_PASSWORD "$ADMIN_PASS"

# Generate encryption-at-rest key for AES-256-GCM license storage
if ! grep -q '^ENCRYPTION_AT_REST_KEY=' .env 2>/dev/null; then
  _enc_key="$(openssl rand -hex 32 2>/dev/null || head -c 64 /dev/urandom | od -An -tx1 | tr -d ' \n' | head -c 64)"
  set_kv ENCRYPTION_AT_REST_KEY "$_enc_key"
  log "Generated ENCRYPTION_AT_REST_KEY"
fi

configure_panel_license_sync() {
  local secret="${INSTALL_PANEL_SYNC_SECRET:-${PANEL_API_SECRET:-}}"
  # Unique per install. Never download a shared secret from the vendor website.
  if [ -z "$secret" ]; then
    secret="$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n')"
    log "Generated unique PANEL_API_SECRET (set INSTALL_PANEL_SYNC_SECRET to use vendor remote-update)"
  fi
  set_kv NEXLIFY_PANEL_API_SECRET "$secret"
  set_kv PANEL_INTERNAL_SECRET "$secret"
  set_kv PANEL_API_SECRET "$secret"
  log "Remote management enabled (remote-unlock-ip, remote-update, license sync)"
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

# Generate Ed25519 license signing keypair if missing (needed for trial/license issuance)
if [ ! -f .license-keys/private.pem ]; then
  progress_step "Generating license signing key"
  mkdir -p .license-keys
  node -e "
    const { generateKeyPairSync } = require('crypto');
    const fs = require('fs');
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    fs.mkdirSync('.license-keys', { recursive: true });
    fs.writeFileSync('.license-keys/private.pem', privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
    fs.writeFileSync('.license-keys/public.pem', publicKey.export({ type: 'spki', format: 'pem' }));
    console.log('License signing keypair generated');
  " >>"$INSTALL_LOG" 2>&1 || log "WARN: license key generation failed — trials may not work"
fi

quiet_step "Applying database schema" bash -c 'unset DATABASE_URL 2>/dev/null; npx prisma generate && npx prisma db push --accept-data-loss && for m in prisma/migrations/*/; do npx prisma migrate resolve --applied "$(basename "$m")" 2>/dev/null || true; done'

quiet_step "Seeding database" env QUIET_SEED=1 npm run db:seed

progress_step "Setting admin password"
if ! ADMIN_PASS="$ADMIN_PASS" node scripts/set-admin-password.cjs >>"$INSTALL_LOG" 2>&1; then
  die "Failed to set admin password. Check $INSTALL_LOG and run: ADMIN_PASS='...' node scripts/set-admin-password.cjs"
fi
# Save credentials immediately so the admin password is preserved even if the
# rest of the install is interrupted (SSH timeout, long PM2 startup, etc.).
save_install_credentials "in_progress"

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

panel_version() {
  node -p "require('./package.json').version" 2>/dev/null || echo ""
}

resolve_prebuilt_url() {
  local ver="${1:-}"
  [ -n "$ver" ] || return 1
  local vendor="${NEXLIFY_VENDOR_URL:-https://nexlify.live}"
  local ua="NexlifyPanelInstaller/1.0 (+https://nexlify.live)"
  # Prefer explicit env override
  if [ -n "${PANEL_PREBUILT_URL:-}" ]; then
    echo "$PANEL_PREBUILT_URL"
    return 0
  fi
  # Try releases feed
  local feed_url="${vendor}/api/panel-releases"
  local url
  url="$(curl -fsSL -A "$ua" --connect-timeout 10 --max-time 30 "$feed_url" 2>/dev/null \
    | node -e "
      let d='';
      process.stdin.on('data', c => d += c);
      process.stdin.on('end', () => {
        try {
          const j = JSON.parse(d);
          const r = (j.releases || []).find(x => x.version === process.argv[1]);
          if (r && r.downloadUrl) process.stdout.write(r.downloadUrl);
        } catch {}
      });
    " "$ver" 2>/dev/null)"
  if [ -n "$url" ]; then
    echo "$url"
    return 0
  fi
  # Fallback to hardcoded pattern
  echo "${vendor}/downloads/next-${ver}.tar.gz"
}

download_and_extract_prebuilt() {
  local url="$1"
  local tmp="/tmp/nexlify-next-prebuilt-$$.tar.gz"
  local ua="NexlifyPanelInstaller/1.0 (+https://nexlify.live)"
  echo "Downloading prebuilt .next archive: $url"
  if ! curl -fsSL -A "$ua" --connect-timeout 30 --max-time 600 -o "$tmp" "$url" >>"$INSTALL_LOG" 2>&1; then
    rm -f "$tmp"
    return 1
  fi
  local bytes
  bytes="$(wc -c < "$tmp" | tr -d ' ')"
  if [ "${bytes:-0}" -lt 10000000 ]; then
    rm -f "$tmp"
    echo "WARN: prebuilt archive too small (${bytes} bytes)" >&2
    return 1
  fi
  echo "Extracting prebuilt .next archive ($(du -h "$tmp" | cut -f1)) ..."
  rm -rf .next
  mkdir -p .next
  if ! tar xzf "$tmp" -C .next >>"$INSTALL_LOG" 2>&1; then
    rm -f "$tmp"
    return 1
  fi
  rm -f "$tmp"
  if [ ! -f .next/BUILD_ID ]; then
    echo "WARN: prebuilt archive missing BUILD_ID" >&2
    return 1
  fi
  # Prepare standalone assets just in case
  bash scripts/prepare-standalone.sh >>"$INSTALL_LOG" 2>&1 || true
  return 0
}

PANEL_VER="$(panel_version)"
PREBUILT_URL="$(resolve_prebuilt_url "$PANEL_VER")"
USED_PREBUILT=0

if [ -n "$PREBUILT_URL" ] && download_and_extract_prebuilt "$PREBUILT_URL"; then
  progress_step "Using prebuilt panel"
  USED_PREBUILT=1
else
  ensure_build_memory
  export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=3072}"
  if ! quiet_step "Building panel" npm run build; then
    save_install_credentials "build_failed"
    die "Panel build failed. Credentials saved to $CREDS_FILE — see errors above, then: cd $PANEL_DIR && npm run build && bash scripts/pm2-start.sh"
  fi
fi

progress_step "Starting services"
# Shorter health waits during install — fresh VPS usually starts in <10s.
export PANEL_PM2_WAIT_SEC=30
export PANEL_HEALTH_WAIT_SEC=30
bash scripts/pm2-start.sh >>"$INSTALL_LOG" 2>&1
bash scripts/pm2-boot-enable.sh >>"$INSTALL_LOG" 2>&1 || true

# Ensure a Main Server row exists in the database for the dashboard
progress_step "Creating main server entry"
npx tsx scripts/ensure-monolithic-server.ts --domain "$DOMAIN" >>"$INSTALL_LOG" 2>&1 || log "WARN: main server auto-create skipped (you can add one under Admin → Servers)"

# Setup watchdog cron (auto-healing every 5 minutes)
if [ -f scripts/nexlify-watchdog.sh ]; then
  chmod +x scripts/nexlify-watchdog.sh
  # Write cron entries to a temp file first; avoids crontab - reading the install
  # script from stdin when the installer is run via curl | bash.
  _cron_tmp="$(mktemp)"
  (
    crontab -l 2>/dev/null | grep -v nexlify-watchdog || true
    echo "*/5 * * * * $PANEL_DIR/scripts/nexlify-watchdog.sh"
  ) > "$_cron_tmp"
  crontab "$_cron_tmp" >/dev/null 2>&1 || true
  rm -f "$_cron_tmp"
  log "Watchdog cron installed (auto-heals every 5 minutes)"
fi

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
# Only restart if panel is not already healthy; otherwise the extra restart
# can make login verification race with startup.
PANEL_VERIFY_PORT="${NEXLIFY_PANEL_LISTEN_PORT:-${PORT:-13000}}"
if ! curl -fsS "http://127.0.0.1:${PANEL_VERIFY_PORT}/api/health" >/dev/null 2>&1; then
  bash scripts/panel-restart-safe.sh >>"$INSTALL_LOG" 2>&1 || bash scripts/pm2-start.sh >>"$INSTALL_LOG" 2>&1
fi
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
cp "$PANEL_DIR/.env" "$PANEL_DIR/.env.original" 2>/dev/null || true
progress_step "Install complete"
print_install_complete
if [ -z "$LICENSE_KEY" ]; then
  echo "Tip: activate your license after login at ${LOGIN_URL%/login}/admin/license/add"
fi
