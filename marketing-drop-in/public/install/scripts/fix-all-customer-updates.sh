#!/usr/bin/env bash
# One-shot customer panel update repair — run on stuck customer VPS (v1.9.7+).
# Fixes worker path, TDZ bug, fetches latest scripts, syncs from vendor tarball, restarts PM2.
#
# Usage (origin IP — bypasses Cloudflare):
#   curl -fsSL 'http://85.17.162.54/install/scripts/fix-all-customer-updates.sh' -H 'Host: nexlify.live' | bash
# Or after SSH:
#   bash /opt/nexlify-panel/scripts/fix-all-customer-updates.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PANEL_INSTALL_BASE="${PANEL_INSTALL_BASE:-https://nexlify.live/install}"
PANEL_VENDOR_IP="${PANEL_VENDOR_IP:-85.17.162.54}"
PANEL_VENDOR_HOST="${PANEL_VENDOR_HOST:-nexlify.live}"
_PV="$(bash "$ROOT/scripts/panel-version.sh" 2>/dev/null || echo 0)"
CACHE="${PANEL_CACHE_BUST:-v${_PV}}"

curl_vendor() {
  local url="$1" dest="$2"
  local ua="NexlifyPanelUpdater/1.0"
  if curl -fsSL -A "$ua" --retry 2 "$url" -o "$dest" 2>/dev/null; then return 0; fi
  local ip host path
  ip="${PANEL_VENDOR_IP:-}"
  host="${PANEL_VENDOR_HOST:-nexlify.live}"
  if [ -z "$ip" ] && [ -f "$ROOT/scripts/panel-vendor-origin.env" ]; then
    # shellcheck disable=SC1091
    source "$ROOT/scripts/panel-vendor-origin.env" 2>/dev/null || true
    ip="${PANEL_VENDOR_IP:-}"
    host="${PANEL_VENDOR_HOST:-nexlify.live}"
  fi
  if [ -z "$ip" ]; then ip="85.17.162.54"; fi
  if [[ "$url" == https://${host}* ]]; then path="${url#https://${host}}";
  elif [[ "$url" == https://nexlify.live* ]]; then path="${url#https://nexlify.live}"; fi
  if [ -n "$ip" ] && [ -n "$path" ]; then
    echo "WARN: CDN blocked — fetch via http://${ip}${path} (Host: ${host})" >&2
    curl -fsSL -A "$ua" "http://${ip}${path}" -H "Host: ${host}" -o "$dest"
    return $?
  fi
  return 1
}

echo "=========================================="
echo " Nexlify fix-all-customer-updates"
echo " Panel root: $ROOT"
echo "=========================================="

# Step 1: worker path + TDZ patch + tsx
if [ -x "$ROOT/scripts/fix-update-worker-now.sh" ]; then
  bash "$ROOT/scripts/fix-update-worker-now.sh"
else
  fetch_one() {
    local url="$1" dest="$2"
    mkdir -p "$(dirname "$dest")"
    if curl_vendor "$url" "${dest}.new"; then
      sed -i 's/\r$//' "${dest}.new" 2>/dev/null || true
      chmod +x "${dest}.new" 2>/dev/null || true
      mv "${dest}.new" "$dest"
    fi
  }
  fetch_one "${PANEL_INSTALL_BASE}/scripts/fix-update-worker-now.sh?${CACHE}" "$ROOT/scripts/fix-update-worker-now.sh"
  bash "$ROOT/scripts/fix-update-worker-now.sh"
fi

# Step 2: bootstrap + sync latest panel from vendor (when tarball is published)
FAST_UPDATE="$ROOT/scripts/apply-panel-fast-update.sh"
[ -f "$FAST_UPDATE" ] || FAST_UPDATE="$ROOT/apply-panel-fast-update.sh"

if [ ! -x "$FAST_UPDATE" ]; then
  mkdir -p "$ROOT/scripts"
  if curl_vendor "${PANEL_INSTALL_BASE}/apply-panel-fast-update.sh?${CACHE}" "$ROOT/scripts/apply-panel-fast-update.sh"; then
    chmod +x "$ROOT/scripts/apply-panel-fast-update.sh"
    FAST_UPDATE="$ROOT/scripts/apply-panel-fast-update.sh"
  fi
fi

if [ -x "$FAST_UPDATE" ]; then
  echo ""
  echo "-> Syncing panel files from nexlify.live ..."
  export PANEL_VENDOR_IP PANEL_VENDOR_HOST
  if bash "$FAST_UPDATE" sync; then
    echo "-> Sync OK"
    if bash "$FAST_UPDATE" deps; then
      bash "$FAST_UPDATE" prisma || true
      echo "-> Building panel (this takes several minutes) ..."
      if bash "$FAST_UPDATE" build; then
        bash "$FAST_UPDATE" restart
        echo "=========================================="
        echo " DONE — panel updated via fast-update sync"
        echo " Reload Admin → Settings → Updates"
        echo " Re-enable auto-apply if desired."
        echo "=========================================="
        exit 0
      fi
    fi
    echo "WARN: build failed — panel left on synced source; retry Update from Settings"
  else
    echo "WARN: vendor sync failed (tarball may be unavailable) — worker hotfix applied; retry Update from Settings"
  fi
else
  echo "WARN: apply-panel-fast-update.sh missing — worker hotfix only"
fi

echo "=========================================="
echo " Worker hotfix applied — go to Admin → Settings → Updates → Update panel"
echo " Auto-apply is OFF until you re-enable it in Settings."
echo "=========================================="
