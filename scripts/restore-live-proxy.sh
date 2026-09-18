#!/usr/bin/env bash
# Live routing for panel nginx.
# - classic-lb (XUI co-located): :8080 proxies media to classic-lb (same as :80/:443)
# - remote splice / other: :8080 returns 502 for media (clients use server_info LB URL)
# Never return 302 for /live/ (Xtream apps ignore redirects).
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

# XUI classic-lb on this host: proxy media locally (Main + LB both play).
CLASSIC_LOCAL=0
if [ "${NEXLIFY_CLASSIC_LB:-0}" = "1" ] || [ "${NEXLIFY_PLAYBACK_TOPOLOGY:-}" = "classic-lb" ]; then
  CLASSIC_LOCAL=1
fi
case "$REMOTE_IP" in
  127.0.0.1|localhost) CLASSIC_LOCAL=1 ;;
esac
if [ -f /etc/nexlify-lb/lb.env ] && ss -lntp 2>/dev/null | grep -qE ':8090\b'; then
  CLASSIC_LOCAL=1
fi
LB_UPSTREAM="${NEXLIFY_CLASSIC_LB_UPSTREAM:-127.0.0.1:8090}"

pm2 stop nexlify-iptv-edge 2>/dev/null || true

if [ "$CLASSIC_LOCAL" = "1" ]; then
  MEDIA_BLOCK="    location ~ ^/(live|timeshift|movie|series)/ {
        # XUI Main+LB: proxy to classic-lb FFmpeg (never Next.js)
        proxy_pass http://${LB_UPSTREAM};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Connection \"\";
        proxy_buffering off;
        proxy_request_buffering off;
        proxy_max_temp_file_size 0;
        proxy_cache off;
        tcp_nodelay on;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }"
  FOOTER_MSG="XUI_CLASSIC_LB — Main :80/:443/:8080 and LB ${LB_UPSTREAM} both serve media"
else
  MEDIA_BLOCK="    location ~ ^/(live|timeshift|movie|series)/ {
        default_type text/plain;
        return 502 'use load balancer ${REMOTE_IP} for media';
    }"
  FOOTER_MSG="PANEL_MEDIA_PROXY_DISABLED — clients must use ${REMOTE}"
fi

chattr -i /etc/nginx/conf.d/nexlify-live-remote-edge.conf \
  /etc/nginx/conf.d/nexlify-panel-http.conf \
  /etc/nginx/conf.d/nexlify-panel-https.conf 2>/dev/null || true

cat > /etc/nginx/conf.d/nexlify-live-remote-edge.conf <<EOF
# Panel :8080 — API to Next; media → classic-lb (XUI) or 502 (remote LB only).
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

${MEDIA_BLOCK}

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

export NEXLIFY_CLASSIC_LB="${NEXLIFY_CLASSIC_LB:-$CLASSIC_LOCAL}"
bash "$ROOT/scripts/patch-panel-nginx-live-lock.sh"

rm -f /etc/nginx/conf.d/nexlify-stream-edge.conf /etc/nginx/conf.d/nexlify-stream-extra.conf
nginx -t
systemctl reload nginx 2>/dev/null || nginx -s reload 2>/dev/null || service nginx reload 2>/dev/null || true
echo "$FOOTER_MSG"
