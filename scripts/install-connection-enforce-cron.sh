#!/usr/bin/env bash
# Install a sane LiveConnection enforce schedule (once/minute, not 4×/minute).
# The old sleep 15/30/45 pattern thrashed Postgres and kicked viewers when pulses lagged.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PANEL="${PANEL_DIR:-/opt/nexlify-panel}"
[ -d "$PANEL" ] || PANEL="$ROOT"

MARK="nexlify-connection-enforce"
tmp="$(mktemp)"
(crontab -l 2>/dev/null || true) \
  | grep -v "$MARK" \
  | grep -v 'enforce-max-connections' \
  | grep -v 'enforce-max-connections-fast' > "$tmp" || true

cat >> "$tmp" <<CRON
# $MARK
* * * * * cd $PANEL && /usr/bin/node scripts/enforce-max-connections.cjs >> /var/log/nexlify-enforce-conns.log 2>&1
* * * * * cd $PANEL && /usr/bin/node scripts/enforce-max-connections-fast.cjs >> /var/log/nexlify-enforce-conns.log 2>&1
CRON

crontab "$tmp"
rm -f "$tmp"
echo "[cron] connection enforce schedule installed (1×/min) for $PANEL"
crontab -l | grep -E 'enforce-max|connection-enforce' || true
