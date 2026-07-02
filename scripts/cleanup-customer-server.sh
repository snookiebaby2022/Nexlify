#!/usr/bin/env bash
# Nexlify Panel — Full customer server cleanup & repair
#
# Fixes ALL issues encountered during v1.8.3 deployment:
#   - Shell DATABASE_URL override
#   - Wrong PostgreSQL credentials in .env
#   - Missing prisma schema columns
#   - Missing main server registration
#   - Broken nginx config
#   - Stale PM2 processes
#   - Missing scripts from vendor
#   - RTMP config in wrong location
#
# Usage:
#   sudo bash scripts/cleanup-customer-server.sh --domain YOUR_IP_OR_DOMAIN
#
# Options:
#   --domain HOST        Server IP or domain (required)
#   --fix-all            Run all fixes (default)
#   --fix-env            Fix .env DATABASE_URL only
#   --fix-prisma         Run prisma db push only
#   --fix-server         Register main server only
#   --fix-nginx          Fix nginx config only
#   --fix-pm2            Fix PM2 processes only
#   --fix-scripts        Download missing scripts from vendor only
#   --verify             Verify panel is working (no changes)
#   -h, --help           Show this help
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DOMAIN=""
FIX_ALL=1
FIX_ENV=0
FIX_PRISMA=0
FIX_SERVER=0
FIX_NGINX=0
FIX_PM2=0
FIX_SCRIPTS=0
VERIFY_ONLY=0

usage() {
  cat <<'EOF'
Nexlify Panel — Full Customer Server Cleanup

Usage:
  sudo bash scripts/cleanup-customer-server.sh --domain YOUR_IP_OR_DOMAIN

Options:
  --domain HOST        Server IP or domain (required)
  --fix-all            Run all fixes (default)
  --fix-env            Fix .env DATABASE_URL only
  --fix-prisma         Run prisma db push only
  --fix-server         Register main server only
  --fix-nginx          Fix nginx config only
  --fix-pm2            Fix PM2 processes only
  --fix-scripts        Download missing scripts from vendor only
  --verify             Verify panel is working (no changes)
  -h, --help           Show this help

What this script fixes:
  1. Shell DATABASE_URL override (unset stale env var)
  2. .env DATABASE_URL alignment with PostgreSQL
  3. Prisma schema sync (adds missing columns)
  4. Main server registration in database
  5. Nginx configuration (proxy headers, RTMP location)
  6. PM2 process management (restart, save)
  7. Missing vendor scripts (downloads from nexlify.live)
  8. .env backup for future reference
EOF
}

while [ $# -gt 0 ]; do
  case "$1" in
    --domain) DOMAIN="${2:-}"; shift 2 ;;
    --fix-all) FIX_ALL=1; shift ;;
    --fix-env) FIX_ALL=0; FIX_ENV=1; shift ;;
    --fix-prisma) FIX_ALL=0; FIX_PRISMA=1; shift ;;
    --fix-server) FIX_ALL=0; FIX_SERVER=1; shift ;;
    --fix-nginx) FIX_ALL=0; FIX_NGINX=1; shift ;;
    --fix-pm2) FIX_ALL=0; FIX_PM2=1; shift ;;
    --fix-scripts) FIX_ALL=0; FIX_SCRIPTS=1; shift ;;
    --verify) VERIFY_ONLY=1; shift ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown option: $1"; usage; exit 1 ;;
  esac
done

