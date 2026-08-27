#!/usr/bin/env bash
# Cron: multi-edge health every 5 min + 20k readiness daily.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PANEL="${PANEL_DIR:-/opt/nexlify-panel}"
MARK="nexlify-edge-fleet-cron"
tmp="$(mktemp)"
crontab -l 2>/dev/null | grep -v "$MARK" | grep -v verify-multi-edge-health | grep -v verify-20k-readiness || true > "$tmp"

cat >> "$tmp" <<CRON
# $MARK
*/5 * * * * [ -n "\$EDGE_IPS" ] && EDGE_IPS=\$(grep ^EDGE_IPS= $PANEL/.env 2>/dev/null | cut -d= -f2) && [ -n "\$EDGE_IPS" ] && EDGE_IPS=\$EDGE_IPS $PANEL/scripts/verify-multi-edge-health.sh >> /var/log/nexlify-edge-health.log 2>&1
0 4 * * * VERIFY_USER=\$(grep ^VERIFY_USER= $PANEL/.env 2>/dev/null | cut -d= -f2) VERIFY_PASS=\$(grep ^VERIFY_PASS= $PANEL/.env 2>/dev/null | cut -d= -f2) $PANEL/scripts/verify-20k-readiness.sh >> /var/log/nexlify-20k-check.log 2>&1
CRON

crontab "$tmp"
rm -f "$tmp"
echo "[edge-fleet-cron] installed"
