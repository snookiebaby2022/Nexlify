#!/usr/bin/env bash
# Start systemd synthetic RTMP/HLS test pattern + create DB fixture on server 75.
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=/dev/null
source "$SCRIPT_DIR/harden-75-host-guard.sh"

PANEL="${PANEL_ROOT:-/opt/nexlify-panel}"
cd "$PANEL"

# Serve nginx-rtmp's generated HLS only on loopback. The panel/edge can read
# the fixture while it remains inaccessible as an unauthenticated public URL.
cat > /etc/nginx/conf.d/nexlify-smoke-hls.conf <<'NGINX'
server {
    listen 127.0.0.1:8090;
    server_name _;

    location / {
        root /var/www/nexlify-hls;
        types {
            application/vnd.apple.mpegurl m3u8;
            video/mp2t ts;
        }
        add_header Cache-Control "no-store";
        add_header Access-Control-Allow-Origin "*";
    }
}
NGINX
nginx -t
systemctl reload nginx

cat > /etc/systemd/system/nexlify-smoke-ts.service <<UNIT
[Unit]
Description=Nexlify loopback MPEG-TS smoke source
After=network.target

[Service]
Type=simple
WorkingDirectory=$PANEL
ExecStart=/usr/bin/node $PANEL/scripts/smoke-ts-source.mjs
Restart=always
RestartSec=2
User=root

[Install]
WantedBy=multi-user.target
UNIT

UNIT=/etc/systemd/system/nexlify-smoke-source.service
cat > "$UNIT" <<'UNIT'
[Unit]
Description=Nexlify synthetic smoke test pattern (RTMP)
After=network.target nginx.service

[Service]
Type=simple
Restart=always
RestartSec=5
ExecStart=/usr/bin/ffmpeg -hide_banner -loglevel error -re -f lavfi -i smptebars=size=1280x720:rate=25 -f lavfi -i sine=frequency=1000:sample_rate=48000 -c:v libx264 -preset veryfast -tune zerolatency -pix_fmt yuv420p -g 50 -c:a aac -b:a 128k -f flv rtmp://127.0.0.1/live/smoke-test
User=root

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable nexlify-smoke-source
systemctl enable nexlify-smoke-ts
systemctl restart nexlify-smoke-source
systemctl restart nexlify-smoke-ts
sleep 3
systemctl is-active nexlify-smoke-source
systemctl is-active nexlify-smoke-ts

echo "==> DB fixture"
node scripts/ensure-smoke-synthetic-fixture.cjs | tail -1

echo "playback_fixture_ok"
