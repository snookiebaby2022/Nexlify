#!/usr/bin/env bash
# Repair panel UI (missing standalone JS/CSS) or run a full safe update.
#   curl -fsSL 'https://nexlify.live/install/fix-panel-repair.sh' | sudo bash
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
VENDOR_URL="${VENDOR_URL:-https://nexlify.live}"
INSTALL_BASE="${VENDOR_URL}/install"

[ -d "$PANEL_DIR" ] || { echo "ERROR: panel not found at $PANEL_DIR" >&2; exit 1; }
cd "$PANEL_DIR"

PANEL_VER="$(node -e "try{process.stdout.write(require('./package.json').version||'')}catch{}" 2>/dev/null || true)"
CACHE_BUST="${PANEL_CACHE_BUST:-v${PANEL_VER//./}}"

fetch_script() {
  local rel="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  if curl -fsSL "${INSTALL_BASE}/${rel}?${CACHE_BUST}" -o "${dest}.new" 2>/dev/null; then
    sed -i 's/\r$//' "${dest}.new" 2>/dev/null || true
    chmod +x "${dest}.new"
    mv "${dest}.new" "$dest"
    echo "Fetched $(basename "$dest")"
    return 0
  fi
  return 1
}

echo "==> Nexlify panel repair (v${PANEL_VER:-?}) in $PANEL_DIR"
mkdir -p scripts
fetch_script "apply-panel-fast-update.sh" "scripts/apply-panel-fast-update.sh" || true
fetch_script "scripts/panel-restart-safe.sh" "scripts/panel-restart-safe.sh" || true
fetch_script "scripts/panel-update-recover.sh" "scripts/panel-update-recover.sh" || true
fetch_script "scripts/prepare-standalone.sh" "scripts/prepare-standalone.sh" || true
fetch_script "scripts/verify-standalone.sh" "scripts/verify-standalone.sh" || true
fetch_script "scripts/verify-panel-release.sh" "scripts/verify-panel-release.sh" || true
fetch_script "scripts/has-valid-next-build.sh" "scripts/has-valid-next-build.sh" || true
fetch_script "scripts/fix-next-distdir-references.sh" "scripts/fix-next-distdir-references.sh" || true
fetch_script "scripts/cleanup-panel-artifacts.sh" "scripts/cleanup-panel-artifacts.sh" || true
fetch_script "scripts/fix-next-distdir-references.sh" "scripts/fix-next-distdir-references.sh" || true
fetch_script "scripts/cleanup-panel-artifacts.sh" "scripts/cleanup-panel-artifacts.sh" || true
sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true

if [ -x scripts/cleanup-panel-artifacts.sh ]; then
  bash scripts/cleanup-panel-artifacts.sh
fi

normalize_scripts() {
  sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true
  chmod +x scripts/*.sh 2>/dev/null || true
}

# Compiled standalone must be newer than server-side source — repair only copies static files otherwise.
needs_source_rebuild() {
  [ -f .next/standalone/server.js ] || return 0
  local marker=".next/standalone/server.js"
  if find src/app/api/admin/stats src/app/api/admin/dashboard-widgets src/lib/dashboard-server-metrics.ts src/lib/dashboard-widgets.ts src/lib/connections.ts \
    -type f -newer "$marker" 2>/dev/null | head -1 | grep -q .; then
    return 0
  fi
  if [ -f package.json ] && [ package.json -nt "$marker" ]; then
    return 0
  fi
  return 1
}

if bash scripts/has-valid-next-build.sh 2>/dev/null \
  && [ -f .next/standalone/server.js ]; then
  if needs_source_rebuild; then
    echo "==> Source is newer than compiled build — running npm run build"
    normalize_scripts
    export NEXT_PRIVATE_WORKER_THREADS="${NEXT_PRIVATE_WORKER_THREADS:-false}"
    npm run build
    bash scripts/prepare-standalone.sh
    bash scripts/verify-standalone.sh
    if [ -x scripts/fix-next-distdir-references.sh ]; then
      bash scripts/fix-next-distdir-references.sh ".next"
    fi
    bash scripts/panel-restart-safe.sh --nexlify-only
    if [ -x scripts/verify-panel-release.sh ]; then
      bash scripts/verify-panel-release.sh || echo "WARN: post-repair verify reported issues" >&2
    fi
    echo "REPAIR_OK (rebuilt standalone)"
    exit 0
  fi
  echo "==> Quick repair: refresh standalone assets + restart"
  bash scripts/prepare-standalone.sh
  bash scripts/verify-standalone.sh
  bash scripts/panel-restart-safe.sh --nexlify-only
  if [ -x scripts/verify-panel-release.sh ]; then
    bash scripts/verify-panel-release.sh || echo "WARN: post-repair verify reported issues" >&2
  fi
  echo "REPAIR_OK (standalone refresh)"
  exit 0
fi

echo "==> Full safe update from vendor tarball"
PANEL_CACHE_BUST="$CACHE_BUST" bash scripts/apply-panel-fast-update.sh all
if [ -x scripts/verify-panel-release.sh ]; then
  bash scripts/verify-panel-release.sh || echo "WARN: post-update verify reported issues" >&2
fi
echo "REPAIR_OK (full update)"
