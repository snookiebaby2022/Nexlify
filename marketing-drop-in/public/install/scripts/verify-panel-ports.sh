#!/usr/bin/env bash
# Verify nginx listens and local IPTV endpoints respond on expected ports.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=scripts/nexlify-port-registry.sh
source "$ROOT/scripts/nexlify-port-registry.sh"
nexlify_load_ports_from_env "$ROOT"

FAIL=0

check_listen() {
  local port="$1" label="$2"
  if ss -tln 2>/dev/null | grep -q ":${port} "; then
    echo "[verify-ports] OK listen :${port} (${label})"
  else
    echo "[verify-ports] FAIL not listening on :${port} (${label})" >&2
    FAIL=1
  fi
}

check_http() {
  local url="$1" label="$2"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 3 "$url" 2>/dev/null || echo "000")"
  if [ "$code" != "000" ] && [ "$code" != "522" ]; then
    echo "[verify-ports] OK ${label} HTTP ${code} — ${url}"
  else
    echo "[verify-ports] WARN ${label} unreachable (${code}) — ${url}" >&2
  fi
}

check_listen "$NEXLIFY_PORT_HTTP" "HTTP"
check_listen "$NEXLIFY_PORT_HTTPS" "HTTPS"

if [ "${NEXLIFY_USE_STREAM_EDGE_NGINX:-1}" = "1" ] && [ "$NEXLIFY_PORT_STREAM_HTTP" != "$NEXLIFY_PORT_HTTP" ]; then
  check_listen "$NEXLIFY_PORT_STREAM_HTTP" "stream edge"
  check_http "http://127.0.0.1:${NEXLIFY_PORT_STREAM_HTTP}/player_api.php?username=__verify__" "Xtream API :${NEXLIFY_PORT_STREAM_HTTP}"
fi

UPSTREAM="${PORT:-${PANEL_PORT:-13000}}"
check_http "http://127.0.0.1:${UPSTREAM}/api/health" "panel upstream :${UPSTREAM}"

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qi active; then
  for p in $(nexlify_customer_firewall_ports); do
    if ufw status 2>/dev/null | grep -qE "${p}/tcp.*ALLOW"; then
      echo "[verify-ports] OK UFW allows ${p}/tcp"
    else
      echo "[verify-ports] WARN UFW may block ${p}/tcp — run: sudo bash scripts/nexlify-firewall-ports.sh" >&2
      FAIL=1
    fi
  done
fi

exit "$FAIL"
