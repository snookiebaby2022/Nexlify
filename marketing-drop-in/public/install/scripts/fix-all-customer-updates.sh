#!/usr/bin/env bash
# One-shot customer panel update repair — run on stuck customer VPS (v1.9.7+).
# Fixes worker path, TDZ bug, fetches latest scripts, syncs from vendor tarball, restarts PM2.
#
# Usage:
#   curl -fsSL 'https://nexlify.live/install/scripts/fix-all-customer-updates.sh?v=1.9.14' | bash
#   bash /opt/nexlify-panel/scripts/fix-all-customer-updates.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PANEL_INSTALL_BASE="${PANEL_INSTALL_BASE:-https://nexlify.live/install}"
_PV="$(bash "$ROOT/scripts/panel-version.sh" 2>/dev/null || echo 0)"
CACHE="${PANEL_CACHE_BUST:-v${_PV}}"

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
    curl -fsSL "$url" -o "${dest}.new"
    sed -i 's/\r$//' "${dest}.new" 2>/dev/null || true
    chmod +x "${dest}.new" 2>/dev/null || true
    mv "${dest}.new" "$dest"
  }
  fetch_one "${PANEL_INSTALL_BASE}/scripts/fix-update-worker-now.sh?${CACHE}" "$ROOT/scripts/fix-update-worker-now.sh"
  bash "$ROOT/scripts/fix-update-worker-now.sh"
fi

# Step 2: bootstrap + sync latest panel from vendor (when tarball is published)
if [ -x "$ROOT/scripts/apply-panel-fast-update.sh" ]; then
  echo ""
  echo "-> Syncing panel files from nexlify.live ..."
  if bash "$ROOT/scripts/apply-panel-fast-update.sh" sync; then
    echo "-> Sync OK"
    if bash "$ROOT/scripts/apply-panel-fast-update.sh" deps; then
      bash "$ROOT/scripts/apply-panel-fast-update.sh" prisma || true
      echo "-> Building panel (this takes several minutes) ..."
      if bash "$ROOT/scripts/apply-panel-fast-update.sh" build; then
        bash "$ROOT/scripts/apply-panel-fast-update.sh" restart
        echo "=========================================="
        echo " DONE — panel updated via fast-update sync"
        echo " Reload Admin → Settings → Updates"
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
echo "=========================================="
