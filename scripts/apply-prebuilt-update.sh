#!/usr/bin/env bash
# Pre-built panel update — downloads a .next.tar.gz and swaps it in.
# Skips npm install + npm run build entirely. Safe for low-memory servers.
#
# Usage: bash scripts/apply-prebuilt-update.sh <downloadUrl>
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DOWNLOAD_URL="${1:?Usage: apply-prebuilt-update.sh <downloadUrl>}"
BACKUP_DIR="$ROOT/.next.backup"
STAGING_DIR="$ROOT/.next.staging"
TMP_TGZ="/tmp/nexlify-next-$$.tar.gz"

has_valid_next() {
  bash "$ROOT/scripts/has-valid-next-build.sh" 2>/dev/null
}

backup_next_if_valid() {
  if has_valid_next; then
    echo "Backing up current production build to .next.backup ..."
    rm -rf "$BACKUP_DIR"
    cp -a .next "$BACKUP_DIR"
    echo "Backup OK"
  else
    echo "No complete .next to backup"
  fi
}

restore_next_backup() {
  if [ -d "$BACKUP_DIR" ] && [ -f "$BACKUP_DIR/BUILD_ID" ]; then
    echo "Restoring previous production build from .next.backup ..."
    rm -rf .next
    mv "$BACKUP_DIR" .next
    return 0
  fi
  return 1
}

ensure_panel_running() {
  if has_valid_next; then
    pm2 restart nexlify --update-env 2>/dev/null || true
    return 0
  fi
  if restore_next_backup; then
    pm2 restart nexlify --update-env 2>/dev/null || true
    return 0
  fi
  echo "ERROR: No valid .next build available after recovery"
  return 1
}

cleanup() {
  rm -f "$TMP_TGZ"
  rm -rf "$STAGING_DIR"
  # Restore root package.json if it was corrupted during update
  if [ -f "$ROOT_PKG_BACKUP" ] && [ -f package.json ]; then
    # Only restore if the backup has the name field (corrupted files don't)
    if grep -q '"name"' "$ROOT_PKG_BACKUP" && ! grep -q '"name"' package.json; then
      echo "Restoring root package.json from backup (was corrupted) ..."
      cp "$ROOT_PKG_BACKUP" package.json
    fi
    rm -f "$ROOT_PKG_BACKUP"
  fi
}
trap cleanup EXIT

echo "=== Nexlify Pre-built Update ==="
echo "Download URL: $DOWNLOAD_URL"

# Backup root package.json — the tarball extraction and sed operations should not touch it,
# but some npm operations may strip it. Restore after update.
ROOT_PKG_BACKUP="/tmp/nexlify-pkg-backup-$$.json"
if [ -f package.json ]; then
  cp package.json "$ROOT_PKG_BACKUP"
  echo "Backed up root package.json"
fi

# Step 1: Backup current build
backup_next_if_valid

# Step 2: Download pre-built .next.tar.gz
echo "Downloading pre-built .next.tar.gz ..."
ua="NexlifyPanelUpdater/1.0 (+https://nexlify.live)"
if ! curl -fsSL -A "$ua" --connect-timeout 30 --max-time 300 -o "$TMP_TGZ" "$DOWNLOAD_URL"; then
  echo "ERROR: Failed to download prebuilt archive"
  ensure_panel_running
  exit 1
fi
echo "Downloaded $(du -h "$TMP_TGZ" | cut -f1)"

# Step 3: Extract to staging directory
echo "Extracting to staging directory ..."
rm -rf "$STAGING_DIR"
mkdir -p "$STAGING_DIR"
if ! tar xzf "$TMP_TGZ" -C "$STAGING_DIR"; then
  echo "ERROR: Failed to extract archive"
  ensure_panel_running
  exit 1
fi

