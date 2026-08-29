#!/usr/bin/env bash
# Install cron jobs for IPTV stability (prune, wedge guard, watchdog, build guard).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PANEL="${PANEL_DIR:-/opt/nexlify-panel}"
[ -d "$PANEL" ] || PANEL="$ROOT"

MARK="nexlify-streaming-stability"
tmp="$(mktemp)"
(crontab -l 2>/dev/null || true) | grep -v "$MARK" | grep -v prune-stale-live-connections \
  | grep -v nexlify-worker-wedge-guard \
  | grep -v nexlify-watchdog.sh \
  | grep -v scale-panel-workers-live \
  | grep -v nexlify-streaming-guard \
  | grep -v nexlify-resource-guard > "$tmp" || true

cat >> "$tmp" <<CRON
# $MARK
* * * * * $PANEL/scripts/prune-stale-live-connections.sh >> /var/log/nexlify-prune-conn.log 2>&1
*/2 * * * * PANEL_DIR=$PANEL $PANEL/scripts/nexlify-worker-wedge-guard.sh
*/5 * * * * $PANEL/scripts/nexlify-watchdog.sh >> /var/log/nexlify-watchdog.log 2>&1
*/10 * * * * PANEL_DIR=$PANEL $PANEL/scripts/scale-panel-workers-live.sh >> /var/log/nexlify-scale-workers.log 2>&1
* * * * * PANEL_DIR=$PANEL $PANEL/scripts/nexlify-resource-guard.sh
CRON

crontab "$tmp"
rm -f "$tmp"
echo "[cron] streaming stability jobs installed for $PANEL"
