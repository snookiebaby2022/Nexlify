#!/usr/bin/env bash
# Verify nginx listens and local IPTV endpoints respond on expected ports.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=scripts/nexlify-port-registry.sh
source "$ROOT/scripts/nexlify-port-registry.sh"
nexlify_load_ports_from_env "$ROOT"

FAIL=0

nexlify_read_env_file() {
  grep "^${1}=" "$ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^["'\'' ]*//' -e 's/["'\'' ]*$//' || true
}

check_listen() {
  local port="$1" label="$2" required="${3:-1}"
  if ss -tln 2>/dev/null | grep -qE ":${port}\\s"; then
    echo "[verify-ports] OK listen :${port} (${label})"
  else
    if [ "$required" = "1" ]; then
      echo "[verify-ports] FAIL not listening on :${port} (${label})" >&2
      FAIL=1
    else
      echo "[verify-ports] SKIP :${port} (${label}) — not configured"
    fi
  fi
}

check_http() {
  local url="$1" label="$2"
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --connect-timeout 3 "$url" 2>/dev/null || echo "000")"
  # 400/401/403 are fine — endpoint is reachable (credentials may be wrong)
  if [ "$code" != "000" ] && [ "$code" != "522" ] && [ "$code" != "502" ] && [ "$code" != "503" ]; then
    echo "[verify-ports] OK ${label} HTTP ${code} — ${url}"
  else
    echo "[verify-ports] WARN ${label} unreachable (${code}) — ${url}" >&2
  fi
}

PANEL_LISTEN="$(nexlify_read_env_file PORT)"
[ -z "$PANEL_LISTEN" ] && PANEL_LISTEN="${PORT:-${PANEL_PORT:-13000}}"
HTTP_EXTRAS="$(nexlify_read_env_file STREAM_HTTP_EXTRA_PORTS)"
HTTPS_EXTRAS="$(nexlify_read_env_file STREAM_HTTPS_EXTRA_PORTS)"
BEHIND_NGINX="$(nexlify_read_env_file PANEL_BEHIND_NGINX)"

# Panel listen (IP installs often bind Next directly on :80)
check_listen "$PANEL_LISTEN" "panel listen"

# Public HTTP — required when panel owns it OR nginx fronts it
if [ "$PANEL_LISTEN" = "80" ] || [ "$BEHIND_NGINX" = "1" ] || [ "$BEHIND_NGINX" = "true" ]; then
  check_listen "$NEXLIFY_PORT_HTTP" "HTTP"
else
  check_listen "$NEXLIFY_PORT_HTTP" "HTTP" 0
fi

# HTTPS optional on plain IP installs
if [ -n "$(nexlify_read_env_file PANEL_PRIMARY_DOMAIN)" ] || [ "$BEHIND_NGINX" = "1" ]; then
  check_listen "$NEXLIFY_PORT_HTTPS" "HTTPS" 0
else
  check_listen "$NEXLIFY_PORT_HTTPS" "HTTPS" 0
fi

# Stream / extra HTTP ports may be owned by Node IPTV edge (not nginx) — still must listen.
EDGE_OWNED="$(nexlify_iptv_edge_owned_ports "$ROOT")"
edge_label() {
  local p="$1"
  case " $EDGE_OWNED " in
    *" $p "*) echo "IPTV edge" ;;
    *) echo "nginx/stream" ;;
  esac
}

if [ "${NEXLIFY_USE_STREAM_EDGE_NGINX:-1}" = "1" ] && [ "$NEXLIFY_PORT_STREAM_HTTP" != "$NEXLIFY_PORT_HTTP" ]; then
  check_listen "$NEXLIFY_PORT_STREAM_HTTP" "$(edge_label "$NEXLIFY_PORT_STREAM_HTTP")"
  check_http "http://127.0.0.1:${NEXLIFY_PORT_STREAM_HTTP}/player_api.php?username=__verify__&password=__verify__" "Xtream API :${NEXLIFY_PORT_STREAM_HTTP}"
elif [ -z "${HTTP_EXTRAS:-}" ] && nexlify_use_iptv_edge "$ROOT"; then
  # IP installs: STREAM_HTTP is :80 but extras 8080/25461 still must be up via edge
  :
fi

# Every configured extra HTTP port must listen and answer player_api
# Default extras when unset + IPTV edge enabled
if [ -z "$HTTP_EXTRAS" ] && nexlify_use_iptv_edge "$ROOT"; then
  HTTP_EXTRAS="8080,25461"
fi
for p in ${HTTP_EXTRAS//,/ }; do
  [ -z "$p" ] && continue
  [ "$p" = "$PANEL_LISTEN" ] && continue
  check_listen "$p" "extra HTTP ($(edge_label "$p"))"
  check_http "http://127.0.0.1:${p}/player_api.php?username=__verify__&password=__verify__" "Xtream API :${p}"
  check_http "http://127.0.0.1:${p}/panel_api.php?username=__verify__&password=__verify__" "panel_api :${p}"
done

for p in ${HTTPS_EXTRAS//,/ }; do
  [ -z "$p" ] && continue
  check_listen "$p" "extra HTTPS" 0
done

check_http "http://127.0.0.1:${PANEL_LISTEN}/api/health" "panel upstream :${PANEL_LISTEN}"
check_http "http://127.0.0.1:${PANEL_LISTEN}/player_api.php?username=__verify__&password=__verify__" "Xtream API :${PANEL_LISTEN}"

if command -v ufw >/dev/null 2>&1 && ufw status 2>/dev/null | grep -qi active; then
  for p in $(nexlify_customer_firewall_ports); do
    if ufw status 2>/dev/null | grep -qE "${p}/tcp.*ALLOW"; then
      echo "[verify-ports] OK UFW allows ${p}/tcp"
    else
      echo "[verify-ports] WARN UFW may block ${p}/tcp — run: sudo bash scripts/nexlify-firewall-ports.sh" >&2
      # Do not fail the whole sync for UFW warn — ports may still be reachable
    fi
  done
fi

exit "$FAIL"