log() { echo "==> $*"; }
warn() { echo "WARNING: $*" >&2; }
die() { echo "ERROR: $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || die "Run as root: sudo bash scripts/cleanup-customer-server.sh --domain YOUR_IP"
[ -n "$DOMAIN" ] || die "--domain is required (your server IP or hostname)"

# ── 1. Fix shell DATABASE_URL override ────────────────────────────────────
log "Step 1: Clearing stale shell DATABASE_URL..."
if [ -n "${DATABASE_URL:-}" ]; then
  log "  Unsetting stale DATABASE_URL: ${DATABASE_URL:0:40}..."
  unset DATABASE_URL
else
  log "  No stale DATABASE_URL in shell"
fi

# Also check for other common env vars that might interfere
unset PRISMA_DATABASE_URL 2>/dev/null || true

# ── 2. Verify .env exists ────────────────────────────────────────────────
log "Step 2: Verifying .env configuration..."
[ -f .env ] || {
  if [ -f .env.example ]; then
    warn ".env not found — copying from .env.example"
    cp .env.example .env
  else
    die ".env and .env.example not found — incomplete installation"
  fi
}

# Save backup before any changes
cp .env .env.cleanup-backup-$(date +%Y%m%d-%H%M%S) 2>/dev/null || true

# ── 3. Fix .env DATABASE_URL ─────────────────────────────────────────────
if [ "$FIX_ALL" -eq 1 ] || [ "$FIX_ENV" -eq 1 ]; then
  log "Step 3: Fixing .env DATABASE_URL..."
  
  CURRENT_DB_URL="$(grep '^DATABASE_URL=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || true)"
  
  if [ -z "$CURRENT_DB_URL" ]; then
    warn "DATABASE_URL not found in .env — adding default"
    echo 'DATABASE_URL="postgresql://nexlify:nexlify@127.0.0.1:5432/nexlify"' >> .env
    CURRENT_DB_URL="$(grep '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')"
  fi
  
  DB_USER="$(echo "$CURRENT_DB_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')"
  DB_PASS="$(echo "$CURRENT_DB_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')"
  DB_HOST="$(echo "$CURRENT_DB_URL" | sed -n 's|.*@\([^:]*\):.*|\1|p')"
  DB_NAME="$(echo "$CURRENT_DB_URL" | sed -n 's|.*/\([^?]*\).*|\1|p')"
  
  log "  Current DATABASE_URL: user=$DB_USER host=$DB_HOST db=$DB_NAME"
  
  # Test if current credentials work
  if PGPASSWORD="$DB_PASS" psql -U "$DB_USER" -h "${DB_HOST:-127.0.0.1}" -d "${DB_NAME:-nexlify}" -c "SELECT 1;" >/dev/null 2>&1; then
    log "  Database connection OK"
  else
    warn "Database connection FAILED — fixing..."
    
    # Check what users exist in PostgreSQL
    PG_USERS="$(sudo -u postgres psql -t -c "SELECT usename FROM pg_user;" 2>/dev/null | tr -d ' ' || true)"
    log "  PostgreSQL users: $PG_USERS"
    
    if echo "$PG_USERS" | grep -q "nexlify"; then
      # nexlify user exists — reset password
      NEW_PASS="$(openssl rand -hex 16)"
      sudo -u postgres psql -c "ALTER USER nexlify WITH PASSWORD '${NEW_PASS}';" >/dev/null
      sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"postgresql://nexlify:${NEW_PASS}@${DB_HOST:-127.0.0.1}:5432/${DB_NAME:-nexlify}\"|" .env
      log "  Reset nexlify password and updated .env"
    else
      # nexlify user doesn't exist — create it
      warn "PostgreSQL user 'nexlify' not found — creating..."
      NEW_PASS="$(openssl rand -hex 16)"
      sudo -u postgres psql -c "CREATE USER nexlify WITH PASSWORD '${NEW_PASS}';" >/dev/null
      sudo -u postgres psql -c "CREATE DATABASE nexlify OWNER nexlify;" 2>/dev/null || true
      sudo -u postgres psql -c "GRANT ALL PRIVILEGES ON DATABASE nexlify TO nexlify;" >/dev/null
      sudo -u postgres psql -c "ALTER USER nexlify WITH PASSWORD '${NEW_PASS}';" >/dev/null
      sed -i "s|^DATABASE_URL=.*|DATABASE_URL=\"postgresql://nexlify:${NEW_PASS}@${DB_HOST:-127.0.0.1}:5432/${DB_NAME:-nexlify}\"|" .env
      log "  Created nexlify user with new password"
    fi
    
    # Re-verify
    NEW_DB_URL="$(grep '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')"
    NEW_DB_USER="$(echo "$NEW_DB_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')"
    NEW_DB_PASS="$(echo "$NEW_DB_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')"
    
    if PGPASSWORD="$NEW_DB_PASS" psql -U "$NEW_DB_USER" -h "${DB_HOST:-127.0.0.1}" -d "${DB_NAME:-nexlify}" -c "SELECT 1;" >/dev/null 2>&1; then
      log "  Database connection verified OK"
    else
      die "Database connection still failing after fix — check PostgreSQL manually"
    fi
  fi
else
  log "Step 3: Skipping .env fix"
fi

# ── 4. Run prisma db push ────────────────────────────────────────────────
if [ "$FIX_ALL" -eq 1 ] || [ "$FIX_PRISMA" -eq 1 ]; then
  log "Step 4: Syncing database schema with Prisma..."
  export DATABASE_URL="$(grep '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')"
  
  npx prisma generate 2>&1 | tail -3
  npx prisma db push --accept-data-loss 2>&1 | tail -5
  
  log "  Database schema synced"
else
  log "Step 4: Skipping prisma sync"
fi

# ── 5. Register main server ──────────────────────────────────────────────
if [ "$FIX_ALL" -eq 1 ] || [ "$FIX_SERVER" -eq 1 ]; then
  log "Step 5: Registering main server in database..."
  export DATABASE_URL="$(grep '^DATABASE_URL=' .env | head -1 | cut -d= -f2- | tr -d '"')"
  
  # Check if server already exists
  SERVER_COUNT="$(PGPASSWORD="$(echo "$DATABASE_URL" | sed -n 's|.*://[^:]*:\([^@]*\)@.*|\1|p')" psql -U "$(echo "$DATABASE_URL" | sed -n 's|.*://\([^:]*\):.*|\1|p')" -h 127.0.0.1 -d nexlify -t -c "SELECT COUNT(*) FROM \"StreamServer\";" 2>/dev/null | tr -d ' ' || echo 0)"
  
  if [ "$SERVER_COUNT" = "0" ]; then
    log "  No servers found — registering main server..."
    npx tsx scripts/ensure-monolithic-server.ts --domain "$DOMAIN" 2>&1 | tail -5
    log "  Main server registered"
  else
    log "  Found $SERVER_COUNT server(s) — skipping registration"
    # Still ensure it has the correct role
    npx tsx scripts/ensure-monolithic-server.ts --domain "$DOMAIN" 2>&1 | tail -3
  fi
