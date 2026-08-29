#!/bin/bash
# LOCKED PATH: proxy /live/ → 10gbs. NEVER return 302. See scripts/lock-live-routing-45.sh
set -euo pipefail
if [ -f /etc/nexlify/live-routing.lock ] && [ "${LIVE_ROUTING_FORCE:-}" != "1" ]; then
  if lsattr /etc/nginx/conf.d/nexlify-live-remote-edge.conf 2>/dev/null | grep -q '^....i'; then
    echo "LIVE_ROUTING_LOCKED — skip rewrite"
    exit 0
  fi
fi
REMOTE_EDGE="${REMOTE_EDGE:-209.237.141.15:8080}"
PANEL_LISTEN="${PANEL_LISTEN:-13000}"
CONF="/etc/nginx/conf.d/nexlify-live-remote-edge.conf"

# Release :8080 from local Node edge — nginx owns split routing (XUI-style).
pm2 stop nexlify-iptv-edge 2>/dev/null || true
# Do NOT fuser -k :8080 — that kills nginx workers bound on the same port.
sleep 1

cat > "$CONF" <<EOF
# XUI-style: panel serves Xtream API; stream node serves live bytes.
upstream nexlify_remote_edge {
    server ${REMOTE_EDGE};
    keepalive 128;
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

    location ~ ^/(player_api\.php|get\.php|xmltv\.php|timeshift/|movie/|series/|c/|stalker_portal/|api/) {
        proxy_pass http://nexlify_panel_backend;
        proxy_set_header Host \$host;
        proxy_set_header Authorization \$http_authorization;
        proxy_set_header X-Nexlify-Agent-Server-Id \$http_x_nexlify_agent_server_id;
        proxy_set_header X-Original-Uri \$http_x_original_uri;
        proxy_set_header X-Original-Method \$http_x_original_method;
        proxy_set_header X-Original-Range \$http_x_original_range;
        proxy_set_header X-Real-IP \$remote_addr;
        # Overwrite client-supplied XFF; the remote edge trusts this panel IP.
        proxy_set_header X-Forwarded-For \$remote_addr;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_connect_timeout 10s;
        proxy_read_timeout 300s;
    }

    location ~ ^/(live|timeshift|movie|series)/ {
        proxy_pass http://nexlify_remote_edge;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Range \$http_range;
        proxy_set_header User-Agent \$http_user_agent;
        proxy_connect_timeout 10s;
        proxy_send_timeout 3600s;
        proxy_read_timeout 3600s;
        proxy_buffering off;
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

# Drop conflicting stream-edge vhost that also binds :8080
rm -f /etc/nginx/conf.d/nexlify-stream-edge.conf /etc/nginx/conf.d/nexlify-stream-extra.conf 2>/dev/null || true

if ! systemctl is-active --quiet nginx 2>/dev/null; then
  systemctl start nginx 2>/dev/null || service nginx start 2>/dev/null || true
fi

nginx -t
if systemctl is-active --quiet nginx 2>/dev/null; then
  systemctl reload nginx 2>/dev/null || nginx -s reload 2>/dev/null || true
else
  systemctl start nginx 2>/dev/null || service nginx start 2>/dev/null || true
fi
echo "XUI routing: API→127.0.0.1:${PANEL_LISTEN} live→${REMOTE_EDGE}"
