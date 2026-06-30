#!/usr/bin/env bash
# Cron-friendly: restart panel if :3000 health fails (recovers silent PM2 gaps / 502).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/nexlify}"
PANEL_PORT="${PANEL_PORT:-13000}"
LOG="${PANEL_WATCHDOG_LOG:-/var/log/nexlify-panel-watchdog.log}"
URL="http://127.0.0.1:${PANEL_PORT}/api/health"

if curl -fsS --max-time 8 "$URL" >/dev/null 2>&1; then
  exit 0
fi

mkdir -p "$(dirname "$LOG")"
echo "$(date -Iseconds) UNHEALTHY $URL — running pm2-ensure-panel" >> "$LOG"
REBUILD=0 bash "$APP_DIR/deploy/pm2-ensure-panel.sh" >> "$LOG" 2>&1 || {
  echo "$(date -Iseconds) RECOVERY FAILED" >> "$LOG"
  exit 1
}
echo "$(date -Iseconds) RECOVERED" >> "$LOG"
