#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"
SRC="${PANEL_PATCH_SRC:-$(dirname "$PATCHES")/../../nexlify-panel}"

echo "=== apply-audit-fixes-all ==="

copy() {
  local rel="$1"
  local name="${2:-$(basename "$rel")}"
  mkdir -p "$(dirname "$PANEL/$rel")"
  if [[ -f "$SRC/$rel" ]]; then
    cp "$SRC/$rel" "$PANEL/$rel"
  elif [[ -f "$PATCHES/$rel" ]]; then
    cp "$PATCHES/$rel" "$PANEL/$rel"
  elif [[ -f "$PATCHES/$name" ]]; then
    cp "$PATCHES/$name" "$PANEL/$rel"
  else
    echo "ERROR: missing patch file: $rel (checked $SRC/$rel, $PATCHES/$rel, $PATCHES/$name)" >&2
    return 1
  fi
}

# Prefer live nexlify-panel checkout when present
if [[ ! -d "$SRC/src" ]]; then
  SRC="$PATCHES"
  echo "Using patch files from $PATCHES"
else
  echo "Using panel source from $SRC"
fi

if [[ -d "$SRC/src" ]]; then
  echo "Syncing full src/ tree from $SRC ..."
  mkdir -p "$PANEL/src"
  cp -a "$SRC/src/." "$PANEL/src/"
  if [[ -d "$SRC/public" ]]; then
    mkdir -p "$PANEL/public"
    cp -a "$SRC/public/." "$PANEL/public/"
  fi
  if [[ -d "$SRC/prisma/migrations" ]]; then
    mkdir -p "$PANEL/prisma/migrations"
    cp -a "$SRC/prisma/migrations/." "$PANEL/prisma/migrations/"
  fi
  echo "  + src/ (full tree)"
else
  echo "WARN: no src tree at $SRC — falling back to explicit file list" >&2
fi

mkdir -p "$PANEL/src/lib" "$PANEL/src/components"
mkdir -p "$PANEL/src/app/api/admin/connections"
mkdir -p "$PANEL/src/app/api/admin/dashboard-widgets"
mkdir -p "$PANEL/src/app/api/admin/mag/bulk"
mkdir -p "$PANEL/src/app/api/reseller/epg-preview"
mkdir -p "$PANEL/src/app/api/reseller/dashboard-widgets"
mkdir -p "$PANEL/src/app/admin/dashboard"
mkdir -p "$PANEL/src/app/reseller/live_connections"
mkdir -p "$PANEL/src/app/reseller/mags/bulk"
mkdir -p "$PANEL/src/app/reseller/mag_events"
mkdir -p "$PANEL/src/app/reseller/epg_view"
mkdir -p "$PANEL/src/app/admin/notifications"
mkdir -p "$PANEL/src/app/reseller/notifications"
mkdir -p "$PANEL/src/app/api/admin/notifications/[id]"
mkdir -p "$PANEL/src/app/api/panel/notifications/unread"
mkdir -p "$PANEL/src/app/api/panel/notifications/[id]/read"

mkdir -p "$PANEL/src/app/admin/servers"
mkdir -p "$PANEL/src/app/api/admin/streams"
mkdir -p "$PANEL/src/app/api/admin/import/m3u"
mkdir -p "$PANEL/prisma/migrations/20260604120000_panel_notifications"

if [[ ! -d "$SRC/src" ]]; then
for rel in \
  src/lib/device-access.ts \
  src/lib/panel-paths.ts \
  src/lib/connections.ts \
  src/lib/domains-host.ts \
  src/lib/dashboard-server-metrics.ts \
  src/lib/admin-sidebar-nav.tsx \
  src/lib/reseller-sidebar-nav.tsx \
  src/lib/nav-item-icons.tsx \
  src/components/device-events-page.tsx \
  src/components/epg-preview-page.tsx \
  src/app/api/admin/connections/route.ts \
  src/app/api/admin/mag/route.ts \
  src/app/api/admin/enigma/route.ts \
  src/app/api/admin/mag/bulk/route.ts \
  src/app/api/admin/stb-events/route.ts \
  src/app/api/reseller/stats/route.ts \
  src/app/api/reseller/epg-preview/route.ts \
  src/app/admin/connections/page.tsx \
  src/app/admin/mag/page.tsx \
  src/app/admin/mag/bulk/page.tsx \
  src/app/admin/enigmas/page.tsx \
  src/app/admin/line_activity/page.tsx \
  src/app/admin/mag_events/page.tsx \
  src/app/reseller/live_connections/page.tsx \
  src/app/reseller/mags/page.tsx \
  src/app/reseller/mags/bulk/page.tsx \
  src/app/reseller/enigmas/page.tsx \
  src/app/reseller/line_activity/page.tsx \
  src/app/reseller/enigma/page.tsx \
  src/app/reseller/mag_events/page.tsx \
  src/app/reseller/epg_view/page.tsx \
  src/app/reseller/dashboard/page.tsx \
  src/lib/dashboard-widgets.ts \
  src/components/dashboard-most-watched-by-country.tsx \
  src/components/dashboard-xui-summary-cards.tsx \
  src/components/panel-dashboard.tsx \
  src/app/api/admin/dashboard-widgets/route.ts \
  src/app/api/reseller/dashboard-widgets/route.ts \
  src/app/admin/dashboard/page.tsx \
  src/components/dashboard-expiring-lines.tsx \
  src/components/dashboard-insights-panels.tsx \
  src/lib/panel-notifications.ts \
  src/components/panel-notification-bell.tsx \
  src/components/panel-notifications-admin.tsx \
  src/components/panel-notifications-inbox.tsx \
  src/components/panel-top-nav.tsx \
  src/components/panel-shell.tsx \
  src/app/admin/notifications/page.tsx \
  src/app/reseller/notifications/page.tsx \
  src/app/api/admin/notifications/route.ts \
  "src/app/api/admin/notifications/[id]/route.ts" \
  src/app/api/panel/notifications/route.ts \
  src/app/api/panel/notifications/unread/route.ts \
  "src/app/api/panel/notifications/[id]/read/route.ts" \
  src/lib/server-tree.ts \
  src/components/server-tree-view.tsx \
  src/components/server-tree-picker.tsx \
  src/components/reseller-notifications-widget.tsx \
  src/components/admin-video-management.tsx \
  src/components/import-form.tsx \
  src/components/stream-add-form.tsx \
  src/components/content-folder-page.tsx \
  src/lib/content-folders.ts \
  src/lib/import-media.ts \
  src/app/admin/servers/page.tsx \
  "src/app/api/admin/import/m3u/route.ts" \
  src/app/api/admin/streams/route.ts \
  src/app/icon.png \
  src/app/apple-icon.png \
  public/icon.png \
  public/apple-icon.png \
  public/favicon.ico \
  prisma/migrations/20260604120000_panel_notifications/migration.sql; do
  copy "$rel"
  echo "  + $rel"
