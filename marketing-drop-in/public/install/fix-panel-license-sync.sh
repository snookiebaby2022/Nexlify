#!/usr/bin/env bash
# Update an existing Nexlify panel for remote license sync from nexlify.live admin.
#
# Run on the customer VPS (secret must reach bash — not only curl):
#   export PANEL_API_SECRET='your-secret'
#   curl -fsSL 'https://nexlify.live/install/fix-panel-license-sync.sh?v=166' | sudo -E bash
#
# Or one line:
#   curl -fsSL '...' | sudo PANEL_API_SECRET='your-secret' bash
set -e

PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
VENDOR_URL="${NEXLIFY_VENDOR_URL:-https://nexlify.live}"
TARBALL="${VENDOR_URL}/downloads/nexlify-panel.tar.gz?v=166"
PANEL_API_SECRET="${PANEL_API_SECRET:-}"

if [[ -z "$PANEL_API_SECRET" ]]; then
  echo "ERROR: Set PANEL_API_SECRET (same value as on nexlify.live) before running."
  echo "  export PANEL_API_SECRET='your-secret'"
  echo "  curl -fsSL 'https://nexlify.live/install/fix-panel-license-sync.sh?v=166' | sudo -E bash"
  exit 1
fi

echo "==> Nexlify panel license sync update"
[[ -d "$PANEL_DIR" ]] || { echo "Panel not found at $PANEL_DIR"; exit 1; }

echo "==> Downloading latest panel (${TARBALL})"
tmp="$(mktemp -d)"
curl -fsSL "$TARBALL" -o "$tmp/nexlify-panel.tar.gz"
size="$(wc -c < "$tmp/nexlify-panel.tar.gz" | tr -d ' ')"
if [[ "$size" -lt 2000000 ]]; then
  echo "ERROR: tarball too small ($size bytes) — download may be cached. Retry with ?v=166"
  exit 1
fi

echo "==> Extracting license sync files"
tar -xzf "$tmp/nexlify-panel.tar.gz" -C "$PANEL_DIR" \
  ./src/lib/license/remote-sync.ts \
  ./src/lib/license/state.ts \
  ./src/lib/license/index.ts \
  ./src/lib/internal-request.ts \
  ./src/app/api/internal/license-sync/route.ts \
  ./src/app/api/license/activate/route.ts \
  ./src/lib/cron-jobs.ts \
  2>/dev/null || true

if [[ ! -f "$PANEL_DIR/src/lib/license/remote-sync.ts" ]]; then
  echo "==> Full panel refresh"
  rm -rf "$PANEL_DIR/.next"
  tar -xzf "$tmp/nexlify-panel.tar.gz" -C "$PANEL_DIR"
fi
rm -rf "$tmp"

echo "==> Updating .env"
ENV_FILE="$PANEL_DIR/.env"
touch "$ENV_FILE"
upsert_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" "$ENV_FILE" 2>/dev/null; then
    sed -i "s|^${key}=.*|${key}=${val}|" "$ENV_FILE"
  else
    echo "${key}=${val}" >> "$ENV_FILE"
  fi
}
upsert_env NEXLIFY_LICENSE_API_URL "$VENDOR_URL"
upsert_env NEXLIFY_VENDOR_URL "$VENDOR_URL"
upsert_env NEXLIFY_PANEL_API_SECRET "$PANEL_API_SECRET"
upsert_env PANEL_INTERNAL_SECRET "$PANEL_API_SECRET"

echo "==> Rebuild panel"
cd "$PANEL_DIR"
npm run build

echo "==> Restart PM2"
if command -v pm2 >/dev/null 2>&1; then
  pm2 restart nexlify-panel 2>/dev/null || pm2 restart all --update-env
fi

echo ""
echo "Done. Panel will register with nexlify.live on next license activation or cron poll."
echo "Admin can now push licenses from https://nexlify.live/admin"