# Handle both .next.tar.gz (contents inside .next/) and flat archives
if [ -d "$STAGING_DIR/.next" ]; then
  mv "$STAGING_DIR/.next"/* "$STAGING_DIR/.next"/.* "$STAGING_DIR" 2>/dev/null || true
  rmdir "$STAGING_DIR/.next" 2>/dev/null || true
fi

# Remove standalone/ directory — the prebuilt tarball uses `next start` mode (not standalone)
# ecosystem.config.cjs detects standalone/server.js and would switch to standalone mode,
# but standalone needs node_modules/ which the prebuilt tarball doesn't include.
rm -rf "$STAGING_DIR/standalone" 2>/dev/null || true

# Verify the staging directory has a valid build
if [ ! -f "$STAGING_DIR/BUILD_ID" ]; then
  echo "ERROR: Extracted archive does not contain BUILD_ID — invalid build"
  ensure_panel_running
  exit 1
fi

# Step 4: Stop panel, swap .next, restart
echo "Stopping panel ..."
pm2 stop nexlify 2>/dev/null || true
sleep 2

echo "Swapping .next directories ..."
rm -rf .next
mv "$STAGING_DIR" .next
rm -rf "$STAGING_DIR"

# Step 4b: Update repo package.json version so the version API reports the new release.
# The prebuilt archive only contains .next; derive the version from the download URL.
if [ -f package.json ]; then
  archive_version=""
  if [[ "$DOWNLOAD_URL" =~ next-([0-9]+\.[0-9]+\.[0-9]+)\.tar\.gz ]]; then
    archive_version="${BASH_REMATCH[1]}"
  fi
  if [ -n "$archive_version" ]; then
    echo "Setting package.json version to $archive_version ..."
    # Replace only the FIRST "version" field (top-level) — sed '0' limits to first match
    sed -i "0,/^  \"version\": *\"[^\"]*\"/s//  \"version\": \"$archive_version\"/" package.json
    # Fallback: if the above didn't match (e.g. minified JSON), try a broader pattern
    if ! grep -q "\"version\": *\"$archive_version\"" package.json; then
      sed -i "s/\"version\": *\"[^\"]*\"/\"version\": \"$archive_version\"/" package.json
    fi
  else
    echo "WARN: Could not derive version from download URL; package.json left unchanged"
  fi
fi

# Step 5: Run postbuild scripts
echo "Running postbuild scripts ..."
if [ -f scripts/obfuscate-license.js ]; then
  node scripts/obfuscate-license.js 2>&1 || echo "WARN: obfuscate-license failed (non-fatal)"
fi
# Skip prepare-standalone.sh — prebuilt tarball uses `next start` mode, not standalone

# Step 5b: Run database migrations if schema changed
echo "Checking for database schema changes ..."
if [ -f node_modules/.prisma/client/index.js ]; then
  npx prisma generate 2>&1 || echo "WARN: prisma generate failed"
  npx prisma db push --accept-data-loss 2>&1 || echo "WARN: prisma db push failed (non-fatal)"
fi

# Step 6b: Restore root package.json if it was corrupted during update
if [ -f "$ROOT_PKG_BACKUP" ]; then
  if grep -q '"name"' "$ROOT_PKG_BACKUP" && ! grep -q '"name"' package.json; then
    echo "Restoring root package.json from backup (was corrupted during update) ..."
    cp "$ROOT_PKG_BACKUP" package.json
  fi
  rm -f "$ROOT_PKG_BACKUP"
fi

# Step 7: Restart panel and cron
echo "Starting panel ..."
pm2 start nexlify --update-env 2>/dev/null || pm2 restart nexlify --update-env 2>/dev/null || true
pm2 restart nexlify-cron --update-env 2>/dev/null || true
sleep 3

# Step 8: Verify health
PANEL_PORT="$(grep -E '^PANEL_PUBLIC_PORT=' .env 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r"' || echo "80")"
HEALTH_URL="http://127.0.0.1:${PANEL_PORT}/api/health"
[ "$PANEL_PORT" = "443" ] && HEALTH_URL="https://127.0.0.1/api/health"

echo "Verifying health at $HEALTH_URL ..."
for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
    echo "Panel is healthy!"
    rm -rf "$BACKUP_DIR"
    exit 0
  fi
  echo "Waiting for panel to start ($i/10) ..."
  sleep 3
done

# Fallback: standalone may have failed. Try removing standalone and restarting with next start.
if [ -d .next/standalone ]; then
  echo "Standalone mode failed. Falling back to next start mode ..."
  rm -rf .next/standalone
  pm2 restart nexlify --update-env 2>/dev/null || true
  sleep 10
  for i in 1 2 3 4 5; do
    if curl -sf "$HEALTH_URL" > /dev/null 2>&1; then
      echo "Panel is healthy (next start fallback)!"
      rm -rf "$BACKUP_DIR"
      exit 0
    fi
    echo "Waiting for next start fallback ($i/5) ..."
    sleep 3
  done
fi

echo "WARNING: Panel did not respond to health check after fallback attempts"
ensure_panel_running || true
exit 1