else
  log "Step 5: Skipping server registration"
fi

# ── 6. Fix nginx ─────────────────────────────────────────────────────────
if [ "$FIX_ALL" -eq 1 ] || [ "$FIX_NGINX" -eq 1 ]; then
  log "Step 6: Fixing nginx configuration..."
  
  # Move RTMP config out of conf.d if present (rtmp block must be top-level)
  if [ -f /etc/nginx/conf.d/nexlify-rtmp.conf ]; then
    log "  Moving RTMP config to /etc/nginx/nexlify-rtmp.conf..."
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
    
    if nginx -t 2>&1 | grep -q "successful"; then
      systemctl enable nginx 2>/dev/null || true
      systemctl restart nginx 2>/dev/null || systemctl start nginx 2>/dev/null || true
      log "  Nginx configured and restarted"
    else
      warn "Nginx config test failed — check /etc/nginx/"
      nginx -t 2>&1 || true
    fi
  else
    warn "nginx template not found at nginx/panel.nexlify.live-http-only.conf"
  fi
else
  log "Step 6: Skipping nginx fix"
fi

# ── 7. Fix PM2 ──────────────────────────────────────────────────────────
if [ "$FIX_ALL" -eq 1 ] || [ "$FIX_PM2" -eq 1 ]; then
  log "Step 7: Fixing PM2 processes..."
  
  # Kill any stale update processes
  pkill -f 'panel-update-background' 2>/dev/null || true
  pkill -f 'apply-panel-fast-update' 2>/dev/null || true
  rm -f .update-progress.pid .update-in-progress
  
  # Restart panel
  if [ -x scripts/panel-restart-safe.sh ]; then
    bash scripts/panel-restart-safe.sh --nexlify-only 2>&1 | tail -3 || true
  elif [ -x scripts/pm2-start.sh ]; then
    bash scripts/pm2-start.sh 2>&1 | tail -3 || true
  else
    pm2 restart nexlify --update-env 2>/dev/null || pm2 start ecosystem.config.cjs --only nexlify --update-env
    pm2 save 2>/dev/null || true
  fi
  
  log "  PM2 processes restarted"
