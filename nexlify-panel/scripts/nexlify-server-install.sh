#!/usr/bin/env bash
# Nexlify stream server bootstrap — run as root on a fresh Ubuntu/Debian VPS
set -euo pipefail

PANEL_URL="${PANEL_URL:-}"
AGENT_TOKEN="${AGENT_TOKEN:-}"
INSTALL_DIR="${INSTALL_DIR:-/opt/nexlify-agent}"

echo "[nexlify] Installing dependencies..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq curl ca-certificates ffmpeg nginx

mkdir -p "$INSTALL_DIR"
curl -fsSL "${PANEL_URL%/}/scripts/nexlify-stream-agent.sh" -o "$INSTALL_DIR/nexlify-stream-agent.sh" 2>/dev/null || \
  curl -fsSL "https://raw.githubusercontent.com/nexlify/nexlify-panel/main/scripts/nexlify-stream-agent.sh" -o "$INSTALL_DIR/nexlify-stream-agent.sh" || true

chmod +x "$INSTALL_DIR/nexlify-stream-agent.sh" 2>/dev/null || true

cat > /etc/systemd/system/nexlify-agent.service <<EOF
[Unit]
Description=Nexlify Stream Agent
After=network.target

[Service]
Type=simple
Environment=PANEL_URL=${PANEL_URL}
Environment=AGENT_TOKEN=${AGENT_TOKEN}
Environment=INSTALL_DIR=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/nexlify-stream-agent.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable nexlify-agent
systemctl restart nexlify-agent || echo "[nexlify] Start agent manually after setting PANEL_URL and AGENT_TOKEN"

echo "[nexlify] Done. Agent token: ${AGENT_TOKEN:0:8}..."
echo "[nexlify] Register this server in Admin → Servers and paste the agent token."
