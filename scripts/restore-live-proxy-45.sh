#!/usr/bin/env bash
# LOCKED PATH: proxy /live/ → 10gbs (200 MPEG-TS/HLS). NEVER return 302.
# Immutable after: bash scripts/lock-live-routing-45.sh
set -euo pipefail
if [ -f /etc/nexlify/live-routing.lock ] && [ "${LIVE_ROUTING_FORCE:-}" != "1" ]; then
  if lsattr /etc/nginx/conf.d/nexlify-live-remote-edge.conf 2>/dev/null | grep -q '^....i'; then
    echo "LIVE_ROUTING_LOCKED — skip rewrite (unlock: bash scripts/lock-live-routing-45.sh unlock)"
    exit 0
  fi
fi
REMOTE="${REMOTE_EDGE:-209.237.141.15:8080}"
PANEL_LISTEN="${PANEL_LISTEN:-13000}"

pm2 stop nexlify-iptv-edge 2>/dev/null || true

cat > /etc/nginx/conf.d/nexlify-live-remote-edge.conf <<EOF
# Live MPEG-TS must not share a keepalive pool — reused sockets stall / glitch.
upstream nexlify_remote_edge {
    server ${REMOTE};
}
upstream nexlify_remote_edge_api {
    server ${REMOTE};
    keepalive 256;
}
upstream nexlify_panel_backend {
    server 127.0.0.1:${PANEL_LISTEN};
    keepalive 256;
}

server {
    listen 8080;
    listen [::]:8080;
    server_name _;

    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_request_buffering off;

    location = /c/ {
        proxy_pass http://nexlify_panel_backend/c;
        proxy_set_header Host \$host;
        proxy_set_header Authorization \$http_authorization;
        proxy_set_header X-Real-IP \$http_x_real_ip;
        proxy_set_header X-Forwarded-For \$http_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 300s;
    }

    location ~ ^/(live|timeshift|movie|series)/ {
        proxy_pass http://nexlify_remote_edge;
        proxy_set_header Host \$host;
        proxy_set_header Connection "close";
        proxy_set_header X-Real-IP \$remote_addr;
        # Keep the :80 hop's client IP. Overwriting with \$remote_addr here is 127.0.0.1.
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Range \$http_range;
        proxy_set_header User-Agent \$http_user_agent;
        proxy_connect_timeout 10s;
        proxy_send_timeout 3600s;
        proxy_read_timeout 3600s;
        proxy_buffering off;
    }

    location ~ ^/(player_api\\.php|get\\.php|xmltv\\.php|c/|stalker_portal/|api/) {
        proxy_pass http://nexlify_panel_backend;
        proxy_set_header Host \$host;
        proxy_set_header Authorization \$http_authorization;
        proxy_set_header X-Nexlify-Agent-Server-Id \$http_x_nexlify_agent_server_id;
        proxy_set_header X-Original-Uri \$http_x_original_uri;
        proxy_set_header X-Original-Method \$http_x_original_method;
        proxy_set_header X-Original-Range \$http_x_original_range;
        proxy_set_header X-Real-IP \$http_x_real_ip;
        proxy_set_header X-Forwarded-For \$http_x_forwarded_for;
        proxy_set_header X-Nexlify-Client-Ip \$http_x_nexlify_client_ip;
        proxy_set_header X-Nexlify-Viewer-Ip \$http_x_nexlify_viewer_ip;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 300s;
    }

    location / {
        proxy_pass http://nexlify_panel_backend;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 300s;
    }
}
EOF

python3 - <<'PY'
import re
from pathlib import Path

PROXY = r'''    location ~ ^/(live|timeshift|movie|series)/ {
        proxy_pass http://209.237.141.15:8080;
        proxy_http_version 1.1;
        proxy_set_header Connection "close";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header Range $http_range;
        proxy_set_header User-Agent $http_user_agent;
        proxy_connect_timeout 10s;
        proxy_send_timeout 3600s;
        proxy_read_timeout 3600s;
        proxy_buffering off;
        proxy_request_buffering off;
    }
'''

for p in [
    Path("/etc/nginx/conf.d/nexlify-panel-http.conf"),
    Path("/etc/nginx/conf.d/nexlify-panel-https.conf"),
]:
    if not p.exists():
        continue
    t = p.read_text()
    t, count = re.subn(
        r"(?ms)^    location ~ \^/\(live\|timeshift\|movie\|series\)/ \{\n.*?^    \}\n",
        PROXY,
        t,
        count=1,
    )
    if count != 1:
        print(f"skip {p}: media location not found exactly once (count={count})")
        continue
    p.write_text(t)
    print("patched", p)
PY

rm -f /etc/nginx/conf.d/nexlify-stream-edge.conf /etc/nginx/conf.d/nexlify-stream-extra.conf
nginx -t
systemctl reload nginx || nginx -s reload
echo "PROXY_LIVE_OK → ${REMOTE}"
