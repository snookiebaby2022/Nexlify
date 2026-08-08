#!/usr/bin/env bash
# Open all customer-facing Nexlify / IPTV ports in UFW (idempotent).
# Run after install, deploy, or when stream port settings change:
#   sudo bash scripts/nexlify-firewall-ports.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=scripts/nexlify-port-registry.sh
source "$ROOT/scripts/nexlify-port-registry.sh"
nexlify_load_ports_from_env "$ROOT"

if ! command -v ufw >/dev/null 2>&1; then
  echo "[nexlify-firewall] ufw not installed — skip (open ports manually in cloud firewall)"
  nexlify_customer_firewall_ports | tr ' ' '\n' | while read -r p; do
    [ -n "$p" ] && echo "  allow ${p}/tcp"
  done
  exit 0
fi

UFW_STATUS="$(ufw status 2>/dev/null | head -1 || true)"
if ! echo "$UFW_STATUS" | grep -qi active; then
  echo "[nexlify-firewall] Enabling UFW…"
  ufw allow "${NEXLIFY_PORT_SSH}/tcp" comment 'Nexlify SSH' >/dev/null 2>&1 || ufw allow "${NEXLIFY_PORT_SSH}/tcp" || true
  ufw --force enable >/dev/null 2>&1 || true
fi

open_port() {
  local port="$1" label="$2"
  ufw allow "${port}/tcp" comment "$label" >/dev/null 2>&1 || ufw allow "${port}/tcp" || true
  echo "[nexlify-firewall] allow ${port}/tcp (${label})"
}

open_port "$NEXLIFY_PORT_SSH" "Nexlify SSH"
open_port "$NEXLIFY_PORT_HTTP" "Nexlify HTTP panel + IPTV"
open_port "$NEXLIFY_PORT_HTTPS" "Nexlify HTTPS panel + IPTV"

if [ "${NEXLIFY_USE_STREAM_EDGE_NGINX:-1}" = "1" ] && [ "$NEXLIFY_PORT_STREAM_HTTP" != "$NEXLIFY_PORT_HTTP" ]; then
  open_port "$NEXLIFY_PORT_STREAM_HTTP" "Nexlify stream edge Xtream/M3U"
fi

open_port "$NEXLIFY_PORT_RTMP" "Nexlify RTMP ingest"
open_port "$NEXLIFY_PORT_RTSP" "Nexlify RTSP"

for extra in ${STREAM_HTTP_EXTRA_PORTS//,/ }; do
  [ -n "$extra" ] && open_port "$extra" "Nexlify extra stream HTTP"
done
for extra in ${STREAM_HTTPS_EXTRA_PORTS//,/ }; do
  [ -n "$extra" ] && open_port "$extra" "Nexlify extra stream HTTPS"
done

for internal in $NEXLIFY_PORTS_INTERNAL; do
  ufw deny "${internal}/tcp" >/dev/null 2>&1 || true
done

echo "[nexlify-firewall] Done — customer ports: $(nexlify_customer_firewall_ports)"
