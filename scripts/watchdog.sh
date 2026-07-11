#!/bin/bash
# Nexlify Panel — Watchdog Script
# Checks all PM2 processes and restarts them if down
# Runs via cron every 2 minutes
set -euo pipefail

LOG="/var/log/nexlify-watchdog.log"
PANEL_DIR="/opt/nexlify-panel"
MARKETING_DIR="$PANEL_DIR/marketing-drop-in"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1" >> "$LOG"; }

# Check and restart PM2 processes
check_process() {
  local name="$1"
  local status
  status=$(pm2 jlist 2>/dev/null | python3 -c "
import sys,json
try:
  apps=json.load(sys.stdin)
  for a in apps:
    if a.get('name')=='$name':
      print(a.get('pm2_env',{}).get('status','unknown'))
      sys.exit(0)
  print('not_found')
except: print('error')
" 2>/dev/null)

  if [ "$status" != "online" ]; then
    log "WARN: $name is $status — restarting"
    if [ "$name" = "nexlify" ]; then
      cd "$PANEL_DIR" && pm2 start ecosystem.config.cjs --only nexlify 2>/dev/null
    elif [ "$name" = "nexlify-web" ]; then
      cd "$PANEL_DIR" && pm2 start ecosystem.config.cjs --only nexlify-web 2>/dev/null
    else
      pm2 restart "$name" 2>/dev/null
    fi
    sleep 3
    log "INFO: $name restarted (status: $(pm2 show "$name" 2>/dev/null | grep 'status' | awk '{print $4}'))"
  fi
}

# Check .next directories exist
check_build() {
  local dir="$1"
  local name="$2"
  if [ ! -f "$dir/.next/BUILD_ID" ]; then
    log "WARN: $name missing .next build — rebuilding"
    cd "$dir" && npm run build 2>> "$LOG"
    log "INFO: $name rebuild complete"
  fi
}

# Check node_modules exist
check_deps() {
  local dir="$1"
  local name="$2"
  for dep in next react prisma; do
    if [ ! -d "$dir/node_modules/$dep" ]; then
      log "WARN: $name missing $dep — installing"
      cd "$dir" && npm install 2>> "$LOG"
      break
    fi
  done
}

log "=== Watchdog check started ==="

# Check all processes
check_process "nexlify"
check_process "nexlify-web"
check_process "nexlify-cron"
check_process "nexlify-license"

# Check builds
check_build "$PANEL_DIR" "panel"
check_build "$MARKETING_DIR" "marketing"

# Check deps
check_deps "$PANEL_DIR" "panel"
check_deps "$MARKETING_DIR" "marketing"

# Save PM2 state
pm2 save 2>/dev/null

log "=== Watchdog check complete ==="
