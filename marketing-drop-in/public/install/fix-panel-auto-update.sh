#!/usr/bin/env bash
# One-shot upgrade: enable automatic tarball updates on existing Nexlify panels.
#   curl -fsSL 'https://nexlify.live/install/fix-panel-auto-update.sh?v=160' | sudo bash
set -euo pipefail
PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
VENDOR_URL="${VENDOR_URL:-https://nexlify.live}"
TARBALL="${VENDOR_URL}/downloads/nexlify-panel.tar.gz?v=164"

[ -d "$PANEL_DIR" ] || { echo "ERROR: panel not found at $PANEL_DIR" >&2; exit 1; }

# Bootstrap latest patch script first (works even when local copy is outdated).
mkdir -p "$PANEL_DIR/scripts"
curl -fsSL "${VENDOR_URL}/install/apply-panel-fast-update.sh?v=164" -o "$PANEL_DIR/scripts/apply-panel-fast-update.sh.new" || true
if [ -f "$PANEL_DIR/scripts/apply-panel-fast-update.sh.new" ]; then
  sed -i 's/\r$//' "$PANEL_DIR/scripts/apply-panel-fast-update.sh.new"
  chmod +x "$PANEL_DIR/scripts/apply-panel-fast-update.sh.new"
  mv "$PANEL_DIR/scripts/apply-panel-fast-update.sh.new" "$PANEL_DIR/scripts/apply-panel-fast-update.sh"
fi

tmp="$(mktemp -d /tmp/nexlify-fix-XXXXXX)"
curl -fsSL "$TARBALL" -o "$tmp/panel.tar.gz"
size="$(wc -c < "$tmp/panel.tar.gz" | tr -d '[:space:]')"
[ -n "$size" ] && [ "$size" -gt 500000 ] || { echo "ERROR: download too small (${size:-0} bytes)" >&2; exit 1; }
tar -xOf "$tmp/panel.tar.gz" ./package.json >/dev/null 2>&1 || tar -xOf "$tmp/panel.tar.gz" package.json >/dev/null 2>&1 || { echo "ERROR: invalid panel tarball" >&2; exit 1; }

mkdir -p "$tmp/extract"
tar -xzf "$tmp/panel.tar.gz" -C "$tmp/extract"
src="$tmp/extract"
[ -d "$tmp/extract/nexlify-panel" ] && src="$tmp/extract/nexlify-panel"

if command -v rsync >/dev/null 2>&1; then
  rsync -a \
    --exclude='.env' --exclude='.env.*' --exclude='data/' \
    --exclude='node_modules/' --exclude='.next/' \
    "$src/" "$PANEL_DIR/"
else
  cp -a "$src/scripts/apply-panel-fast-update.sh" "$PANEL_DIR/scripts/" 2>/dev/null || true
  cp -a "$src/package.json" "$PANEL_DIR/" 2>/dev/null || true
fi

chmod +x "$PANEL_DIR/scripts/"*.sh 2>/dev/null || true
cd "$PANEL_DIR"
bash scripts/apply-panel-fast-update.sh all
echo "Panel updated to latest release. Auto-update is enabled (Admin → Updates)."
