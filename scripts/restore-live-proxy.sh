#!/usr/bin/env bash
# Panel MUST NOT proxy media (kills panel-proxy bandwidth wall).
# Clients play on the remote LB from server_info.url — NEVER return 302 for /live/.
# Immutable after: bash scripts/lock-live-routing.sh
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
. "$ROOT/scripts/live-routing-env.sh"

LOCK_SCRIPT="lock-live-routing.sh"
if [ -f /etc/nexlify/live-routing.lock ] && [ "${LIVE_ROUTING_FORCE:-}" != "1" ]; then
  if lsattr /etc/nginx/conf.d/nexlify-live-remote-edge.conf 2>/dev/null | grep -q '^....i'; then
    echo "LIVE_ROUTING_LOCKED — skip rewrite (unlock: bash scripts/${LOCK_SCRIPT} unlock)"
    exit 0
  fi
fi

REMOTE="$(nexlify_resolve_remote_edge)"
if [ -z "$REMOTE" ]; then
  echo "ERROR: set NEXLIFY_REMOTE_EDGE=host:port or line 2 of /etc/nexlify/playback-topology" >&2
  exit 1
fi
REMOTE_IP="${REMOTE%%:*}"
PANEL_LISTEN="$(nexlify_resolve_panel_listen)"

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

bash "$ROOT/scripts/patch-panel-nginx-live-lock.sh"

rm -f /etc/nginx/conf.d/nexlify-stream-edge.conf /etc/nginx/conf.d/nexlify-stream-extra.conf
nginx -t
systemctl reload nginx 2>/dev/null || nginx -s reload 2>/dev/null || service nginx reload 2>/dev/null || true
echo "PANEL_MEDIA_PROXY_DISABLED — clients must use ${REMOTE}"