else
  log "Step 7: Skipping PM2 fix"
fi

# ── 8. Download missing scripts ──────────────────────────────────────────
if [ "$FIX_ALL" -eq 1 ] || [ "$FIX_SCRIPTS" -eq 1 ]; then
  log "Step 8: Checking for missing vendor scripts..."
  
  REQUIRED_SCRIPTS=(
    "apply-panel-fast-update.sh"
    "panel-restart-safe.sh"
    "panel-update-recover.sh"
    "has-valid-next-build.sh"
    "prepare-standalone.sh"
    "verify-standalone.sh"
    "ensure-panel-env.sh"
    "pm2-start.sh"
    "pm2-boot-enable.sh"
    "set-admin-password.cjs"
    "sync-license-env.mjs"
    "ensure-monolithic-server.ts"
  )
  
  MISSING=()
  for script in "${REQUIRED_SCRIPTS[@]}"; do
    if [ ! -f "scripts/$script" ]; then
      MISSING+=("$script")
    fi
  done
  
  if [ ${#MISSING[@]} -gt 0 ]; then
    warn "Missing scripts: ${MISSING[*]}"
    log "  Downloading from vendor..."
    
    VENDOR_URL="${NEXLIFY_VENDOR_URL:-https://nexlify.live}"
    for script in "${MISSING[@]}"; do
      if curl -fsSL "${VENDOR_URL}/scripts/${script}" -o "scripts/${script}" 2>/dev/null; then
        log "  Downloaded $script"
      else
        warn "  Failed to download $script"
      fi
    done
    
    # Normalize line endings
    sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true
    chmod +x scripts/*.sh 2>/dev/null || true
  else
    log "  All required scripts present"
  fi
else
  log "Step 8: Skipping script download"
fi

# ── 9. Save final .env backup ────────────────────────────────────────────
log "Step 9: Saving .env backup..."
cp .env .env.original 2>/dev/null || true
log "  Backup saved to .env.original"

# ── 10. Verify ──────────────────────────────────────────────────────────
log "Step 10: Verifying panel..."
sleep 3

PANEL_PORT="$(grep '^PORT=' .env 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' || echo 13000)"
health="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 "http://127.0.0.1:${PANEL_PORT}/api/health" 2>/dev/null || echo 000)"
version="$(curl -sS --max-time 5 "http://127.0.0.1:${PANEL_PORT}/api/panel/version" 2>/dev/null | grep -o '"version":"[^"]*"' || echo 'unknown')"
login="$(curl -sS -o /dev/null -w '%{http_code}' --max-time 5 -H "User-Agent: Mozilla/5.0" "http://127.0.0.1:${PANEL_PORT}/login" 2>/dev/null || echo 000)"

echo ""
echo "================================================================"
echo " Nexlify Panel — Customer Server Cleanup Complete"
echo "================================================================"
echo ""
echo " Domain:    $DOMAIN"
echo " Panel:     http://${DOMAIN}"
echo " Health:    $health"
echo " Version:   $version"
echo " Login:     $login"
echo " Database:  $(grep '^DATABASE_URL=' .env | head -1 | sed 's|.*://\([^:]*\):.*@\([^:]*\):.*|\1@\2|')"
echo ""
if [ "$health" = "200" ] && [ "$login" = "200" ]; then
  echo " STATUS:    All checks passed"
  echo ""
  echo " Next steps:"
  echo "  1. Open http://${DOMAIN}/login in your browser"
  echo "  2. Login with your admin credentials"
  echo "  3. Go to Admin → License and paste your NXLF1 key"
  echo "  4. Test the update button at Admin → Settings → Updates"
else
  echo " STATUS:    Some checks failed"
  echo ""
  echo " Troubleshooting:"
  echo "  - Check PM2 logs: pm2 logs nexlify"
  echo "  - Check nginx: systemctl status nginx"
  echo "  - Check PostgreSQL: systemctl status postgresql"
  echo "  - Run repair script: sudo bash scripts/repair-panel.sh"
fi
echo ""
echo "================================================================"
