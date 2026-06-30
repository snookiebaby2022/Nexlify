#!/usr/bin/env bash
# One-shot fix: safe panel restart after updates + health watchdog (v1.5.7+).
#   curl -fsSL 'https://nexlify.live/install/fix-panel-restart.sh?v=170' | sudo bash
set -euo pipefail
PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
VENDOR_URL="${VENDOR_URL:-https://nexlify.live}"
TARBALL="${VENDOR_URL}/downloads/nexlify-panel.tar.gz?v=170"

[ -d "$PANEL_DIR" ] || { echo "ERROR: panel not found at $PANEL_DIR" >&2; exit 1; }

tmp="$(mktemp -d /tmp/nexlify-fix-restart-XXXXXX)"
curl -fsSL "$TARBALL" -o "$tmp/panel.tar.gz"
size="$(wc -c < "$tmp/panel.tar.gz" | tr -d ' ')"
[ "$size" -gt 3000000 ] || { echo "ERROR: tarball too small ($size bytes)" >&2; exit 1; }

mkdir -p "$tmp/extract"
tar -xzf "$tmp/panel.tar.gz" -C "$tmp/extract"
src="$tmp/extract"
[ -d "$tmp/extract/nexlify-panel" ] && src="$tmp/extract/nexlify-panel"

for f in \
  scripts/panel-restart-safe.sh \
  scripts/apply-panel-fast-update.sh \
  scripts/pm2-start.sh \
  scripts/verify-panel-upstream.sh \
  src/lib/panel-update-job.ts \
  src/lib/panel-update.ts \
  src/lib/cron-jobs.ts \
  src/lib/panel-health-watchdog.ts \
  package.json; do
  if [ -f "$src/$f" ]; then
    mkdir -p "$PANEL_DIR/$(dirname "$f")"
    cp -a "$src/$f" "$PANEL_DIR/$f"
  fi
done

chmod +x "$PANEL_DIR/scripts/"*.sh 2>/dev/null || true
cd "$PANEL_DIR"
sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true

echo "Rebuilding panel (restart watchdog + safe update restart) ..."
export NEXT_PRIVATE_WORKER_THREADS=false
npm run build

bash scripts/panel-restart-safe.sh
echo "Done. Panel restart is now safe after auto-updates; health watchdog runs every minute."
