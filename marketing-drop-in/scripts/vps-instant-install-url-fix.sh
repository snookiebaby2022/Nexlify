#!/usr/bin/env bash
# INSTANT fix: marketing /install page shows ?v1.9.7 instead of ?v=1.9.7
# No rebuild — patches cached .next bundles and restarts PM2 (~10 seconds).
#
# Run on vendor VPS as root:
#   bash /root/vps-instant-install-url-fix.sh
#
# Or paste this entire file if the script is not on the server yet.
set -euo pipefail

MARKETING="${MARKETING_DIR:-/var/www/nexlify}"
PORT="${MARKETING_PORT:-13001}"
VER="$(node -p "require('$MARKETING/package.json').version" 2>/dev/null || echo 1.9.7)"

echo "=== Instant install URL fix (v=${VER}) ==="
echo "Target: $MARKETING"
echo ""

if [ ! -d "$MARKETING/.next" ]; then
  echo "ERROR: $MARKETING/.next missing — run: bash /root/vps-hotfix-marketing-now.sh"
  exit 1
fi

# --- 1) Fix source for the next full rebuild ---
PI="$MARKETING/src/lib/panel-install.ts"
if [ -f "$PI" ]; then
  if ! grep -q 'INSTALLER_CACHE_QUERY' "$PI" 2>/dev/null; then
    echo "-> Patching panel-install.ts source"
    sed -i \
      -e "s|panel.sh?\${INSTALLER_VERSION}|panel.sh?\${INSTALLER_CACHE_QUERY}|g" \
      -e "s|panel.sh?v${VER}|panel.sh?v=${VER}|g" \
      "$PI"
    if ! grep -q 'INSTALLER_CACHE_QUERY' "$PI" 2>/dev/null; then
      sed -i "/export const INSTALLER_VERSION/a export const INSTALLER_CACHE_QUERY = \`v=\${PANEL_VERSION}\`;" "$PI"
    fi
  else
    echo "-> panel-install.ts already has INSTALLER_CACHE_QUERY"
  fi
fi

# --- 2) Patch live cached JS (what users see RIGHT NOW) ---
echo "-> Patching .next bundles (v${VER} -> v=${VER})"
patched=0
while IFS= read -r f; do
  if grep -qE "panel\.sh\?v${VER}|panel\.sh\?v1\.9\.7" "$f" 2>/dev/null; then
    sed -i \
      -e "s|panel.sh?v${VER}|panel.sh?v=${VER}|g" \
      -e "s|panel.sh?v1.9.7|panel.sh?v=1.9.7|g" \
      "$f"
    patched=$((patched + 1))
  fi
done < <(find "$MARKETING/.next" -type f -name '*.js' 2>/dev/null)
echo "   Patched $patched file(s)"

# --- 3) Restart ---
echo "-> Restarting nexlify-web..."
pm2 restart nexlify-web --update-env 2>&1 | tail -2
pm2 save 2>/dev/null || true
sleep 3

# --- 4) Verify ---
echo ""
echo "=== Verification ==="
HTML="$(curl -fsS "http://127.0.0.1:${PORT}/install" 2>/dev/null || true)"
if echo "$HTML" | grep -qE "panel\.sh\?v=${VER}|panel\.sh\?v=1\.9\.7"; then
  echo "OK: /install shows ?v=${VER}"
  echo "$HTML" | grep -oE "panel\.sh[^\"'<> ]*" | head -3
elif echo "$HTML" | grep -qE "panel\.sh\?v${VER}|panel\.sh\?v1\.9\.7"; then
  echo "FAIL: still wrong — run full hotfix: bash /root/vps-hotfix-marketing-now.sh"
  echo "$HTML" | grep -oE "panel\.sh[^\"'<> ]*" | head -3
  exit 1
else
  echo "WARN: could not grep URL — hard-refresh https://nexlify.live/install"
fi

echo ""
echo "=== DONE ==="
echo "Install command: curl -fsSL 'https://nexlify.live/install/panel.sh?v=${VER}' | sudo bash"
echo "Hard-refresh: https://nexlify.live/install (Ctrl+Shift+R)"
