#!/usr/bin/env bash
# Idempotent systemd @reboot hook: ensure nexlify-iptv-edge after pm2-root/network.
set -euo pipefail

PANEL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
UNIT=/etc/systemd/system/nexlify-iptv-edge-ensure.service
ENSURE="$PANEL_DIR/scripts/ensure-iptv-edge-pm2.sh"

if [ ! -x "$ENSURE" ]; then
  echo "[install-iptv-edge-boot] missing $ENSURE" >&2
  exit 1
fi

cat >"$UNIT" <<EOF
[Unit]
Description=Nexlify IPTV edge (PM2 ensure after boot)
After=network-online.target pm2-root.service
Wants=network-online.target

[Service]
Type=oneshot
ExecStart=/bin/bash ${ENSURE}
RemainAfterExit=yes

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable nexlify-iptv-edge-ensure.service >/dev/null 2>&1 || true
echo "[install-iptv-edge-boot] enabled nexlify-iptv-edge-ensure.service"
