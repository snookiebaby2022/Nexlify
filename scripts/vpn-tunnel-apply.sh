#!/usr/bin/env bash
# Apply a WireGuard (or OpenVPN) client config and start the local HTTP CONNECT gateway.
# Intended to run on an LB as root.
#
# Env:
#   NEXLIFY_VPN_KIND=WIREGUARD|OPENVPN
#   NEXLIFY_VPN_IFACE=wg-nexlify0
#   NEXLIFY_VPN_LOCAL_PORT=18080
#   NEXLIFY_VPN_CONFIG_B64=<base64 config>
#   NEXLIFY_VPN_PROXY_JS=/path/to/vpn-local-http-proxy.mjs
#   NEXLIFY_VPN_DRY_RUN=1  — validate only
set -euo pipefail

KIND="${NEXLIFY_VPN_KIND:-WIREGUARD}"
IFACE="${NEXLIFY_VPN_IFACE:-wg-nexlify0}"
PORT="${NEXLIFY_VPN_LOCAL_PORT:-18080}"
DRY="${NEXLIFY_VPN_DRY_RUN:-0}"
PROXY_JS="${NEXLIFY_VPN_PROXY_JS:-}"
CONF_B64="${NEXLIFY_VPN_CONFIG_B64:-}"

if [[ -z "$CONF_B64" ]]; then
  echo '{"ok":false,"error":"NEXLIFY_VPN_CONFIG_B64 required"}' >&2
  exit 2
fi

WORKDIR="/var/lib/nexlify/vpn"
mkdir -p "$WORKDIR"
CONF_PATH="$WORKDIR/${IFACE}.conf"
echo "$CONF_B64" | base64 -d >"$CONF_PATH"
chmod 600 "$CONF_PATH"

if [[ "$DRY" == "1" ]]; then
  echo "{\"ok\":true,\"dryRun\":true,\"kind\":\"$KIND\",\"iface\":\"$IFACE\",\"port\":$PORT,\"conf\":\"$CONF_PATH\"}"
  exit 0
fi

LOCAL_IP=""
if [[ "$KIND" == "OPENVPN" ]]; then
  if ! command -v openvpn >/dev/null 2>&1; then
    apt-get update -qq && apt-get install -y -qq openvpn >/dev/null
  fi
  pkill -f "openvpn --config $CONF_PATH" 2>/dev/null || true
  openvpn --config "$CONF_PATH" --daemon "nexlify-${IFACE}" --writepid "$WORKDIR/${IFACE}.ovpn.pid"
  sleep 2
  LOCAL_IP="$(ip -4 -o addr show scope global | awk '{print $4}' | cut -d/ -f1 | head -1 || true)"
else
  if ! command -v wg-quick >/dev/null 2>&1; then
    apt-get update -qq && apt-get install -y -qq wireguard wireguard-tools >/dev/null
  fi
  # Ensure Interface Name matches file for wg-quick
  if ! grep -qi '^\[Interface\]' "$CONF_PATH"; then
    echo '{"ok":false,"error":"WireGuard config missing [Interface]"}' >&2
    exit 3
  fi
  install -m 600 "$CONF_PATH" "/etc/wireguard/${IFACE}.conf"
  wg-quick down "$IFACE" 2>/dev/null || true
  wg-quick up "$IFACE"
  LOCAL_IP="$(ip -4 -o addr show dev "$IFACE" 2>/dev/null | awk '{print $4}' | cut -d/ -f1 | head -1 || true)"
fi

if [[ -z "$PROXY_JS" || ! -f "$PROXY_JS" ]]; then
  # Prefer sibling of this script when copied to LB
  HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
  if [[ -f "$HERE/vpn-local-http-proxy.mjs" ]]; then
    PROXY_JS="$HERE/vpn-local-http-proxy.mjs"
  elif [[ -f /opt/nexlify-panel/scripts/vpn-local-http-proxy.mjs ]]; then
    PROXY_JS=/opt/nexlify-panel/scripts/vpn-local-http-proxy.mjs
  else
    echo '{"ok":false,"error":"vpn-local-http-proxy.mjs not found"}' >&2
    exit 4
  fi
fi

pkill -f "vpn-local-http-proxy.mjs --port ${PORT}" 2>/dev/null || true
nohup node "$PROXY_JS" --port "$PORT" ${LOCAL_IP:+--local-ip "$LOCAL_IP"} \
  >"$WORKDIR/${IFACE}-proxy.log" 2>&1 &
echo $! >"$WORKDIR/${IFACE}-proxy.pid"
sleep 0.5

echo "{\"ok\":true,\"kind\":\"$KIND\",\"iface\":\"$IFACE\",\"port\":$PORT,\"localIp\":\"${LOCAL_IP}\",\"proxyPid\":$(cat "$WORKDIR/${IFACE}-proxy.pid")}"
