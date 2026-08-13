#!/usr/bin/env bash
# Pre-built panel update — downloads a .next.tar.gz and swaps it in.
# Skips npm install + npm run build entirely. Safe for low-memory servers.
#
# Usage:
#   bash scripts/apply-prebuilt-update.sh <downloadUrl>            # run all steps (legacy)
#   bash scripts/apply-prebuilt-update.sh <downloadUrl> download   # step 1: download tarball
#   bash scripts/apply-prebuilt-update.sh <downloadUrl> extract    # step 2: extract to staging
#   bash scripts/apply-prebuilt-update.sh <downloadUrl> apply      # step 3: stop, swap, prisma, restart, health
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

DOWNLOAD_URL="${1:?Usage: apply-prebuilt-update.sh <downloadUrl> [download|extract|apply]}"
STEP="${2:-all}"
BACKUP_DIR="$ROOT/.next.backup"
STAGING_DIR="$ROOT/.next.staging"
TMP_TGZ="/tmp/nexlify-next-$$.tar.gz"
ROOT_PKG_BACKUP="/tmp/nexlify-pkg-backup-$$.json"

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
  if [ -f "$ROOT_PKG_BACKUP" ] && [ -f package.json ]; then
    if grep -q '"name"' "$ROOT_PKG_BACKUP" && ! grep -q '"name"' package.json; then
      echo "Restoring root package.json from backup (was corrupted) ..."
      cp "$ROOT_PKG_BACKUP" package.json
    fi
    rm -f "$ROOT_PKG_BACKUP"
  fi
}

# Only install trap for "all" mode (individual steps clean up after themselves)
if [ "$STEP" = "all" ]; then
  trap cleanup EXIT
fi

echo "=== Nexlify Pre-built Update (step: $STEP) ==="
echo "Download URL: $DOWNLOAD_URL"

# Backup root package.json (shared across steps)
if [ ! -f "$ROOT_PKG_BACKUP" ] && [ -f package.json ]; then
  cp package.json "$ROOT_PKG_BACKUP"
  echo "Backed up root package.json"
fi

