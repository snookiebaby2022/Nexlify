#!/bin/bash
# Nexlify Panel Watchdog — runs every 5 minutes via cron
# Ensures panel, cron, and license processes stay healthy
# Auto-fixes common issues before they cause downtime

set -euo pipefail

PANEL_DIR="/home/nexlify-panel"
LOG="/var/log/nexlify-watchdog.log"
PM2_APP="nexlify"
CRON_APP="nexlify-cron"
LICENSE_APP="nexlify-license"
WEB_APP="nexlify-web"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG"; }

# Rotate log if > 5MB
if [ -f "$LOG" ] && [ "$(stat -f%z "$LOG" 2>/dev/null || stat -c%s "$LOG" 2>/dev/null)" -gt 5242880 ]; then
  mv "$LOG" "$LOG.old"
fi

# --- Check 1: PM2 processes running ---
check_pm2_process() {
  local name="$1"
  local status
  status=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    procs = json.load(sys.stdin)
    for p in procs:
        if p['name'] == '$name':
            print(p['pm2_env']['status'])
            break
    else:
        print('not_found')
except:
    print('error')
" 2>/dev/null || echo "error")

  if [ "$status" != "online" ]; then
    log "WARN: $name is $status — restarting"
    pm2 restart "$name" 2>/dev/null || true
    sleep 3
    return 1
  fi
  return 0
}

# Check main panel
if ! check_pm2_process "$PM2_APP"; then
  log "FIX: Panel process was down, restarted"
fi

# Check cron
if ! check_pm2_process "$CRON_APP"; then
  log "FIX: Cron process was down, restarted"
fi

# Check license
if ! check_pm2_process "$LICENSE_APP"; then
  log "FIX: License process was down, restarted"
fi

# --- Check 2: Panel responding on port 80 ---
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "User-Agent: Mozilla/5.0" http://localhost:80/api/health 2>/dev/null || echo "000")
if [ "$HTTP_CODE" != "200" ]; then
  log "WARN: Panel health check returned $HTTP_CODE — restarting"
  pm2 restart "$PM2_APP" 2>/dev/null || true
  sleep 5

  # Verify fix
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "User-Agent: Mozilla/5.0" http://localhost:80/api/health 2>/dev/null || echo "000")
  if [ "$HTTP_CODE" != "200" ]; then
    log "ERROR: Panel still not responding after restart ($HTTP_CODE) — attempting full recovery"
    cd "$PANEL_DIR" && PORT=80 pm2 start .next/standalone/server.js --name "$PM2_APP" -i max --force 2>/dev/null || true
  fi
fi

# --- Check 3: Standalone build exists ---
if [ ! -f "$PANEL_DIR/.next/standalone/server.js" ]; then
  log "ERROR: Standalone build missing — triggering rebuild"
  cd "$PANEL_DIR" && npm run build 2>>"$LOG" || true
  pm2 restart "$PM2_APP" 2>/dev/null || true
fi

# --- Check 4: package.json exists in standalone ---
if [ ! -f "$PANEL_DIR/.next/standalone/package.json" ]; then
  log "WARN: package.json missing in standalone — copying"
  cp "$PANEL_DIR/package.json" "$PANEL_DIR/.next/standalone/package.json" 2>/dev/null || true
fi

# --- Check 5: tailwindcss module present ---
if ! node -e "require('tailwindcss')" 2>/dev/null; then
  log "WARN: tailwindcss missing — installing"
  cd "$PANEL_DIR" && npm install tailwindcss 2>/dev/null || true
fi

# --- Check 5a: ensure cron bundle (or tsx fallback) exists ---
if [ ! -f "$PANEL_DIR/scripts/cron-daemon.bundle.cjs" ]; then
  if [ -f "$PANEL_DIR/scripts/build-cron.mjs" ]; then
    log "WARN: cron bundle missing — building"
    (cd "$PANEL_DIR" && node scripts/build-cron.mjs) 2>/dev/null || true
  fi
