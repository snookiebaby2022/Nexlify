#!/usr/bin/env bash
# One-shot fix when stream edge conf is missing or nginx is stopped.
# Run on the VPS as root:
#   curl -fsSL https://raw.githubusercontent.com/nexlify/nexlify-panel/main/scripts/fix-stream-edge-now.sh | sudo bash
# Or from panel dir after sync:
#   sudo bash scripts/fix-stream-edge-now.sh
set -euo pipefail

PANEL_DIR=""
for d in /opt/nexlify-panel /home/nexlify-panel "$(pwd)"; do
  if [ -f "${d}/package.json" ] && [ -f "${d}/.env" ]; then
    PANEL_DIR="$d"
    break
  fi
done

if [ -z "$PANEL_DIR" ]; then
  echo "ERROR: Nexlify panel directory not found (tried /opt/nexlify-panel, /home/nexlify-panel)" >&2
  exit 1
fi

cd "$PANEL_DIR"
echo "[fix-stream-edge] Panel dir: $PANEL_DIR"

read_env() {
  grep "^${1}=" .env 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^["'\'' ]*//' -e 's/["'\'' ]*$//' || true
}

PRIMARY="$(read_env PANEL_PRIMARY_DOMAIN)"
BEHIND="$(read_env PANEL_BEHIND_NGINX)"
STREAM_PORT="$(read_env STREAM_HTTP_PORT)"
[ -z "$STREAM_PORT" ] && STREAM_PORT="$(read_env STREAM_EDGE_PORT)"
[ -z "$STREAM_PORT" ] && STREAM_PORT=8080

if [[ "${PRIMARY:-}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]] || [ "$BEHIND" = "0" ]; then
  STREAM_PORT=80
  echo "[fix-stream-edge] IP / direct mode — Xtream on port 80 (no separate :8080 vhost)"
  rm -f /etc/nginx/conf.d/nexlify-stream-edge.conf 2>/dev/null || true
else
  echo "[fix-stream-edge] Stream edge HTTP port: $STREAM_PORT"
  mkdir -p /etc/nginx/conf.d
  if [ ! -f /etc/nginx/conf.d/nexlify-upstream.conf ]; then
    if [ -f "$PANEL_DIR/nginx/nexlify-upstream.conf" ]; then
      cp "$PANEL_DIR/nginx/nexlify-upstream.conf" /etc/nginx/conf.d/nexlify-upstream.conf
    else
      cat >/etc/nginx/conf.d/nexlify-upstream.conf <<'UP'
upstream nexlify_panel {
    least_conn;
    server 127.0.0.1:13000;
    keepalive 32;
}
UP
    fi
  fi

  if [ -f "$PANEL_DIR/nginx/nexlify-stream-edge.conf" ]; then
    sed \
      -e "s/listen 8080 default_server/listen ${STREAM_PORT} default_server/g" \
      -e "s/listen \\[::\\]:8080 default_server/listen [::]:${STREAM_PORT} default_server/g" \
      -e "s/X-Forwarded-Port 8080/X-Forwarded-Port ${STREAM_PORT}/g" \
      "$PANEL_DIR/nginx/nexlify-stream-edge.conf" >/etc/nginx/conf.d/nexlify-stream-edge.conf
  else
    cat >/etc/nginx/conf.d/nexlify-stream-edge.conf <<NGX
server {
    listen ${STREAM_PORT} default_server;
    listen [::]:${STREAM_PORT} default_server;
    server_name _;
    client_max_body_size 50m;
    location ~ ^/(player_api\\.php|get\\.php|xmltv\\.php|live/|movie/|series/|c/|stalker_portal/) {
        proxy_pass http://nexlify_panel;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port ${STREAM_PORT};
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto http;
        proxy_read_timeout 300s;
        proxy_buffering off;
    }
    location / { return 404; }
}
NGX
  fi
fi

if ! command -v nginx >/dev/null 2>&1; then
  echo "[fix-stream-edge] Installing nginx…"
  apt-get update -qq
  apt-get install -y -qq nginx
fi

nginx -t
systemctl enable nginx
systemctl start nginx || systemctl reload nginx

if [ -f "$PANEL_DIR/scripts/nexlify-firewall-ports.sh" ]; then
  bash "$PANEL_DIR/scripts/nexlify-firewall-ports.sh" || true
else
  command -v ufw >/dev/null 2>&1 && ufw allow 8080/tcp 2>/dev/null || true
  command -v ufw >/dev/null 2>&1 && ufw allow 80/tcp 2>/dev/null || true
  command -v ufw >/dev/null 2>&1 && ufw allow 443/tcp 2>/dev/null || true
fi

echo "[fix-stream-edge] nginx: $(systemctl is-active nginx)"
ss -tlnp | grep -E ':80 |:443 |:8080 ' || true

if [ "$STREAM_PORT" != "80" ]; then
  code="$(curl -sS -o /dev/null -w '%{http_code}' "http://127.0.0.1:${STREAM_PORT}/player_api.php?username=x" 2>/dev/null || echo 000)"
  echo "[fix-stream-edge] player_api on :${STREAM_PORT} → HTTP ${code} (401/400 = OK)"
fi

echo "[fix-stream-edge] Done. Test Smarters with http://YOUR_SERVER_IP:${STREAM_PORT} (use IP, not Cloudflare domain)."
