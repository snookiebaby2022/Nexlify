#!/usr/bin/env bash
# Install MediaMTX WebRTC gateway on a stream server (Ubuntu/Debian).
# Usage: curl -fsSL ... | bash   OR   bash scripts/install-mediamtx-webrtc.sh
set -euo pipefail

MEDIAMTX_VERSION="${MEDIAMTX_VERSION:-1.9.3}"
INSTALL_DIR="${INSTALL_DIR:-/usr/local/bin}"
CONFIG_DIR="${CONFIG_DIR:-/etc/mediamtx}"
SERVICE_NAME="mediamtx"

arch="$(uname -m)"
case "$arch" in
  x86_64) MTX_ARCH="amd64" ;;
  aarch64|arm64) MTX_ARCH="arm64" ;;
  *) echo "Unsupported arch: $arch" >&2; exit 1 ;;
esac

tmp="$(mktemp -d /tmp/mediamtx-XXXXXX)"
cleanup() { rm -rf "$tmp"; }
trap cleanup EXIT

url="https://github.com/bluenviron/mediamtx/releases/download/v${MEDIAMTX_VERSION}/mediamtx_v${MEDIAMTX_VERSION}_linux_${MTX_ARCH}.tar.gz"
echo "Downloading MediaMTX v${MEDIAMTX_VERSION} ..."
curl -fsSL "$url" -o "$tmp/mediamtx.tar.gz"
tar -xzf "$tmp/mediamtx.tar.gz" -C "$tmp"
install -m 755 "$tmp/mediamtx" "$INSTALL_DIR/mediamtx"

mkdir -p "$CONFIG_DIR"
if [ ! -f "$CONFIG_DIR/mediamtx.yml" ]; then
  cat > "$CONFIG_DIR/mediamtx.yml" <<'YAML'
# Nexlify WebRTC gateway — paths added dynamically via panel API
logLevel: info
api: yes
apiAddress: :9997
webrtc: yes
webrtcAddress: :8889
webrtcICEServers2:
  - url: stun:stun.l.google.com:19302
paths: {}
YAML
  echo "Created $CONFIG_DIR/mediamtx.yml"
fi

cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=MediaMTX WebRTC gateway (Nexlify)
After=network.target

[Service]
Type=simple
ExecStart=${INSTALL_DIR}/mediamtx ${CONFIG_DIR}/mediamtx.yml
Restart=always
RestartSec=3
LimitNOFILE=65536

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable "$SERVICE_NAME"
systemctl restart "$SERVICE_NAME"

echo "MediaMTX installed. WebRTC :8889 · API :9997"
echo "Panel → Settings → WebRTC: set gatewayBaseUrl=http://$(hostname -I | awk '{print $1}'):8889"
echo "                     mediamtxApiUrl=http://127.0.0.1:9997"
