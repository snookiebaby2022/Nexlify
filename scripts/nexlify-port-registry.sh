#!/usr/bin/env bash
# Canonical Nexlify panel + IPTV port definitions (source from other scripts).
# Customer-facing ports are opened by nexlify-firewall-ports.sh.
# Internal upstream ports (13000, 13001) must never be exposed in UFW.

NEXLIFY_PORT_SSH="${NEXLIFY_PORT_SSH:-22}"
NEXLIFY_PORT_HTTP="${NEXLIFY_PORT_HTTP:-80}"
NEXLIFY_PORT_HTTPS="${NEXLIFY_PORT_HTTPS:-443}"
NEXLIFY_PORT_STREAM_HTTP="${NEXLIFY_PORT_STREAM_HTTP:-8080}"
NEXLIFY_PORT_RTMP="${NEXLIFY_PORT_RTMP:-1935}"
NEXLIFY_PORT_RTSP="${NEXLIFY_PORT_RTSP:-554}"

# Never open these to the public internet.
NEXLIFY_PORTS_INTERNAL="13000 13001 5432 6379 3000 3001"

nexlify_read_env_file() {
  local key="$1" file="${2:-.env}"
  [ -f "$file" ] || return 0
  grep "^${key}=" "$file" 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^["'\'' ]*//' -e 's/["'\'' ]*$//' || true
}

nexlify_is_ip_host() {
  [[ "${1:-}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]
}

# Load ports from .env when present (project root).
nexlify_load_ports_from_env() {
  local root="${1:-.}"
  local primary stream behind

  primary="$(nexlify_read_env_file PANEL_PRIMARY_DOMAIN "$root/.env")"
  stream="$(nexlify_read_env_file STREAM_HTTP_PORT "$root/.env")"
  [ -z "$stream" ] && stream="$(nexlify_read_env_file STREAM_EDGE_PORT "$root/.env")"
  behind="$(nexlify_read_env_file PANEL_BEHIND_NGINX "$root/.env")"

  [ -n "$stream" ] && NEXLIFY_PORT_STREAM_HTTP="$stream"

  if nexlify_is_ip_host "$primary" || [ "$behind" = "0" ] || [ "$behind" = "false" ]; then
    NEXLIFY_PORT_STREAM_HTTP="${NEXLIFY_PORT_HTTP}"
    NEXLIFY_USE_STREAM_EDGE_NGINX=0
  else
    NEXLIFY_USE_STREAM_EDGE_NGINX=1
  fi

  local pub
  pub="$(nexlify_read_env_file PANEL_PUBLIC_PORT "$root/.env")"
  if [ "$pub" = "443" ]; then
    NEXLIFY_PORT_HTTPS=443
  fi

  local rtmp extra_http extra_https
  rtmp="$(nexlify_read_env_file RTMP_PORT "$root/.env")"
  [ -n "$rtmp" ] && NEXLIFY_PORT_RTMP="$rtmp"
  extra_http="$(nexlify_read_env_file STREAM_HTTP_EXTRA_PORTS "$root/.env")"
  extra_https="$(nexlify_read_env_file STREAM_HTTPS_EXTRA_PORTS "$root/.env")"
  export STREAM_HTTP_EXTRA_PORTS="${extra_http:-}"
  export STREAM_HTTPS_EXTRA_PORTS="${extra_https:-}"

  export NEXLIFY_PORT_SSH NEXLIFY_PORT_HTTP NEXLIFY_PORT_HTTPS
  export NEXLIFY_PORT_STREAM_HTTP NEXLIFY_PORT_RTMP NEXLIFY_PORT_RTSP
  export NEXLIFY_USE_STREAM_EDGE_NGINX
}

# Space-separated list of TCP ports to allow through UFW for IPTV + panel.
nexlify_customer_firewall_ports() {
  local ports="$NEXLIFY_PORT_SSH $NEXLIFY_PORT_HTTP $NEXLIFY_PORT_HTTPS"
  ports="$ports $NEXLIFY_PORT_RTMP $NEXLIFY_PORT_RTSP"
  if [ "${NEXLIFY_USE_STREAM_EDGE_NGINX:-1}" = "1" ] && [ "$NEXLIFY_PORT_STREAM_HTTP" != "$NEXLIFY_PORT_HTTP" ]; then
    ports="$ports $NEXLIFY_PORT_STREAM_HTTP"
  fi
  local extra="${STREAM_HTTP_EXTRA_PORTS:-}"
  extra="${extra//,/ }"
  ports="$ports $extra"
  extra="${STREAM_HTTPS_EXTRA_PORTS:-}"
  extra="${extra//,/ }"
  ports="$ports $extra"
  echo "$ports" | tr ' ' '\n' | awk '!seen[$0]++ && $0 != ""' | tr '\n' ' '
}
