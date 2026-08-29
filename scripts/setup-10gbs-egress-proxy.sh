#!/bin/bash
# Install tinyproxy on 10gbs — egress for panel edge (provider blocks 45 IP).
set -euo pipefail
PANEL_IP="${PANEL_IP:-45.88.138.18}"
PORT="${PORT:-8888}"

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq tinyproxy

CONF=/etc/tinyproxy/tinyproxy.conf
grep -q "^Port ${PORT}" "$CONF" || sed -i "s/^Port .*/Port ${PORT}/" "$CONF"
grep -q "^Allow ${PANEL_IP}" "$CONF" || echo "Allow ${PANEL_IP}" >> "$CONF"
grep -q '^Allow 127.0.0.1' "$CONF" || echo "Allow 127.0.0.1" >> "$CONF"

systemctl enable tinyproxy
systemctl restart tinyproxy
systemctl is-active tinyproxy
echo "tinyproxy on :${PORT} allows ${PANEL_IP}"
