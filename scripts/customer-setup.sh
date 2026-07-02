#!/usr/bin/env bash
# Nexlify Panel — Customer server setup & repair script
#
# Run this after panel files are deployed to fix common issues:
#   - .env DATABASE_URL alignment with PostgreSQL
#   - Prisma schema sync
#   - Main server registration
#   - Nginx configuration
#   - PM2 process management
#
# Usage:
#   sudo bash scripts/customer-setup.sh --domain YOUR_IP_OR_DOMAIN
#
# Options:
#   --domain HOST        Server IP or domain (required)
#   --fresh              Reset .env from .env.example before setup
#   --skip-nginx         Do not configure nginx
#   --skip-prisma        Do not run prisma db push
#   --skip-server        Do not run ensure-monolithic-server
#   -h, --help           Show this help
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DOMAIN=""
SKIP_NGINX=0
SKIP_PRISMA=0
SKIP_SERVER=0
FRESH=0

usage() {
  cat <<'EOF'
Nexlify Panel — Customer Setup & Repair

Usage:
  sudo bash scripts/customer-setup.sh --domain YOUR_IP_OR_DOMAIN

Options:
  --domain HOST        Server IP or domain (required)
  --fresh              Reset .env from .env.example before setup
  --skip-nginx         Do not configure nginx
  --skip-prisma        Do not run prisma db push
  --skip-server        Do not run ensure-monolithic-server
  -h, --help           Show this help

What this script does:
  1. Fixes .env DATABASE_URL to match PostgreSQL user
  2. Runs prisma db push to sync schema
  3. Registers main server in database
  4. Configures nginx (unless --skip-nginx)
  5. Restarts PM2 processes
  6. Verifies panel is accessible
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --fresh) FRESH=1; shift ;;
    --skip-nginx) SKIP_NGINX=1; shift ;;
    --skip-prisma) SKIP_PRISMA=1; shift ;;
    --skip-server) SKIP_SERVER=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

