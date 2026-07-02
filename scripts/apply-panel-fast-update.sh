#!/usr/bin/env bash
# Fast panel patch update — used by Admin → Updates and hourly auto-update cron.
# Downloads the latest tarball from nexlify.live and rebuilds (preserves .env + data/).
#
# Safe update: backs up .next before build; on failure restores backup and restarts panel.
#
# Usage: bash scripts/apply-panel-fast-update.sh [sync|deps|prisma|build|build-prep|build-compile|build-standalone|restart|recover|all]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PANEL_ARCHIVE_URL="${PANEL_ARCHIVE_URL:-https://nexlify.live/downloads/nexlify-panel.tar.gz}"
PANEL_VENDOR_URL="${PANEL_VENDOR_URL:-https://nexlify.live}"
PANEL_INSTALL_BASE="${PANEL_INSTALL_BASE:-${PANEL_VENDOR_URL}/install}"
PANEL_CACHE_BUST="${PANEL_CACHE_BUST:-v166}"
CACHE_FILE="$ROOT/.panel-update-cache.json"
BACKUP_DIR="$ROOT/.next.backup"
STAGING_DIR="$ROOT/.next.staging"

BUILD_SUCCEEDED=0
UPDATE_TRAP_ACTIVE=0

normalize_scripts() {
  sed -i 's/\r$//' "$ROOT"/scripts/*.sh 2>/dev/null || true
  chmod +x "$ROOT"/scripts/*.sh 2>/dev/null || true
}

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
    echo "No complete .next to backup (first install or prior failed build)"
  fi
}

restore_next_backup() {
  if [ -d "$BACKUP_DIR" ] && bash -c '[ -f .next.backup/BUILD_ID ] || [ -f .next.backup/standalone/server.js ]' 2>/dev/null; then
    echo "Restoring previous production build from .next.backup ..."
    rm -rf .next
    mv "$BACKUP_DIR" .next
    return 0
  fi
  return 1
}

ensure_panel_running_after_update() {
  if has_valid_next; then
    cmd_restart || true
    return 0
  fi
  if restore_next_backup; then
    cmd_restart || true
    return 0
  fi
  if [ -x "$ROOT/scripts/panel-update-recover.sh" ]; then
    bash "$ROOT/scripts/panel-update-recover.sh" || true
  fi
}

update_trap_exit() {
  local ec=$?
  if [ "$UPDATE_TRAP_ACTIVE" != "1" ]; then
    return "$ec"
  fi
  UPDATE_TRAP_ACTIVE=0
  trap - EXIT
  if [ "$ec" -ne 0 ]; then
    rm -rf "$STAGING_DIR" 2>/dev/null || true
    if [ "$BUILD_SUCCEEDED" != "1" ]; then
      echo "Update failed — rolling back if needed ..."
      if ! has_valid_next; then
        restore_next_backup || true
      fi
    else
      echo "Update build OK but a later step failed — restarting panel ..."
    fi
    ensure_panel_running_after_update || true
  fi
  rm -f "$ROOT/.update-in-progress"
  return "$ec"
}

bootstrap_patch_scripts() {
  local cache="${PANEL_CACHE_BUST}" fetched=0
  local base="${PANEL_INSTALL_BASE}"
  fetch_one() {
    local url="$1" dest="$2"
    mkdir -p "$(dirname "$dest")"
    if curl -fsSL "$url" -o "${dest}.new" 2>/dev/null; then
      sed -i 's/\r$//' "${dest}.new" 2>/dev/null || true
      chmod +x "${dest}.new"
      mv "${dest}.new" "$dest"
      echo "Bootstrapped $(basename "$dest")"
      fetched=$((fetched + 1))
    fi
  }
  fetch_one "${base}/apply-panel-fast-update.sh?${cache}" "$ROOT/scripts/apply-panel-fast-update.sh"
  fetch_one "${base}/scripts/panel-restart-safe.sh?${cache}" "$ROOT/scripts/panel-restart-safe.sh"
  fetch_one "${base}/scripts/panel-update-recover.sh?${cache}" "$ROOT/scripts/panel-update-recover.sh"
  fetch_one "${base}/scripts/has-valid-next-build.sh?${cache}" "$ROOT/scripts/has-valid-next-build.sh"
  normalize_scripts
  # Auto-install tsx if not available (needed for background update worker)
  if ! command -v npx >/dev/null 2>&1 || ! npx tsx --version >/dev/null 2>&1; then
    echo "Installing tsx (required for update worker) ..."
    npm install -g tsx 2>/dev/null || npm install -g tsx --prefix /usr/local 2>/dev/null || echo "WARN: could not install tsx globally"
  fi
  if [ "$fetched" -eq 0 ]; then
    echo "Bootstrap: vendor scripts unchanged or unreachable (continuing with local copies)"
  fi
}

normalize_scripts

case "$PANEL_ARCHIVE_URL" in
  *\?*) ;;
  *) PANEL_ARCHIVE_URL="${PANEL_ARCHIVE_URL}?${PANEL_CACHE_BUST}" ;;
esac

hash_file() {
  local f="$1"
  if [ -f "$f" ]; then
    sha256sum "$f" | awk '{print $1}'
  fi
}

lock_changed() {
  local current prev
  current="$(hash_file "$ROOT/package-lock.json")"
  [ -z "$current" ] && return 0
  if [ ! -f "$CACHE_FILE" ]; then return 0; fi
  prev="$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(c.lockHash||'')}catch{}" "$CACHE_FILE" 2>/dev/null || true)"
  [ "$current" != "$prev" ]
}

schema_changed() {
  local current prev
  current="$(hash_file "$ROOT/prisma/schema.prisma")"
  [ -z "$current" ] && return 1
  if [ ! -f "$CACHE_FILE" ]; then return 0; fi
  prev="$(node -e "try{const c=JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'));process.stdout.write(c.schemaHash||'')}catch{}" "$CACHE_FILE" 2>/dev/null || true)"
  [ "$current" != "$prev" ]
}

write_cache() {
  node -e "
    const fs = require('fs');
    const crypto = require('crypto');
    const hash = (p) => {
      try { return crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex'); }
      catch { return null; }
    };
    fs.writeFileSync(process.argv[1], JSON.stringify({
      lockHash: hash(process.argv[2]),
      schemaHash: hash(process.argv[3]),
    }, null, 2));
  " "$CACHE_FILE" "$ROOT/package-lock.json" "$ROOT/prisma/schema.prisma"
}

verify_downloaded_archive() {
  local archive="$1"
  local size min_bytes=500000
  size="$(wc -c < "$archive" | tr -d '[:space:]')"
  if [ -z "$size" ] || [ "$size" -lt "$min_bytes" ]; then
    echo "ERROR: download too small (${size:-0} bytes) — likely a failed or cached response" >&2
    return 1
  fi
  if ! tar -xOf "$archive" ./package.json >/dev/null 2>&1 && ! tar -xOf "$archive" package.json >/dev/null 2>&1; then
    echo "ERROR: invalid panel tarball (missing package.json) — aborting" >&2
    return 1
  fi
  return 0
}

cmd_bootstrap() {
  bootstrap_patch_scripts
}

cmd_sync() {
  bootstrap_patch_scripts
  local tmp archive src
  tmp="$(mktemp -d /tmp/nexlify-panel-patch-XXXXXX)"
  archive="$tmp/panel.tar.gz"
  echo "Downloading $PANEL_ARCHIVE_URL ..."
  curl -fsSL "$PANEL_ARCHIVE_URL" -o "$archive"
  verify_downloaded_archive "$archive" || { rm -rf "$tmp"; exit 1; }
  mkdir -p "$tmp/extract"
  tar -xzf "$archive" -C "$tmp/extract"
  if [ -d "$tmp/extract/nexlify-panel" ]; then
    src="$tmp/extract/nexlify-panel"
  else
    src="$tmp/extract"
  fi
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude='.env' --exclude='.env.*' \
      --exclude='data/' --exclude='node_modules/' \
      --exclude='.next/' --exclude='.next.backup/' --exclude='.next.staging/' \
      --exclude='.panel-update-cache.json' \
      "$src/" "$ROOT/"
  else
    find "$src" -mindepth 1 -maxdepth 1 ! -name '.env' ! -name 'data' ! -name 'node_modules' ! -name '.next' ! -name '.next.backup' ! -name '.next.staging' \
      -exec cp -a {} "$ROOT/" \;
  fi
  normalize_scripts
  rm -rf "$tmp"
  local synced_ver
  synced_ver="$(node -e "try{process.stdout.write(require('./package.json').version||'')}catch{}" 2>/dev/null || true)"
  echo "Panel files synced from vendor tarball${synced_ver:+ (v${synced_ver})}."
}

cmd_deps() {
  if lock_changed; then
    echo "Lockfile changed — running npm ci ..."
    npm ci --include=dev --include=optional || npm install --include=dev --include=optional
  else
    echo "Lockfile unchanged — skipping npm install."
  fi
}

cmd_prisma() {
  # Prevent shell-exported DATABASE_URL from overriding .env
  unset DATABASE_URL 2>/dev/null || true
  if schema_changed; then
    echo "Schema changed — prisma db push + generate ..."
    npx prisma db push --accept-data-loss --skip-generate
    npx prisma generate
  elif [ ! -d node_modules/.prisma/client ]; then
    echo "Prisma client missing — generating ..."
    npx prisma generate
  else
    echo "Schema unchanged — skipping prisma."
  fi
}

cmd_build_prep() {
  local free_gb
  free_gb=$(df -BG . | awk 'NR==2{print $4}' | tr -d 'G')
  if [ -n "$free_gb" ] && [ "$free_gb" -lt 2 ]; then
    echo "ERROR: insufficient disk space (${free_gb}GB free, need 2GB+) — aborting build" >&2
    exit 1
  fi
  backup_next_if_valid
  rm -rf "$STAGING_DIR"
  echo "Building into .next.staging — panel stays online on current .next until swap + restart."
}

cmd_build_compile() {
  echo "Building panel (staging) ..."
  export NEXT_PRIVATE_WORKER_THREADS=false
  export NEXLIFY_DIST_DIR=".next.staging"
  npm run build
}

swap_staging_build() {
  if ! bash "$ROOT/scripts/has-valid-next-build.sh" ".next.staging"; then
    echo "ERROR: staging build invalid — keeping current .next online" >&2
    return 1
  fi
  export NEXLIFY_DIST_DIR=".next.staging"
  bash "$ROOT/scripts/prepare-standalone.sh" 2>/dev/null || true
  # Strip PANEL_REPO_PATH from standalone .env (build-time path shouldn't persist)
  sed -i '/^PANEL_REPO_PATH=/d' "$ROOT/.next.staging/standalone/.env" 2>/dev/null || true
  bash "$ROOT/scripts/verify-standalone.sh" 2>/dev/null || true
  css_count="$(find .next.staging/static/css -name '*.css' 2>/dev/null | wc -l | tr -d ' ')"
  if [ -z "$css_count" ] || [ "$css_count" -lt 1 ]; then
    echo "ERROR: staging build has no CSS — aborting swap" >&2
    return 1
  fi
  echo "Swapping .next.staging → .next (brief restart follows) ..."
  rm -rf "$ROOT/.next.old"
  if [ -d "$ROOT/.next" ]; then
    mv "$ROOT/.next" "$ROOT/.next.old"
  fi
  mv "$STAGING_DIR" "$ROOT/.next"
  write_cache
  rm -rf "$BACKUP_DIR" "$ROOT/.next.old"
  echo "Build OK ($css_count CSS bundle(s))"
}

cmd_build_standalone() {
  if ! swap_staging_build; then
    rm -rf "$STAGING_DIR"
    return 1
  fi
  BUILD_SUCCEEDED=1
}

cmd_build() {
  UPDATE_TRAP_ACTIVE=1
  trap 'update_trap_exit $?' EXIT
  touch "$ROOT/.update-in-progress"
  cmd_build_prep
  cmd_build_compile
  cmd_build_standalone
  UPDATE_TRAP_ACTIVE=0
  trap - EXIT
}

cmd_restart() {
  if ! has_valid_next; then
    echo "WARN: restart skipped — no valid .next (run recover)" >&2
    return 1
  fi
  if [ -x "$ROOT/scripts/panel-restart-safe.sh" ]; then
    bash "$ROOT/scripts/panel-restart-safe.sh" --nexlify-only
  elif [ -x "$ROOT/scripts/pm2-start.sh" ]; then
    bash "$ROOT/scripts/pm2-start.sh"
  else
    pm2 restart nexlify --update-env 2>/dev/null || pm2 start ecosystem.config.cjs --only nexlify --update-env
    pm2 save 2>/dev/null || true
  fi
  echo "PM2 restart complete."
}

cmd_recover() {
  bash "$ROOT/scripts/panel-update-recover.sh" "${1:-}"
}

cmd_all() {
  UPDATE_TRAP_ACTIVE=1
  trap 'update_trap_exit $?' EXIT
  touch "$ROOT/.update-in-progress"
  cmd_sync
  cmd_deps
  cmd_prisma
  cmd_build_prep
  cmd_build_compile
  cmd_build_standalone
  BUILD_SUCCEEDED=1
  cmd_restart
  # Ensure Redis is running (required for panel cache)
  if command -v redis-cli >/dev/null 2>&1 && ! redis-cli ping >/dev/null 2>&1; then
    echo "Restarting Redis ..."
    systemctl restart redis-server 2>/dev/null || service redis-server restart 2>/dev/null || true
  fi
  if [ -x "$ROOT/scripts/installer-finalize-ports.sh" ]; then
    bash "$ROOT/scripts/installer-finalize-ports.sh" || echo "WARN: port finalize failed (run: sudo bash scripts/sync-panel-ports.sh)" >&2
  fi
  UPDATE_TRAP_ACTIVE=0
  trap - EXIT
  rm -f "$ROOT/.update-in-progress"
}

STEP="${1:-all}"
shift || true
case "$STEP" in
  bootstrap) cmd_bootstrap ;;
  sync) cmd_sync ;;
  deps) cmd_deps ;;
  prisma) cmd_prisma ;;
  build-prep) cmd_build_prep ;;
  build-compile) cmd_build_compile ;;
  build-standalone) cmd_build_standalone ;;
  build) cmd_build ;;
  restart) cmd_restart ;;
  recover) cmd_recover "$@" ;;
  all) cmd_all ;;
  *)
    echo "Unknown step: $STEP (use sync|deps|prisma|build|recover|restart|all)" >&2
    exit 1
    ;;
esac
