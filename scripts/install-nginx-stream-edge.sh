#!/usr/bin/env bash
# Install / refresh Nexlify HTTP stream edge (Xtream / M3U / live / MAG).
# Supports primary + extra HTTP listen ports from .env (STREAM_HTTP_EXTRA_PORTS).
#
# IMPORTANT: nginx cannot share TCP ports with the Node IPTV edge. When
# NEXLIFY_USE_IPTV_EDGE is enabled (default on modern installs), ports such as
# 8080/25461/(optional 443) are skipped here so edge owns them and nginx keeps :80.
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
EDGE_OWNED="$(nexlify_iptv_edge_owned_ports "$ROOT")"

nexlify_read_env_file() {
  grep "^${1}=" "$ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^["'\'' ]*//' -e 's/["'\'' ]*$//' || true
}

STREAM_HTTP_EXTRA="$(nexlify_read_env_file STREAM_HTTP_EXTRA_PORTS)"
PANEL_LISTEN="$(nexlify_read_env_file PORT)"
[ -z "$PANEL_LISTEN" ] && PANEL_LISTEN="13000"

port_owned_by_edge() {
  local port="$1" p
  for p in $EDGE_OWNED; do
    [ "$p" = "$port" ] && return 0
  done
  return 1
}

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

ALL_PORTS_RAW="$(collect_http_ports "$STREAM_PORT" "$STREAM_HTTP_EXTRA")"
ALL_PORTS=""
SKIPPED=""
for p in $ALL_PORTS_RAW; do
  if port_owned_by_edge "$p"; then
    SKIPPED="$SKIPPED $p"
    continue
  fi
  ALL_PORTS="$ALL_PORTS $p"
done
ALL_PORTS="${ALL_PORTS# }"
SKIPPED="${SKIPPED# }"
if [ -n "$SKIPPED" ]; then
  echo "[stream-edge] Skipping nginx listen on IPTV-edge ports: $SKIPPED (edge owns these; nginx keeps :80)"
fi

write_stream_locations() {
  local fwd_port="$1"
  local upstream_target="${2:-http://nexlify_panel}"
  cat <<LOC
    location = /xmltv.php {
        gzip off;
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
        proxy_pass ${upstream_target};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port ${fwd_port};
        proxy_set_header X-Nexlify-Client-Port ${fwd_port};
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto http;
        proxy_set_header Accept-Encoding "";
        proxy_read_timeout 300s;
        proxy_buffering off;
    }

    location ~ ^/(player_api\.php|panel_api\.php|get\.php|xmltv\.php|live/|timeshift/|movie/|series/|c/|stalker_portal/) {
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

        proxy_pass ${upstream_target};
        proxy_http_version 1.1;
        # Preserve the listen port IPTV apps used (Next may rewrite x-forwarded-port to upstream).
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_set_header X-Forwarded-Port ${fwd_port};
        proxy_set_header X-Nexlify-Client-Port ${fwd_port};
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
  # Panel owns :80 — never let the distro default site fight it.
  rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true
  # Legacy RTMP in conf.d breaks nginx -t
  rm -f /etc/nginx/conf.d/nexlify-rtmp.conf 2>/dev/null || true

  # Ensure upstream matches panel listen port
  mkdir -p "$(dirname "$UPSTREAM")"
  cat > "$UPSTREAM" <<UP
upstream nexlify_panel {
    least_conn;
    server 127.0.0.1:${PANEL_LISTEN};
    keepalive 32;
}
UP

  # Extra HTTP ports still need nginx → panel upstream in direct mode
  # (ports owned by IPTV edge are already filtered out of ALL_PORTS)
  EXTRA_ONLY=""
  for p in $ALL_PORTS; do
    [ "$p" = "${NEXLIFY_PORT_HTTP}" ] && continue
    [ "$p" = "$PANEL_LISTEN" ] && continue
    EXTRA_ONLY="$EXTRA_ONLY $p"
  done
  EXTRA_ONLY="${EXTRA_ONLY# }"

  if [ -n "$EXTRA_ONLY" ] && command -v nginx >/dev/null 2>&1; then
    echo "[stream-edge] Extra HTTP ports (direct mode): $EXTRA_ONLY → 127.0.0.1:${PANEL_LISTEN}"
    {
      echo "# Nexlify extra stream HTTP ports — generated $(date -u +%Y-%m-%dT%H:%M:%SZ)"
      for p in $EXTRA_ONLY; do
        echo "server {"
        echo "    listen ${p} default_server;"
        echo "    listen [::]:${p} default_server;"
        echo "    server_name _;"
        echo "    client_max_body_size 50m;"
        echo "    large_client_header_buffers 8 64k;"
        write_stream_locations "$p" "http://127.0.0.1:${PANEL_LISTEN}"
        echo "}"
        echo ""
      done
    } > "$EXTRA_DEST"
  else
    rm -f "$EXTRA_DEST" 2>/dev/null || true
    # Drop stale disabled leftovers when edge owns extras
    rm -f "${EXTRA_DEST}.disabled" 2>/dev/null || true
  fi

  if command -v nginx >/dev/null 2>&1; then
    nginx -t
    if systemctl is-active --quiet nginx 2>/dev/null; then
      systemctl reload nginx
    else
      systemctl start nginx
    fi
  fi
  bash "$ROOT/scripts/nexlify-firewall-ports.sh" || true
  exit 0
fi

# No nginx stream ports left (all owned by IPTV edge) — keep upstream only
if [ -z "$ALL_PORTS" ]; then
  echo "[stream-edge] No nginx stream ports to bind — IPTV edge owns stream HTTP"
  rm -f "$DEST" "$EXTRA_DEST" 2>/dev/null || true
  mkdir -p "$(dirname "$UPSTREAM")"
  cat > "$UPSTREAM" <<UP
upstream nexlify_panel {
    least_conn;
    server 127.0.0.1:${PANEL_LISTEN};
    keepalive 32;
}
UP
  if command -v nginx >/dev/null 2>&1; then
    nginx -t
    if systemctl is-active --quiet nginx 2>/dev/null; then
      systemctl reload nginx
    else
      systemctl start nginx
    fi
  fi
  bash "$ROOT/scripts/nexlify-firewall-ports.sh" || true
  exit 0
fi

# Legacy RTMP in conf.d breaks nginx -t
rm -f /etc/nginx/conf.d/nexlify-rtmp.conf 2>/dev/null || true

if [ ! -f "$UPSTREAM" ]; then
  echo "[stream-edge] Installing nexlify-upstream.conf…"
  cat > "$UPSTREAM" <<UP
upstream nexlify_panel {
    least_conn;
    server 127.0.0.1:${PANEL_LISTEN};
    keepalive 32;
}
UP
else
  # Refresh upstream port from .env
  cat > "$UPSTREAM" <<UP
upstream nexlify_panel {
    least_conn;
    server 127.0.0.1:${PANEL_LISTEN};
    keepalive 32;
}
UP
fi

{
  echo "# Nexlify stream edge — generated $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "# Ports: $ALL_PORTS (one server block per port so X-Forwarded-Port is correct)"
  for p in $ALL_PORTS; do
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
} > "$DEST"

rm -f "$EXTRA_DEST" 2>/dev/null || true

nginx -t
if systemctl is-active --quiet nginx 2>/dev/null; then
  systemctl reload nginx
else
  systemctl start nginx
fi

bash "$ROOT/scripts/nexlify-firewall-ports.sh" || true

echo "[stream-edge] Ready on: $ALL_PORTS (player_api.php, get.php, live/, movie/, xmltv.php)"