log() { echo "==> $*"; }
die() { echo "ERROR: $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root: sudo bash scripts/customer-setup.sh --domain YOUR_IP"
[ -n "$DOMAIN" ] || die "--domain is required (your server IP or hostname)"

# ── 1. Fix shell env override ──────────────────────────────────────────────
log "Checking for shell DATABASE_URL override..."
if [ -n "${DATABASE_URL:-}" ]; then
  log "Unsetting stale shell DATABASE_URL: ${DATABASE_URL:0:30}..."
  unset DATABASE_URL
fi

# ── 2. Fix .env DATABASE_URL ───────────────────────────────────────────────
log "Verifying .env configuration..."
[ -f .env ] || { [ -f .env.example ] && cp .env.example .env || die ".env.example not found"; }

# Detect PostgreSQL user from existing .env
CURRENT_DB_URL="$(grep '^DATABASE_URL=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)"

# Check if the user in DATABASE_URL actually exists in PostgreSQL
DB_USER="$(echo "$CURRENT_DB_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')"
DB_PASS="$(echo "$CURRENT_DB_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')"
DB_HOST="$(echo "$CURRENT_DB_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')"
DB_NAME="$(echo "$CURRENT_DB_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')"

if [ -z "$DB_USER" ] || [ -z "$DB_PASS" ]; then
  log "WARNING: Could not parse DATABASE_URL from .env"
  log "Current: ${CURRENT_DB_URL:0:50}..."
fi

# Test if current credentials work
if [ -n "$DB_USER" ] && [ -n "$DB_PASS" ]; then
  if PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -h "${DB_HOST:-127.0.0.1}" -d "${DB_NAME:-nexlify}" -c "SELECT 1;" >/dev/null 2>&1; then
    log "DATABASE_URL credentials are valid (user: $DB_USER)"
  else
    log "DATABASE_URL credentials invalid — checking PostgreSQL users..."
    
    # Check if nexlify user exists
    if sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='nexlify'" 2>/dev/null | grep -q 1; then
      # nexlify user exists — get or reset password
      if [ "$DB_USER" != "nexlify" ]; then
        log "Switching DATABASE_URL from user '$DB_USER' to 'nexlify'..."
        NEW_PASS="${DB_PASS}"
        sudo -u postgres psql -c "ALTER USER nexlify WITH PASSWORD '${NEW_PASS}';" >/dev/null 2>&1 || true
        sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"postgresql://nexlify:${NEW_PASS}@${DB_HOST:-127.0.0.1}:5432/${DB_NAME:-nexlify}\"|" .env
        log "DATABASE_URL updated to use nexlify user"
      else
        # User is nexlify but password is wrong — reset it
        log "Resetting nexlify user password..."
        NEW_PASS="$(openssl rand -hex 16)"
        sudo -u postgres psql -c "ALTER USER nexlify WITH PASSWORD '${NEW_PASS}';" >/dev/null
        sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"postgresql://nexlify:${NEW_PASS}@${DB_HOST:-127.0.0.1}:5432/${DB_NAME:-nexlify}\"|" .env
        log "Password reset. New DATABASE_URL written to .env"
      fi
    else
      # nexlify user doesn't exist — create it
      log "PostgreSQL user 'nexlify' not found — creating..."
      NEW_PASS="$(openssl rand -hex 16)"
      sudo -u postgres psql -c "CREATE USER nexlify WITH PASSWORD '${NEW_PASS}';" >/dev/null
      sudo -u postgres psql -c "CREATE DATABASE nexlify OWNER nexlify;" 2>/dev/null || true
      sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE nexlify TO nexlify;" >/dev/null
      sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"postgresql://nexlify:${NEW_PASS}@${DB_HOST:-127.0.0.1}:5432/${DB_NAME:-nexlify}\"|" .env
      log "Created user nexlify with new password"
    fi
  fi
fi

# ── 3. Run prisma db push ─────────────────────────────────────────────────
if [ "$SKIP_PRISMA" -eq 0 ]; then
  log "Syncing database schema with Prisma..."
  export DATABASE_URL="$(grep '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')"
  npx prisma generate 2>&1 | tail -3
  npx prisma db push --accept-data-loss 2>&1 | tail -5
  log "Database schema synced"
fi

# ── 4. Register main server ───────────────────────────────────────────────
if [ "$SKIP_SERVER" -eq 0 ]; then
  log "Registering main server in database..."
  export DATABASE_URL="$(grep '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')"
  npx tsx scripts/ensure-monolithic-server.ts --domain "$DOMAIN" 2>&1 | tail -5
  log "Main server registered"
fi

# ── 5. Fix nginx ──────────────────────────────────────────────────────────
if [ "$SKIP_NGINX" -eq 0 ]; then
  log "Configuring nginx..."
  
  # Move RTMP config out of conf.d if present (rtmp block must be top-level)
  if [ -f /etc/nginx/conf.d/nexlify-rtmp.conf ]; then
    log "Moving RTMP config to /etc/nginx/nexlify-rtmp.conf..."
    mv /etc/nginx/conf.d/nexlify-rtmp.conf /etc/nginx/nexlify-rtmp.conf 2>/dev/null || true
  fi
  
  # Ensure correct nginx panel config
  if [ -f nginx/panel.nexlify.live-http-only.conf ]; then
    NGINX_SITE="/etc/nginx/sites-available/nexlify-panel"
    cp nginx/panel.nexlify.live-http-only.conf "$NGINX_SITE"
    sed -i "s/server_name panel.nexlify.live;/server_name ${DOMAIN};/" "$NGINX_SITE"
    ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/nexlify-panel
    
    # Remove old domain-specific configs
    rm -f /etc/nginx/sites-enabled/nexlify-panel-* 2>/dev/null || true
    
    if nginx -t 2>&1; then
      systemctl enable nginx 2>/dev/null || true
      systemctl restart nginx 2>/dev/null || systemctl start nginx 2>/dev/null || true
      log "Nginx configured and restarted"
    else
      log "WARNING: nginx config test failed — check /etc/nginx/"
    fi
  else
    log "WARNING: nginx template not found at nginx/panel.nexlify.live-http-only.conf"
  fi
fi

# ── 6. Restart PM2 ────────────────────────────────────────────────────────
log "Restarting PM2 processes..."
if [ -x scripts/panel-restart-safe.sh ]; then
  bash scripts/panel-restart-safe.sh --nexlify-only 2>&1 | tail -3 || true
elif [ -x scripts/pm2-start.sh ]; then
  bash scripts/pm2-start.sh 2>&1 | tail -3 || true
else
  pm2 restart nexlify --update-env 2>/dev/null || pm2 start ecosystem.config.cjs --only nexlify --update-env
  pm2 save 2>/dev/null || true
fi

# ── 7. Save .env backup ───────────────────────────────────────────────────
log "Saving .env backup..."
cp .env .env.backup 2>/dev/null || true

# ── 8. Verify ─────────────────────────────────────────────────────────────
log "Verifying panel..."
sleep 3

PANEL_PORT="$(grep '^PORT=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || echo 13000)"
health="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${PANEL_PORT}/api/health" 2>/dev/null || echo 000)"
version="$(curl -sS --max-time 5 "http://127.0.0.1:${PANEL_PORT}/api/panel/version" 2>/dev/null | grep -o '"version":"[^"]*"' || echo 'unknown')"

echo ""
echo "================================================================"
echo " Nexlify Panel — Setup Complete"
echo "================================================================"
echo ""
echo " Domain:    $DOMAIN"
echo " Panel:     http://${DOMAIN}"
echo " Health:    $health"
echo " Version:   $version"
echo " Database:  $(grep '^DATABASE_URL=' .env | head -1 | sed 's|.*://\([^:]*\):.*@\([^:]*\):.*|\1@\2|')"
echo ""
echo " Next steps:"
echo " 1. Open http://${DOMAIN}/login in your browser"
echo " 2. Login with your admin credentials"
echo " 3. Go to Admin → License and paste your NXLF1 key"
echo ""
echo " If login fails, run:"
echo "   cd $ROOT && ADMIN_PASS='yourpassword' node scripts/set-admin-password.cjs"
echo ""
echo "================================================================"
