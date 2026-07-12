#!/bin/bash
# Nexlify Panel — Watchdog Script (FIXED - no auto-rebuild)
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
    log "INFO: $name restarted"
  fi
}

log "=== Watchdog check started ==="

# Check all processes (NO auto-rebuild)
check_process "nexlify"
check_process "nexlify-web"
check_process "nexlify-cron"
check_process "nexlify-license"

# Save PM2 state
pm2 save 2>/dev/null

log "=== Watchdog check complete ==="
