#!/usr/bin/env bash
# LOCKED PATH: panel MUST NOT proxy media (kills ~1G panel-proxy wall).
# Clients play on LB 209.237.141.15 only. NEVER return 302 for /live/.
# Immutable after: bash scripts/lock-live-routing-45.sh
set -euo pipefail
if [ -f /etc/nexlify/live-routing.lock ] && [ "${LIVE_ROUTING_FORCE:-}" != "1" ]; then
  if lsattr /etc/nginx/conf.d/nexlify-live-remote-edge.conf 2>/dev/null | grep -q '^....i'; then
    echo "LIVE_ROUTING_LOCKED — skip rewrite (unlock: bash scripts/lock-live-routing-45.sh unlock)"
    exit 0
  fi
fi
REMOTE="${REMOTE_EDGE:-209.237.141.15:8080}"
REMOTE_IP="${REMOTE%%:*}"
PANEL_LISTEN="${PANEL_LISTEN:-13000}"

pm2 stop nexlify-iptv-edge 2>/dev/null || true

cat > /etc/nginx/conf.d/nexlify-live-remote-edge.conf <<EOF
# Panel :8080 — API/auth to Next; media DISABLED (direct LB only).
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

geo \$nexlify_from_remote_edge {
    default 0;
    ${REMOTE_IP} 1;
}

server {
    listen 8080;
    listen [::]:8080;
    server_name _;

    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_request_buffering off;

    location = /c {
        proxy_pass http://nexlify_panel_backend/c;
        proxy_set_header Host \$host;
        proxy_set_header Authorization \$http_authorization;
        proxy_set_header X-Real-IP \$http_x_real_ip;
        proxy_set_header X-Forwarded-For \$http_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 300s;
    }

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

    # Media on panel is disabled — players must use LB ${REMOTE_IP} (server_info.url).
    location ~ ^/(live|timeshift|movie|series)/ {
        default_type text/plain;
        return 502 'use load balancer ${REMOTE_IP} for media';
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

# Disable panel media proxy on :80/:443 — force clients onto LB IP.
MEDIA = r'''    location ~ ^/(live|timeshift|movie|series)/ {
        # Panel media proxy DISABLED — prevents ~1G panel hairpin / buffering.
        default_type text/plain;
        return 502 'use load balancer 209.237.141.15 for media';
    }
'''

# Catalog/API must stay on the panel. Only media is refused (502 → use LB).
API = r'''    location ~ ^/(player_api\.php|panel_api\.php|get\.php|xmltv\.php|c/|stalker_portal/) {
        proxy_pass http://127.0.0.1:13000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Forwarded-Port $server_port;
        proxy_set_header X-Nexlify-Client-Port $server_port;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
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
    t2, count = re.subn(
        r"(?ms)^    location ~ \^/\(live\|timeshift\|movie\|series\)/ \{\n.*?^    \}\n",
        MEDIA,
        t,
        count=1,
    )
    if count == 1:
        t = t2
        print("disabled panel media proxy", p)
    else:
        t3, count2 = re.subn(
            r"(?ms)^    location ~ \^/\(player_api\\.php\|panel_api\\.php\|get\\.php\|xmltv\\.php\|live/\|timeshift/\|movie/\|series/\|c/\|stalker_portal/\) \{\n.*?^    \}\n",
            MEDIA + "\n" + API,
            t,
            count=1,
        )
        if count2 == 1:
            t = t3
            print("split+disabled media", p)
        else:
            print(f"skip media {p}: dedicated={count} combined={count2}")
            continue
    # Keep API on edge catalog cache
    t4, napi = re.subn(
        r"(?ms)^    location ~ \^/\(player_api\\.php\|panel_api\\.php\|get\\.php\|xmltv\\.php\|c/\|stalker_portal/\) \{\n.*?^    \}\n",
        API,
        t,
        count=1,
    )
    if napi == 1:
        t = t4
        print("api→panel", p)
    p.write_text(t)
    print("wrote", p)
PY

rm -f /etc/nginx/conf.d/nexlify-stream-edge.conf /etc/nginx/conf.d/nexlify-stream-extra.conf
nginx -t
systemctl reload nginx || nginx -s reload
echo "PANEL_MEDIA_PROXY_DISABLED — clients must use ${REMOTE}"
