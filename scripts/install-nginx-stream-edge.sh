#!/usr/bin/env bash
# Install / refresh Nexlify HTTP stream edge (Xtream / M3U / live / MAG).
# Supports primary + extra HTTP listen ports from .env (STREAM_HTTP_EXTRA_PORTS).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=scripts/nexlify-port-registry.sh
source "$ROOT/scripts/nexlify-port-registry.sh"
nexlify_load_ports_from_env "$ROOT"

DEST="/etc/nginx/conf.d/nexlify-stream-edge.conf"
EXTRA_DEST="/etc/nginx/conf.d/nexlify-stream-extra.conf"
UPSTREAM="/etc/nginx/conf.d/nexlify-upstream.conf"
STREAM_PORT="$NEXLIFY_PORT_STREAM_HTTP"

nexlify_read_env_file() {
  grep "^${1}=" "$ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^["'\'' ]*//' -e 's/["'\'' ]*$//' || true
}

STREAM_HTTP_EXTRA="$(nexlify_read_env_file STREAM_HTTP_EXTRA_PORTS)"
PANEL_LISTEN="$(nexlify_read_env_file PORT)"
[ -z "$PANEL_LISTEN" ] && PANEL_LISTEN="13000"

collect_http_ports() {
  local ports="$1"
  local extra="${2:-}"
  extra="${extra//,/ }"
  local result="$ports"
  for p in $extra; do
    [ -z "$p" ] && continue
    result="$result $p"
  done
  echo "$result" | tr ' ' '\n' | awk '!seen[$0]++ && $0 != ""' | tr '\n' ' '
}

ALL_PORTS="$(collect_http_ports "$STREAM_PORT" "$STREAM_HTTP_EXTRA")"

write_stream_locations() {
  local fwd_port="$1"
  cat <<LOC
    location ~ ^/(player_api\.php|get\.php|xmltv\.php|live/|movie/|series/|c/|stalker_portal/) {
        if (\$request_method = OPTIONS) {
            add_header Access-Control-Allow-Origin "*";
            add_header Access-Control-Allow-Methods "GET, HEAD, OPTIONS";
            add_header Access-Control-Allow-Headers "Content-Type, User-Agent, Accept, Range";
            add_header Content-Length 0;
            return 204;
        }
        add_header Access-Control-Allow-Origin "*" always;
        add_header Access-Control-Allow-Methods "GET, HEAD, OPTIONS" always;
        add_header Access-Control-Allow-Headers "Content-Type, User-Agent, Accept, Range" always;

        proxy_pass http://nexlify_panel;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port ${fwd_port};
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto http;
        proxy_read_timeout 300s;
        proxy_buffering off;
    }

    location / {
        return 404;
    }
LOC
}

if [ "${NEXLIFY_USE_STREAM_EDGE_NGINX:-1}" != "1" ] || [ "$STREAM_PORT" = "${NEXLIFY_PORT_HTTP}" ]; then
  echo "[stream-edge] Direct HTTP on :${NEXLIFY_PORT_HTTP} — removing separate stream edge vhost"
  rm -f "$DEST" 2>/dev/null || true

  # Extra HTTP ports still need nginx → panel upstream in direct mode
  EXTRA_ONLY=""
  for p in $ALL_PORTS; do
    [ "$p" = "${NEXLIFY_PORT_HTTP}" ] && continue
    EXTRA_ONLY="$EXTRA_ONLY $p"
  done
  EXTRA_ONLY="${EXTRA_ONLY# }"

  if [ -n "$EXTRA_ONLY" ] && command -v nginx >/dev/null 2>&1; then
    echo "[stream-edge] Extra HTTP ports (direct mode): $EXTRA_ONLY"
    {
      echo "# Nexlify extra stream HTTP ports — generated $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      for p in $EXTRA_ONLY; do
        echo "server {"
        echo "    listen ${p} default_server;"
        echo "    listen [::]:${p} default_server;"
        echo "    server_name _;"
        echo "    client_max_body_size 50m;"
        echo "    large_client_header_buffers 8 64k;"
        write_stream_locations "$p"
        echo "}"
        echo ""
      done
    } > "$EXTRA_DEST"
  else
    rm -f "$EXTRA_DEST" 2>/dev/null || true
  fi

  if command -v nginx >/dev/null 2>&1; then
    nginx -t
    systemctl reload nginx
  fi
  bash "$ROOT/scripts/nexlify-firewall-ports.sh" || true
  exit 0
fi

if [ ! -f "$UPSTREAM" ]; then
  echo "[stream-edge] Installing nexlify-upstream.conf…"
  cp "$ROOT/nginx/nexlify-upstream.conf" "$UPSTREAM"
fi

{
  echo "# Nexlify stream edge — generated $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# Ports: $ALL_PORTS"
  echo "server {"
  for p in $ALL_PORTS; do
    echo "    listen ${p} default_server;"
    echo "    listen [::]:${p} default_server;"
  done
  echo "    server_name _;"
  echo ""
  echo "    client_max_body_size 50m;"
  echo "    large_client_header_buffers 8 64k;"
  echo ""
  write_stream_locations "$STREAM_PORT"
  echo "}"
} > "$DEST"

rm -f "$EXTRA_DEST" 2>/dev/null || true

nginx -t
systemctl reload nginx

bash "$ROOT/scripts/nexlify-firewall-ports.sh" || true

echo "[stream-edge] Ready on: $ALL_PORTS (player_api.php, get.php, live/, movie/, xmltv.php)"
