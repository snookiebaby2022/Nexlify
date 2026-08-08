#!/usr/bin/env bash
# Install stream agent on the same host as the panel (monolithic profile).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

INSTALL_DIR="${INSTALL_DIR:-/opt/nexlify-agent}"
TOKEN_FILE="$ROOT/.nexlify-agent-token"

read_env() {
  grep "^${1}=" "$ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^["'\'' ]*//' -e 's/["'\'' ]*$//' || true
}

PRIMARY="$(read_env PANEL_PRIMARY_DOMAIN)"
PUB_PORT="$(read_env PANEL_PUBLIC_PORT)"
HTTPS_ACTIVE=0
if [ -f "/etc/letsencrypt/live/${PRIMARY}/fullchain.pem" ]; then
  HTTPS_ACTIVE=1
fi

if [ "$HTTPS_ACTIVE" = "1" ] || [ "$PUB_PORT" = "443" ]; then
  PANEL_URL="https://${PRIMARY}"
else
  PANEL_URL="http://${PRIMARY}"
fi

AGENT_TOKEN=""
if [ -f "$TOKEN_FILE" ]; then
  AGENT_TOKEN="$(tr -d '\r\n' < "$TOKEN_FILE")"
fi
[ -n "$AGENT_TOKEN" ] || { echo "[local-agent] ERROR: no token — run install-monolithic-profile.sh first" >&2; exit 1; }

mkdir -p "$INSTALL_DIR"
cp "$ROOT/scripts/nexlify-stream-agent.sh" "$INSTALL_DIR/nexlify-stream-agent.sh"
chmod +x "$INSTALL_DIR/nexlify-stream-agent.sh"

export DEBIAN_FRONTEND=noninteractive
if ! command -v ffmpeg >/dev/null 2>&1; then
  apt-get update -qq 2>/dev/null || true
  apt-get install -y -qq ffmpeg curl ca-certificates jq 2>/dev/null || true
fi

cat > /etc/systemd/system/nexlify-agent.service <<EOF
[Unit]
Description=Nexlify Stream Agent (local monolithic)
After=network.target nginx.service

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
systemctl restart nexlify-agent || echo "[local-agent] WARN: agent start failed — check journalctl -u nexlify-agent"

echo "[local-agent] Running on ${PANEL_URL} (token from ${TOKEN_FILE})"
