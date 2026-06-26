#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"
SRC="${PANEL_PATCH_SRC:-$(dirname "$PATCHES")/../../nexlify-panel}"

echo "=== apply-panel-notifications ==="

copy() {
  local rel="$1"
  mkdir -p "$(dirname "$PANEL/$rel")"
  if [[ -f "$SRC/$rel" ]]; then
    cp "$SRC/$rel" "$PANEL/$rel"
  elif [[ -f "$PATCHES/$rel" ]]; then
    cp "$PATCHES/$rel" "$PANEL/$rel"
  else
    echo "ERROR: missing patch file: $rel" >&2
    return 1
  fi
}

if [[ ! -d "$SRC/src" ]]; then
  SRC="$PATCHES"
  echo "Using patch files from $PATCHES"
else
  echo "Using panel source from $SRC"
fi

for rel in \
  src/lib/panel-notifications.ts \
  src/components/panel-notification-bell.tsx \
  src/components/panel-notifications-admin.tsx \
  src/components/panel-notifications-inbox.tsx \
  src/components/panel-top-nav.tsx \
  src/lib/admin-sidebar-nav.tsx \
  src/lib/reseller-sidebar-nav.tsx \
  src/app/admin/notifications/page.tsx \
  src/app/reseller/notifications/page.tsx \
  src/app/api/admin/notifications/route.ts \
  "src/app/api/admin/notifications/[id]/route.ts" \
  src/app/api/panel/notifications/route.ts \
  src/app/api/panel/notifications/unread/route.ts \
  "src/app/api/panel/notifications/[id]/read/route.ts"; do
  copy "$rel"
  echo "  + $rel"
done

bash "$PATCHES/patch-schema-panel-notifications.sh"

MIGRATION="$PATCHES/prisma/migrations/20260604120000_panel_notifications/migration.sql"
if [[ ! -f "$MIGRATION" ]]; then
  MIGRATION="$SRC/prisma/migrations/20260604120000_panel_notifications/migration.sql"
fi
if [[ -f "$MIGRATION" ]]; then
  mkdir -p "$PANEL/prisma/migrations/20260604120000_panel_notifications"
  cp "$MIGRATION" "$PANEL/prisma/migrations/20260604120000_panel_notifications/migration.sql"
  echo "Applying panel notifications migration..."
  cd "$PANEL"
  if ! npx prisma db execute --file prisma/migrations/20260604120000_panel_notifications/migration.sql --schema prisma/schema.prisma 2>&1; then
    echo "WARN: migration skipped (may already be applied)"
  fi
else
  echo "WARN: migration SQL not found — run prisma db push manually" >&2
fi

cd "$PANEL"
npx prisma generate

if ! npm run build; then
  echo "ERROR: panel build failed" >&2
  exit 1
fi

APP_DIR="${APP_DIR:-/var/www/nexlify}"
export PANEL_DIR="$PANEL"
REBUILD=0 bash "$APP_DIR/deploy/pm2-ensure-panel.sh"

echo "Panel notifications applied."