do_download() {
  echo "Downloading pre-built .next.tar.gz ..."
  ua="NexlifyPanelUpdater/1.0 (+https://nexlify.live)"
  host="${PANEL_VENDOR_HOST:-nexlify.live}"

  resolve_vendor_ip() {
    if [ -n "${PANEL_VENDOR_IP:-}" ]; then
      echo "$PANEL_VENDOR_IP"
      return 0
    fi
    if [ -f "$ROOT/.env" ]; then
      local ip
      ip="$(grep -E '^PANEL_VENDOR_IP=' "$ROOT/.env" 2>/dev/null | tail -1 | cut -d= -f2- | tr -d '\r\"'"'"' ')"
      if [ -n "$ip" ]; then
        echo "$ip"
        return 0
      fi
    fi
    # Bundled / previously bootstrapped origin file
    for f in "$ROOT/scripts/panel-vendor-origin.env" /tmp/nexlify-vendor-origin.env; do
      if [ -f "$f" ]; then
        # shellcheck disable=SC1090
        source "$f" 2>/dev/null || true
        [ -n "${PANEL_VENDOR_IP:-}" ] && echo "$PANEL_VENDOR_IP" && return 0
      fi
    done
    # Known vendor origin (Cloudflare bot-fight bypass)
    echo "85.17.162.54"
    return 0
  }

  curl_download() {
    local url="$1" dest="$2"
    if curl -fsSL -A "$ua" --connect-timeout 20 --max-time 180 --retry 2 --retry-delay 2 -o "$dest" "$url" 2>/dev/null; then
      return 0
    fi
    local ip path
    ip="$(resolve_vendor_ip)"
    if [[ "$url" == https://${host}* ]]; then
      path="${url#https://${host}}"
    elif [[ "$url" == https://nexlify.live* ]]; then
      path="${url#https://nexlify.live}"
    else
      path=""
    fi
    if [ -n "$ip" ] && [ -n "$path" ]; then
      echo "WARN: CDN blocked download — retry via http://${ip}${path} (Host: ${host})" >&2
      curl -fsSL -A "$ua" --connect-timeout 20 --max-time 180 -o "$dest" \
        "http://${ip}${path}" -H "Host: ${host}"
      return $?
    fi
    return 1
  }

  if ! curl_download "$DOWNLOAD_URL" "$TMP_TGZ"; then
    echo "ERROR: Failed to download prebuilt archive (Cloudflare 403? Set PANEL_VENDOR_IP)"
    ensure_panel_running
    exit 1
  fi
  if [ ! -s "$TMP_TGZ" ]; then
    echo "ERROR: Downloaded archive is empty"
    ensure_panel_running
    exit 1
  fi
  # Reject HTML challenge pages pretending to be a tarball
  if file "$TMP_TGZ" 2>/dev/null | grep -qiE 'html|ascii text'; then
    echo "ERROR: Download returned HTML/text instead of a tarball (CDN challenge)"
    ensure_panel_running
    exit 1
  fi
  echo "Downloaded $(du -h "$TMP_TGZ" | cut -f1)"
}

do_extract() {
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

  # Remove standalone/ — prebuilt tarball uses next start mode, not standalone
  rm -rf "$STAGING_DIR/standalone" 2>/dev/null || true

  # Verify the staging directory has a valid build
  if [ ! -f "$STAGING_DIR/BUILD_ID" ]; then
    echo "ERROR: Extracted archive does not contain BUILD_ID — invalid build"
    ensure_panel_running
    exit 1
  fi
  echo "Extracted and validated BUILD_ID"
}

do_apply() {
  backup_next_if_valid

  echo "Stopping panel ..."
  pm2 stop nexlify 2>/dev/null || true
  sleep 2

  echo "Swapping .next directories ..."
  rm -rf .next
  mv "$STAGING_DIR" .next
  rm -rf "$STAGING_DIR"

  # Update repo package.json version so the version API reports the new release
  if [ -f package.json ]; then
    archive_version=""
    if [[ "$DOWNLOAD_URL" =~ next-([0-9]+\.[0-9]+\.[0-9]+)\.tar\.gz ]]; then
      archive_version="${BASH_REMATCH[1]}"
    fi
    if [ -n "$archive_version" ]; then
      echo "Setting package.json version to $archive_version ..."
      sed -i "0,/^  \"version\": *\"[^\"]*\"/s//  \"version\": \"$archive_version\"/" package.json
      if ! grep -q "\"version\": *\"$archive_version\"" package.json; then
        sed -i "s/\"version\": *\"[^\"]*\"/\"version\": \"$archive_version\"/" package.json
      fi
    else
      echo "WARN: Could not derive version from download URL; package.json left unchanged"
    fi
  fi

  echo "Running database migrations ..."
  if [ -f node_modules/.prisma/client/index.js ]; then
    npx prisma generate 2>&1 || echo "WARN: prisma generate failed"
    npx prisma db push --accept-data-loss 2>&1 || echo "WARN: prisma db push failed (non-fatal)"
  fi

  # Restore root package.json if corrupted
  if [ -f "$ROOT_PKG_BACKUP" ]; then
    if grep -q '"name"' "$ROOT_PKG_BACKUP" && ! grep -q '"name"' package.json; then
      echo "Restoring root package.json from backup ..."
      cp "$ROOT_PKG_BACKUP" package.json
    fi
    rm -f "$ROOT_PKG_BACKUP"
  fi

  echo "Starting panel ..."
  pm2 start nexlify --update-env 2>/dev/null || pm2 restart nexlify --update-env 2>/dev/null || true
  pm2 restart nexlify-cron --update-env 2>/dev/null || true
  sleep 3

  # Verify health
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

  # Fallback: standalone may have failed
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
}

case "$STEP" in
  all)
    do_download
    do_extract
    do_apply
    ;;
  download)
    do_download
    ;;
  extract)
    do_extract
    ;;
  apply)
    do_apply
    ;;
  *)
    echo "Unknown step: $STEP (use all|download|extract|apply)" >&2
    exit 1
    ;;
esac