fi
if [ ! -f "$PANEL_DIR/scripts/cron-daemon.bundle.cjs" ] && ! cd "$PANEL_DIR" && node -e "require('tsx')" 2>/dev/null; then
  log "WARN: tsx missing (cron fallback) — installing"
  cd "$PANEL_DIR" && npm install tsx 2>/dev/null || true
fi

# --- Check 5b: Cron daemon running ---
CRON_STATUS=$(pm2 jlist 2>/dev/null | python3 -c "import sys,json;procs=json.load(sys.stdin);print(next((p['pm2_env']['status'] for p in procs if p['name']=='$CRON_APP'),'missing'))" 2>/dev/null || echo "error")
if [ "$CRON_STATUS" != "online" ]; then
  log "WARN: Cron daemon is $CRON_STATUS — restarting"
  pm2 delete "$CRON_APP" 2>/dev/null || true
  if [ -f "$PANEL_DIR/ecosystem.config.cjs" ]; then
    cd "$PANEL_DIR" && pm2 start ecosystem.config.cjs --only "$CRON_APP" 2>/dev/null || true
  else
    cd "$PANEL_DIR" && pm2 start scripts/run-cron-daemon.sh --name "$CRON_APP" --interpreter bash 2>/dev/null || true
  fi
fi

# --- Check 5b: DATABASE_URL uses localhost (not external IP) ---
DB_URL=$(grep '^DATABASE_URL=' "$PANEL_DIR/.env" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"')
if echo "$DB_URL" | grep -q '@[0-9]*\.[0-9]*\.[0-9]*\.[0-9]*:'; then
  log "WARN: DATABASE_URL uses external IP — fixing to localhost"
  CORRECT_URL=$(echo "$DB_URL" | sed 's|@[0-9]*\.[0-9]*\.[0-9]*\.[0-9]*:|@localhost:|')
  sed -i "s|$DB_URL|$CORRECT_URL|" "$PANEL_DIR/.env"
  log "FIX: DATABASE_URL updated to localhost"
  pm2 restart "$PM2_APP" 2>/dev/null || true
fi

# --- Check 6: tsx module present (for cron) ---
if ! node -e "require('tsx')" 2>/dev/null; then
  log "WARN: tsx missing — installing"
  cd "$PANEL_DIR" && npm install tsx 2>/dev/null || true
  pm2 restart "$CRON_APP" 2>/dev/null || true
fi

# --- Check 7: PostgreSQL running ---
if ! pg_isready -h localhost -p 5432 >/dev/null 2>&1; then
  log "ERROR: PostgreSQL not responding — attempting restart"
  systemctl restart postgresql 2>/dev/null || docker restart $(docker ps -q --filter "ancestor=postgres" 2>/dev/null) 2>/dev/null || true
fi

# --- Check 8: Redis running ---
if ! redis-cli ping >/dev/null 2>&1; then
  log "WARN: Redis not responding — attempting restart"
  systemctl restart redis-server 2>/dev/null || systemctl restart redis 2>/dev/null || true
fi

# --- Check 9: Disk space ---
DISK_PCT=$(df / | awk 'NR==2 {print $5}' | tr -d '%')
if [ "$DISK_PCT" -gt 90 ]; then
  log "WARN: Disk usage at ${DISK_PCT}% — cleaning old logs"
  find /root/.pm2/logs -name "*.log" -mtime +3 -delete 2>/dev/null || true
  find /tmp -name "nexlify-*" -mtime +1 -delete 2>/dev/null || true
fi

# --- Check 10: Memory ---
MEM_PCT=$(free | awk '/Mem:/ {printf "%.0f", $3/$2*100}')
if [ "$MEM_PCT" -gt 90 ]; then
  log "WARN: Memory usage at ${MEM_PCT}% — restarting PM2 to clear leaks"
  pm2 restart all 2>/dev/null || true
fi

log "OK: Watchdog check complete (HTTP=$HTTP_CODE, disk=${DISK_PCT}%, mem=${MEM_PCT}%)"
