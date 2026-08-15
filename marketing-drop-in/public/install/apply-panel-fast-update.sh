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
_PV="$(bash "$ROOT/scripts/panel-version.sh" 2>/dev/null || echo 0)"
PANEL_CACHE_BUST="${PANEL_CACHE_BUST:-v1.9.83}"
CACHE_FILE="$ROOT/.panel-update-cache.json"
BACKUP_DIR="$ROOT/.next.backup"
STAGING_DIR="$ROOT/.next.staging"

BUILD_SUCCEEDED=0
UPDATE_TRAP_ACTIVE=0
PANEL_RESTARTED=0

# Cloudflare bot fight returns 403 to datacenter curl — fall back to origin IP + Host header.
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
  local origin="${PANEL_INSTALL_BASE}/panel-vendor-origin.env"
  if curl -fsSL -A "NexlifyPanelUpdater/1.0" "$origin" -o /tmp/nexlify-vendor-origin.env 2>/dev/null; then
    # shellcheck disable=SC1091
    source /tmp/nexlify-vendor-origin.env 2>/dev/null || true
    [ -n "${PANEL_VENDOR_IP:-}" ] && echo "$PANEL_VENDOR_IP" && return 0
  fi
  return 1
}

curl_vendor() {
  local url="$1" dest="$2"
  local ua="NexlifyPanelUpdater/1.0 (+https://nexlify.live)"
  if curl -fsSL -A "$ua" --retry 2 --retry-delay 2 --max-time 60 "$url" -o "$dest" 2>/dev/null; then
    return 0
  fi
  local ip host path
  ip="$(resolve_vendor_ip 2>/dev/null || echo "85.17.162.54")"
  host="${PANEL_VENDOR_HOST:-nexlify.live}"
  path=""
  if [[ "$url" == https://${host}* ]]; then
    path="${url#https://${host}}"
  elif [[ "$url" == https://nexlify.live* ]]; then
    path="${url#https://nexlify.live}"
  elif [[ "$url" == http://nexlify.live* ]]; then
    path="${url#http://nexlify.live}"
  fi
  # HTTPS to origin via --resolve. Do NOT follow HTTP 301 back to Cloudflare.
  if [ -n "$ip" ] && [ -n "$path" ]; then
    echo "WARN: CDN blocked — retry origin https://${host}${path} (--resolve ${host}:443:${ip})" >&2
    if curl -fsS -A "$ua" --max-time 90 --resolve "${host}:443:${ip}" --resolve "${host}:80:${ip}" \
      "https://${host}${path}" -o "$dest" 2>/dev/null; then
      return 0
    fi
    if curl -fsS -k -A "$ua" --max-time 90 "https://${ip}${path}" -H "Host: ${host}" -o "$dest" 2>/dev/null; then
      return 0
    fi
  fi
  # GitHub source tarball — used when nexlify.live is stale or Cloudflare-blocked.
  local gh="https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main"
  local gh_archive="https://codeload.github.com/snookiebaby2022/Nexlify/tar.gz/refs/heads/main"
  local gh_path=""
  case "$path" in
    /install/panel.sh) gh_path="scripts/install-linux.sh" ;;
    /install/apply-panel-fast-update.sh) gh_path="scripts/apply-panel-fast-update.sh" ;;
    /install/apply-prebuilt-update.sh) gh_path="scripts/apply-prebuilt-update.sh" ;;
    /install/scripts/*) gh_path="scripts/${path#/install/scripts/}" ;;
    /install/*) gh_path="marketing-drop-in/public/install/${path#/install/}" ;;
    /downloads/nexlify-panel.tar.gz|/downloads/next-*.tar.gz)
      echo "WARN: vendor archive failed — retry GitHub main tarball" >&2
      curl -fsSL -A "$ua" --max-time 180 -L "$gh_archive" -o "$dest"
      return $?
      ;;
  esac
  if [ -n "$gh_path" ]; then
    echo "WARN: vendor origin failed — retry GitHub ${gh_path}" >&2
    curl -fsSL -A "$ua" --max-time 90 "${gh}/${gh_path}" -o "$dest"
    return $?
  fi
  echo "ERROR: could not download $url (Cloudflare 403? Set PANEL_VENDOR_IP)" >&2
  return 1
}

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
    # Strip accidental recursive symlinks that break next build NFT tracing
    find "$BACKUP_DIR" -type l \( -name '.next' -o -name '.next.staging' \) -delete 2>/dev/null || true
    find .next -type l \( -name '.next' -o -name '.next.staging' \) -delete 2>/dev/null || true
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
    if curl_vendor "$url" "${dest}.new"; then
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
  fetch_one "${base}/scripts/panel-update-background.sh?${cache}" "$ROOT/scripts/panel-update-background.sh"
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
  if tar -tzf "$archive" 2>/dev/null | grep -Eq '(^|/)package.json$'; then
    return 0
  fi
  echo "ERROR: invalid panel tarball (missing package.json) — aborting" >&2
  return 1
}

find_extracted_panel_src() {
  local extract="$1"
  if [ -d "$extract/nexlify-panel" ] && [ -f "$extract/nexlify-panel/package.json" ]; then
    echo "$extract/nexlify-panel"
    return 0
  fi
  if [ -f "$extract/package.json" ]; then
    echo "$extract"
    return 0
  fi
  local found
  found="$(find "$extract" -maxdepth 2 -name package.json -print 2>/dev/null | head -1)"
  if [ -n "$found" ]; then
    dirname "$found"
    return 0
  fi
  return 1
}

cmd_bootstrap() {
  bootstrap_patch_scripts
}

cmd_sync_git() {
  echo "Git checkout — syncing origin/main (GitHub is source of truth, not vendor tarball)"
  if ! git -C "$ROOT" fetch origin main && ! git -C "$ROOT" fetch origin; then
    echo "WARN: git fetch failed — falling back to tarball" >&2
    return 1
  fi
  local force="${PANEL_UPDATE_FORCE:-}"
  force="$(printf '%s' "$force" | tr '[:upper:]' '[:lower:]')"
  if [ "$force" = "1" ] || [ "$force" = "true" ] || [ "$force" = "yes" ]; then
    git -C "$ROOT" reset --hard origin/main || return 1
  else
    git -C "$ROOT" merge --ff-only origin/main || git -C "$ROOT" reset --hard origin/main || return 1
  fi
  normalize_scripts
  local synced_ver
  synced_ver="$(node -e "try{process.stdout.write(require('./package.json').version||'')}catch{}" 2>/dev/null || true)"
  echo "Panel files synced from git${synced_ver:+ (v${synced_ver})}."
  return 0
}

cmd_sync_tarball() {
  local tmp archive src
  tmp="$(mktemp -d /tmp/nexlify-panel-patch-XXXXXX)"
  archive="$tmp/panel.tar.gz"
  echo "Downloading $PANEL_ARCHIVE_URL ..."
  if ! curl_vendor "$PANEL_ARCHIVE_URL" "$archive"; then
    echo "WARN: vendor tarball failed — downloading GitHub main archive" >&2
    if ! curl -fsSL --max-time 180 -L \
      "https://codeload.github.com/snookiebaby2022/Nexlify/tar.gz/refs/heads/main" \
      -o "$archive"; then
      rm -rf "$tmp"
      echo "ERROR: could not download panel archive from vendor or GitHub" >&2
      exit 1
    fi
  fi
  verify_downloaded_archive "$archive" || { rm -rf "$tmp"; exit 1; }
  mkdir -p "$tmp/extract"
  tar -xzf "$archive" -C "$tmp/extract"
  src="$(find_extracted_panel_src "$tmp/extract")" || {
    echo "ERROR: extracted archive has no package.json" >&2
    rm -rf "$tmp"
    exit 1
  }
  if command -v rsync >/dev/null 2>&1; then
    rsync -a --delete \
      --exclude='.git/' --exclude='.env' --exclude='.env.*' \
      --exclude='data/' --exclude='node_modules/' \
      --exclude='.next/' --exclude='.next.backup/' --exclude='.next.staging/' \
      --exclude='.panel-update-cache.json' \
      "$src/" "$ROOT/"
  else
    find "$src" -mindepth 1 -maxdepth 1 ! -name '.git' ! -name '.env' ! -name 'data' ! -name 'node_modules' ! -name '.next' ! -name '.next.backup' ! -name '.next.staging' \
      -exec cp -a {} "$ROOT/" \;
  fi
  normalize_scripts
  rm -rf "$tmp"
  local synced_ver
  synced_ver="$(node -e "try{process.stdout.write(require('./package.json').version||'')}catch{}" 2>/dev/null || true)"
  echo "Panel files synced from archive${synced_ver:+ (v${synced_ver})}."
}

cmd_sync() {
  bootstrap_patch_scripts
  if [ -d "$ROOT/.git" ] && cmd_sync_git; then
    return 0
  fi
  cmd_sync_tarball
}

cmd_deps() {
  if lock_changed; then
    echo "Lockfile changed — running npm ci ..."
    npm ci --include=dev --include=optional || npm install --include=dev --include=optional
  elif [ ! -d node_modules/tailwindcss ] || [ ! -d node_modules/typescript ]; then
    echo "Dev dependencies missing (tailwindcss/typescript) — running npm ci ..."
    npm ci --include=dev --include=optional || npm install --include=dev --include=optional
  else
    echo "Lockfile unchanged — dev deps present."
  fi
  if [ -x "$ROOT/scripts/ensure-pg-dump.sh" ]; then
    bash "$ROOT/scripts/ensure-pg-dump.sh" || echo "WARN: pg_dump helper skipped"
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
  if [ -x "$ROOT/scripts/ensure-customer-ip-env.sh" ]; then
    bash "$ROOT/scripts/ensure-customer-ip-env.sh" || true
  fi
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
  export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=4096}"
  export NEXT_PRIVATE_WORKER_THREADS=false
  export NEXLIFY_DIST_DIR=".next.staging"
  # Call next directly — do not use `npm run build` (that wrapper routes back here).
  if node ./node_modules/next/dist/bin/next build; then
    return 0
  fi
  echo "WARN: next build failed (webpack?) — clear caches + reinstall optional SWC + retry once ..." >&2
  rm -rf .next.staging node_modules/.cache .next/cache 2>/dev/null || true
  rm -rf node_modules
  npm ci --include=dev --include=optional --no-audit --no-fund --loglevel=error
  # Ensure platform SWC binary is present (missing binary → "generate is not a function")
  npm install --no-save --include=optional @next/swc-linux-x64-gnu 2>/dev/null || \
    npm install --no-save --include=optional @next/swc-linux-x64-musl 2>/dev/null || true
  export NEXLIFY_DIST_DIR=".next.staging"
  node ./node_modules/next/dist/bin/next build
}

swap_staging_build() {
  if ! bash "$ROOT/scripts/has-valid-next-build.sh" ".next.staging"; then
    echo "ERROR: staging build invalid — keeping current .next online" >&2
    return 1
  fi
  export NEXLIFY_DIST_DIR=".next.staging"
  bash "$ROOT/scripts/prepare-standalone.sh" 2>/dev/null || true
  bash "$ROOT/scripts/verify-standalone.sh" 2>/dev/null || true
  css_count="$(find .next.staging/static/css -name '*.css' 2>/dev/null | wc -l | tr -d ' ')"
  if [ -z "$css_count" ] || [ "$css_count" -lt 1 ]; then
    echo "ERROR: staging build has no CSS — aborting swap" >&2
    return 1
  fi
  echo "Swapping .next.staging → .next (panel restart follows immediately) ..."
  rm -rf "$ROOT/.next.old"
  if [ -d "$ROOT/.next" ]; then
    mv "$ROOT/.next" "$ROOT/.next.old"
  fi
  mv "$STAGING_DIR" "$ROOT/.next"
  # Ensure baked staging distDir never reaches production runtime
  unset NEXLIFY_DIST_DIR || true
  export NEXLIFY_DIST_DIR=".next"
  bash "$ROOT/scripts/fix-next-distdir-references.sh" "$ROOT/.next" 2>/dev/null || true
  bash "$ROOT/scripts/prepare-standalone.sh" 2>/dev/null || true
  bash "$ROOT/scripts/verify-standalone.sh" 2>/dev/null || true
  write_cache
  echo "Build OK ($css_count CSS bundle(s))"
  echo "Restarting panel on new build (expect ~15–60s brief outage) ..."
  if cmd_restart; then
    rm -rf "$BACKUP_DIR" "$ROOT/.next.old"
  else
    echo "WARN: restart after swap failed — keeping .next.old for recovery" >&2
    return 1
  fi
}

cmd_build_standalone() {
  if ! swap_staging_build; then
    rm -rf "$STAGING_DIR"
    return 1
  fi
  BUILD_SUCCEEDED=1
}

# Swap staging → .next without restart (caller restarts via panel-restart-safe).
cmd_swap() {
  if ! bash "$ROOT/scripts/has-valid-next-build.sh" ".next.staging"; then
    echo "ERROR: staging build invalid — keeping current .next online" >&2
    return 1
  fi
  export NEXLIFY_DIST_DIR=".next.staging"
  bash "$ROOT/scripts/prepare-standalone.sh" 2>/dev/null || true
  bash "$ROOT/scripts/verify-standalone.sh" 2>/dev/null || true
  css_count="$(find .next.staging/static/css -name '*.css' 2>/dev/null | wc -l | tr -d ' ')"
  if [ -z "$css_count" ] || [ "$css_count" -lt 1 ]; then
    echo "ERROR: staging build has no CSS — aborting swap" >&2
    return 1
  fi
  echo "Swapping .next.staging → .next (restart deferred) ..."
  rm -rf "$ROOT/.next.old"
  if [ -d "$ROOT/.next" ]; then
    mv "$ROOT/.next" "$ROOT/.next.old"
  fi
  mv "$STAGING_DIR" "$ROOT/.next"
  unset NEXLIFY_DIST_DIR || true
  export NEXLIFY_DIST_DIR=".next"
  bash "$ROOT/scripts/fix-next-distdir-references.sh" "$ROOT/.next" 2>/dev/null || true
  bash "$ROOT/scripts/prepare-standalone.sh" 2>/dev/null || true
  bash "$ROOT/scripts/verify-standalone.sh" 2>/dev/null || true
  write_cache
  BUILD_SUCCEEDED=1
  echo "Build OK ($css_count CSS bundle(s)) — ready for restart"
}

cmd_build() {
  if [ -f "$ROOT/scripts/nexlify-migrate-guard.sh" ]; then
    # shellcheck disable=SC1091
    . "$ROOT/scripts/nexlify-migrate-guard.sh"
    if ! nexlify_refuse_restart_if_migrating; then
      return 1
    fi
  fi
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
  if [ -f "$ROOT/scripts/nexlify-migrate-guard.sh" ]; then
    # shellcheck disable=SC1091
    . "$ROOT/scripts/nexlify-migrate-guard.sh"
    if ! nexlify_refuse_restart_if_migrating; then
      return 1
    fi
  fi
  if [ "$PANEL_RESTARTED" = "1" ]; then
    echo "Panel already restarted after build swap."
    return 0
  fi
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
  if [ -f "$ROOT/.next/standalone/server.js" ]; then
    unset NEXLIFY_DIST_DIR || true
    export NEXLIFY_DIST_DIR=".next"
    bash "$ROOT/scripts/fix-next-distdir-references.sh" "$ROOT/.next" 2>/dev/null || true
    bash "$ROOT/scripts/prepare-standalone.sh" 2>/dev/null || true
    bash "$ROOT/scripts/verify-standalone.sh" 2>/dev/null || true
  fi
  if [ -x "$ROOT/scripts/wait-panel-ready.sh" ]; then
    bash "$ROOT/scripts/wait-panel-ready.sh" || echo "WARN: panel slow to respond after restart" >&2
  else
    sleep 5
  fi
  # Fail loud if static assets 404 (causes "Application error: client-side exception")
  _chunk="$(find "$ROOT/.next/static/chunks" -maxdepth 1 -name 'webpack-*.js' 2>/dev/null | head -1 || true)"
  if [ -n "$_chunk" ]; then
    _bn="$(basename "$_chunk")"
    _code="$(curl -sS -o /dev/null -w '%{http_code}' -A 'Mozilla/5.0' "http://127.0.0.1/_next/static/chunks/${_bn}" 2>/dev/null || echo 000)"
    if [ "$_code" = "000" ]; then
      _code="$(curl -sS -o /dev/null -w '%{http_code}' -A 'Mozilla/5.0' "http://127.0.0.1:13000/_next/static/chunks/${_bn}" 2>/dev/null || echo 000)"
    fi
    if [ "$_code" != "200" ]; then
      echo "ERROR: /_next/static/chunks/${_bn} returned HTTP ${_code} — fixing distdir and retrying prepare..." >&2
      bash "$ROOT/scripts/fix-next-distdir-references.sh" "$ROOT/.next" 2>/dev/null || true
      bash "$ROOT/scripts/prepare-standalone.sh" 2>/dev/null || true
      if [ -x "$ROOT/scripts/panel-restart-safe.sh" ]; then
        bash "$ROOT/scripts/panel-restart-safe.sh" --nexlify-only 2>/dev/null || true
        sleep 3
      fi
      _code2="$(curl -sS -o /dev/null -w '%{http_code}' -A 'Mozilla/5.0' "http://127.0.0.1/_next/static/chunks/${_bn}" 2>/dev/null || echo 000)"
      if [ "$_code2" != "200" ]; then
        echo "ERROR: static assets still HTTP ${_code2} after repair — UI will show client-side exception" >&2
        return 1
      fi
      echo "Static assets recovered after distdir repair."
    fi
  fi
  PANEL_RESTARTED=1
  echo "PM2 restart complete."

  # Ensure watchdog cron is installed
  if [ -f "$ROOT/scripts/nexlify-watchdog.sh" ]; then
    chmod +x "$ROOT/scripts/nexlify-watchdog.sh"
    _cron_tmp="$(mktemp)"
    (
      crontab -l 2>/dev/null | grep -v nexlify-watchdog || true
      echo "*/5 * * * * $ROOT/scripts/nexlify-watchdog.sh"
    ) > "$_cron_tmp"
    crontab "$_cron_tmp" >/dev/null 2>&1 || true
    rm -f "$_cron_tmp"
  fi
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
  swap) cmd_swap ;;
  build) cmd_build ;;
  restart) cmd_restart ;;
  recover) cmd_recover "$@" ;;
  all) cmd_all ;;
  *)
    echo "Unknown step: $STEP (use sync|deps|prisma|build|build-prep|build-compile|build-standalone|swap|recover|restart|all)" >&2
    exit 1
    ;;
esac