done
fi

if [[ -f "$PATCHES/patch-schema-panel-notifications.sh" ]]; then
  bash "$PATCHES/patch-schema-panel-notifications.sh"
  MIGRATION="$PANEL/prisma/migrations/20260604120000_panel_notifications/migration.sql"
  if [[ -f "$MIGRATION" ]]; then
    echo "Applying panel notifications migration..."
    cd "$PANEL"
    npx prisma db execute --file "$MIGRATION" --schema prisma/schema.prisma || echo "WARN: migration may already be applied"
    npx prisma generate
  fi
fi

# VPS env: keep demo host on panel, not marketing site
ENV="$PANEL/.env"
if [[ -f "$ENV" ]]; then
  if grep -q '^PANEL_PRIMARY_DOMAIN=nexlify\.live' "$ENV" 2>/dev/null; then
    sed -i 's/^PANEL_PRIMARY_DOMAIN=nexlify\.live/PANEL_PRIMARY_DOMAIN=panel.nexlify.live/' "$ENV"
    echo "Fixed PANEL_PRIMARY_DOMAIN → panel.nexlify.live"
  fi
  if ! grep -q '^PANEL_EXTRA_DOMAINS=.*panel\.demo\.nexlify\.live' "$ENV" 2>/dev/null; then
    if grep -q '^PANEL_EXTRA_DOMAINS=' "$ENV"; then
      sed -i 's/^PANEL_EXTRA_DOMAINS=\(.*\)/PANEL_EXTRA_DOMAINS=\1,panel.demo.nexlify.live/' "$ENV"
    else
      echo 'PANEL_EXTRA_DOMAINS=panel.demo.nexlify.live' >> "$ENV"
    fi
    echo "Added panel.demo.nexlify.live to PANEL_EXTRA_DOMAINS"
  fi
fi

if [[ -f "$SRC/package.json" ]]; then
  cp "$SRC/package.json" "$PANEL/package.json"
  [[ -f "$SRC/package-lock.json" ]] && cp "$SRC/package-lock.json" "$PANEL/package-lock.json"
  echo "Updated package.json from $SRC ($(node -p "require('$PANEL/package.json').version"))"
elif [[ -f "$PATCHES/package.json" ]]; then
  cp "$PATCHES/package.json" "$PANEL/package.json"
  [[ -f "$PATCHES/package-lock.json" ]] && cp "$PATCHES/package-lock.json" "$PANEL/package-lock.json"
  echo "Updated package.json from patches"
fi

if [[ -f "$PATCHES/apply-panel-fast-update.sh" ]]; then
  chmod +x "$PATCHES/apply-panel-fast-update.sh"
  bash "$PATCHES/apply-panel-fast-update.sh" all
else
  cd "$PANEL"
  echo "Installing panel dependencies..."
  npm ci 2>/dev/null || npm install
  if ! npm run build; then
    echo "ERROR: panel build failed — not restarting PM2 (old process left as-is if running)." >&2
    exit 1
  fi
  APP_DIR="${APP_DIR:-/var/www/nexlify}"
  export PANEL_DIR="$PANEL"
  REBUILD=0 bash "$APP_DIR/deploy/pm2-ensure-panel.sh"
fi
bash "${APP_DIR:-/var/www/nexlify}/deploy/install-panel-watchdog.sh" 2>/dev/null || true

echo "Audit fixes applied (admin/reseller parity, device events, EPG preview, demo host)."
