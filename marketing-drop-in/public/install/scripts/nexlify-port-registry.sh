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

# Whether Node IPTV edge should own Xtream HTTP extras (8080/25461) instead of nginx.
# Default: yes when install-iptv-edge-proxy.sh is present (modern installs).
nexlify_use_iptv_edge() {
  local root="${1:-.}"
  local flag
  flag="$(nexlify_read_env_file NEXLIFY_USE_IPTV_EDGE "$root/.env")"
  if [ "$flag" = "0" ] || [ "$flag" = "false" ]; then
    return 1
  fi
  if [ "$flag" = "1" ] || [ "$flag" = "true" ]; then
    return 0
  fi
  [ -f "$root/scripts/install-iptv-edge-proxy.sh" ] || [ -f "$root/scripts/iptv-edge-proxy.mjs" ]
}

# Ports the Node IPTV edge binds (nginx must not also listen on these).
# Never includes :80 — nginx/panel HTTP stays on 80.
nexlify_iptv_edge_owned_ports() {
  local root="${1:-.}"
  local ports="" http https
  if ! nexlify_use_iptv_edge "$root"; then
    echo ""
    return 0
  fi
  http="$(nexlify_read_env_file STREAM_HTTP_EXTRA_PORTS "$root/.env")"
  [ -z "$http" ] && http="$(nexlify_read_env_file PANEL_HTTP_EXTRA_PORTS "$root/.env")"
  [ -z "$http" ] && http="8080,25461"
  http="${http//,/ }"
  for p in $http; do
    [ -z "$p" ] && continue
    [ "$p" = "80" ] && continue
    ports="$ports $p"
  done
  # Primary STREAM_HTTP_PORT when it is not :80 (domain installs historically used nginx :8080)
  local stream
  stream="$(nexlify_read_env_file STREAM_HTTP_PORT "$root/.env")"
  [ -z "$stream" ] && stream="$(nexlify_read_env_file STREAM_EDGE_PORT "$root/.env")"
  if [ -n "$stream" ] && [ "$stream" != "80" ] && [ "$stream" != "${NEXLIFY_PORT_HTTP:-80}" ]; then
    ports="$ports $stream"
  fi
  # :443 only when edge will bind it (not vendor/marketing/MovieFlix nginx TLS)
  if [ ! -d /var/www/nexlify ] \
    && [ ! -d /var/www/moviestream ] \
    && [ ! -f /etc/nginx/sites-enabled/nexlify.live ] \
    && [ ! -f /etc/nginx/sites-enabled/panel.nexlify.live ] \
    && [ ! -f /etc/nginx/sites-enabled/moviestream ] \
    && [ ! -f /etc/nginx/sites-available/moviestream ] \
    && [ ! -d /etc/letsencrypt/live/snookiebaby.xyz ]; then
    https="$(nexlify_read_env_file STREAM_HTTPS_PORT "$root/.env")"
    [ -z "$https" ] && https="$(nexlify_read_env_file PANEL_SSL_PORT "$root/.env")"
    [ -z "$https" ] && https="443"
    if [ -n "$https" ] && [ "$https" != "80" ]; then
      ports="$ports $https"
    fi
  fi
  echo "$ports" | tr ' ' '\n' | awk '!seen[$0]++ && $0 != ""' | tr '\n' ' '
}

# Return 0 if port is owned by IPTV edge (nginx must skip).
nexlify_port_owned_by_iptv_edge() {
  local port="$1" root="${2:-.}"
  local owned p
  owned="$(nexlify_iptv_edge_owned_ports "$root")"
  for p in $owned; do
    [ "$p" = "$port" ] && return 0
  done
  return 1
}

# Space-separated list of TCP ports to allow through UFW for IPTV + panel.
nexlify_customer_firewall_ports() {
  local ports="$NEXLIFY_PORT_SSH $NEXLIFY_PORT_HTTP $NEXLIFY_PORT_HTTPS"
  ports="$ports $NEXLIFY_PORT_RTMP $NEXLIFY_PORT_RTSP"
  if [ "${NEXLIFY_USE_STREAM_EDGE_NGINX:-1}" = "1" ] && [ "$NEXLIFY_PORT_STREAM_HTTP" != "$NEXLIFY_PORT_HTTP" ]; then
    ports="$ports $NEXLIFY_PORT_STREAM_HTTP"
  fi
  # Extra IPTV ports (e.g. 8080 on IP installs) must always be opened for players.
  local extra="${STREAM_HTTP_EXTRA_PORTS:-}"
  extra="${extra//,/ }"
  ports="$ports $extra"
  extra="${STREAM_HTTPS_EXTRA_PORTS:-}"
  extra="${extra//,/ }"
  ports="$ports $extra"
  echo "$ports" | tr ' ' '\n' | awk '!seen[$0]++ && $0 != ""' | tr '\n' ' '
}
