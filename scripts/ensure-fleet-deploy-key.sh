#!/usr/bin/env bash
# Ensure shared GitHub fleet deploy key is installed (for private repo git fetch / panel updates).
# Called automatically during panel update, rebuild, and background worker start.
#
# Key source (first match):
#   1) Already at /root/.nexlify/github-deploy-key and GitHub SSH works
#   2) Download from vendor: https://nexlify.live/install/secrets/github-deploy-key
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=scripts/vps-git-auth.sh
. "$SCRIPT_DIR/vps-git-auth.sh"

KEY_PATH="$NEXLIFY_FLEET_DEPLOY_KEY"
PANEL_INSTALL_BASE="${PANEL_INSTALL_BASE:-https://nexlify.live/install}"
KEY_URL="${NEXLIFY_FLEET_DEPLOY_KEY_URL:-${PANEL_INSTALL_BASE}/secrets/github-deploy-key}"

if nexlify_git_ssh_works 2>/dev/null; then
  configure_nexlify_git_origin "$ROOT" 2>/dev/null || true
  exit 0
fi

if [ -s "$KEY_PATH" ] && nexlify_git_ssh_works 2>/dev/null; then
  configure_nexlify_git_origin "$ROOT" 2>/dev/null || true
  exit 0
fi

fetch_fleet_key() {
  local dest="$1"
  local ua="NexlifyPanelUpdater/1.0 (+https://nexlify.live)"
  local token="${NEXLIFY_FLEET_FETCH_TOKEN:-}"
  local url="$KEY_URL"
  if [ -n "$token" ]; then
    url="${url}?t=${token}"
  fi

  if curl -fsSL -A "$ua" --retry 2 --max-time 45 "$url" -o "$dest" 2>/dev/null; then
    return 0
  fi

  local ip host
  ip="${PANEL_VENDOR_IP:-}"
  host="${PANEL_VENDOR_HOST:-nexlify.live}"
  if [ -z "$ip" ] && [ -f "$ROOT/.env" ]; then
    ip="$(grep -E '^PANEL_VENDOR_IP=' "$ROOT/.env" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r\"'"'"' ')"
  fi
  if [ -z "$ip" ] && curl -fsSL -A "$ua" "${PANEL_INSTALL_BASE}/panel-vendor-origin.env" -o /tmp/nexlify-vendor-origin.env 2>/dev/null; then
    # shellcheck disable=SC1091
    source /tmp/nexlify-vendor-origin.env 2>/dev/null || true
    ip="${PANEL_VENDOR_IP:-}"
  fi
  ip="${ip:-85.17.162.54}"
  local path="${url#https://${host}}"
  path="${path#https://nexlify.live}"
  path="${path#http://nexlify.live}"

  if curl -fsS -A "$ua" --max-time 60 --resolve "${host}:443:${ip}" \
    "https://${host}${path}" -o "$dest" 2>/dev/null; then
    return 0
  fi
  curl -fsS -A "$ua" --max-time 60 "http://${ip}${path}" -H "Host: ${host}" -o "$dest" 2>/dev/null
}

mkdir -p "$(dirname "$KEY_PATH")"
chmod 700 "$(dirname "$KEY_PATH")"

tmp="$(mktemp)"
if ! fetch_fleet_key "$tmp"; then
  rm -f "$tmp"
  exit 0
fi

if [ ! -s "$tmp" ] || ! grep -q 'PRIVATE KEY' "$tmp" 2>/dev/null; then
  rm -f "$tmp"
  exit 0
fi

install -m 600 "$tmp" "$KEY_PATH"
rm -f "$tmp"

ensure_nexlify_git_ssh
if nexlify_git_ssh_works; then
  echo "[fleet-deploy-key] Installed from vendor and GitHub SSH OK"
  configure_nexlify_git_origin "$ROOT" 2>/dev/null || true
else
  echo "[fleet-deploy-key] Installed from vendor but GitHub SSH failed — add pubkey to GitHub Deploy keys" >&2
fi
