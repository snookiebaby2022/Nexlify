#!/usr/bin/env bash
# Fast panel patch update — used by Admin → Updates and hourly auto-update cron.
# Downloads the latest tarball from nexlify.live and rebuilds (preserves .env + data/).
#
# Usage: bash scripts/apply-panel-fast-update.sh [sync|deps|prisma|build|restart]
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PANEL_ARCHIVE_URL="${PANEL_ARCHIVE_URL:-https://nexlify.live/downloads/nexlify-panel.tar.gz}"
PANEL_VENDOR_URL="${PANEL_VENDOR_URL:-https://nexlify.live}"
PANEL_INSTALL_BASE="${PANEL_INSTALL_BASE:-${PANEL_VENDOR_URL}/install}"
PANEL_CACHE_BUST="${PANEL_CACHE_BUST:-v160}"
CACHE_FILE="$ROOT/.panel-update-cache.json"

normalize_scripts() {
  sed -i 's/\r$//' "$ROOT"/scripts/*.sh 2>/dev/null || true
  chmod +x "$ROOT"/scripts/*.sh 2>/dev/null || true
}

# Pull latest patch scripts from vendor before sync (fixes chicken-and-egg on old panels).
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
  normalize_scripts
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
      --exclude='.next/' --exclude='.panel-update-cache.json' \
      "$src/" "$ROOT/"
  else
    find "$src" -mindepth 1 -maxdepth 1 ! -name '.env' ! -name 'data' ! -name 'node_modules' ! -name '.next' \
      -exec cp -a {} "$ROOT/" \;
  fi
  sed -i 's/\r$//' "$ROOT"/scripts/*.sh 2>/dev/null || true
  chmod +x "$ROOT"/scripts/*.sh 2>/dev/null || true
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

cmd_build() {
  # Pre-build disk space check — need at least 2GB free
  local free_gb
  free_gb=$(df -BG . | awk 'NR==2{print $4}' | tr -d 'G')
  if [ -n "$free_gb" ] && [ "$free_gb" -lt 2 ]; then
    echo "ERROR: insufficient disk space (${free_gb}GB free, need 2GB+) — aborting build" >&2
    exit 1
  fi
  echo "Building panel ..."
  if pm2 describe nexlify >/dev/null 2>&1; then
    echo "Stopping nexlify during build (avoids .next file races with live workers) ..."
    pm2 stop nexlify 2>/dev/null || true
    sleep 2
  fi
  rm -rf .next
  export NEXT_PRIVATE_WORKER_THREADS=false
  npm run build
  write_cache
  css_count="$(find .next/static/css -name '*.css' 2>/dev/null | wc -l | tr -d ' ')"
  if [ -z "$css_count" ] || [ "$css_count" -lt 1 ]; then
    echo "ERROR: build finished but no CSS in .next/static/css — aborting" >&2
    exit 1
  fi
  echo "Build OK ($css_count CSS bundle(s))"
}

cmd_restart() {
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

STEP="${1:-all}"
case "$STEP" in
  bootstrap) cmd_bootstrap ;;
  sync) cmd_sync ;;
  deps) cmd_deps ;;
  prisma) cmd_prisma ;;
  build) cmd_build ;;
  restart) cmd_restart ;;
  all)
    cmd_sync
    cmd_deps
    cmd_prisma
    cmd_build
    cmd_restart
    ;;
  *)
    echo "Unknown step: $STEP (use sync|deps|prisma|build|restart|all)" >&2
    exit 1
    ;;
esac
