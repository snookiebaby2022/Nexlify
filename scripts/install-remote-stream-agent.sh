#!/usr/bin/env bash
# Systemd stream agent on a remote edge (no monolithic token file).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PANEL_URL="${PANEL_URL:?Set PANEL_URL}"
AGENT_TOKEN="${AGENT_TOKEN:?Set AGENT_TOKEN}"
INSTALL_DIR="${INSTALL_DIR:-/opt/nexlify-agent}"

mkdir -p "$INSTALL_DIR"
cp "$ROOT/scripts/nexlify-stream-agent.sh" "$INSTALL_DIR/nexlify-stream-agent.sh"
chmod +x "$INSTALL_DIR/nexlify-stream-agent.sh"

if ! command -v ffmpeg >/dev/null 2>&1; then
  apt-get update -qq 2>/dev/null && apt-get install -y -qq ffmpeg curl ca-certificates jq 2>/dev/null || true
fi

cat > /etc/systemd/system/nexlify-agent.service <<EOF
[Unit]
Description=Nexlify Stream Agent (remote edge)
After=network.target

[Service]
Type=simple
Environment=PANEL_URL=${PANEL_URL}
Environment=AGENT_TOKEN=${AGENT_TOKEN}
Environment=POLL_SECS=30
Environment=NGINX_RELOAD_CMD=systemctl reload nginx
WorkingDirectory=${INSTALL_DIR}
ExecStart=${INSTALL_DIR}/nexlify-stream-agent.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable nexlify-agent
systemctl restart nexlify-agent
echo "[remote-agent] Running → ${PANEL_URL}"
