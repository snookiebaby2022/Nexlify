#!/usr/bin/env bash
# Fast panel update for VPS patch installs — sync files, skip npm/prisma when unchanged.
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"
SRC="${PANEL_PATCH_SRC:-$PATCHES}"
CACHE="$PANEL/.panel-update-cache.json"
PHASE="${1:-all}"

hash_file() {
  if [[ -f "$1" ]]; then
    sha256sum "$1" | awk '{print $1}'
  fi
}

read_cached() {
  local key="$1"
  node -e "
const fs=require('fs');
const p='$CACHE';
const k='$key';
try {
  const j=JSON.parse(fs.readFileSync(p,'utf8'));
  console.log(j[k]||'');
} catch { console.log(''); }
"
}

write_cache() {
  local lock schema
  lock="$(hash_file "$PANEL/package-lock.json")"
  schema="$(hash_file "$PANEL/prisma/schema.prisma")"
  node -e "
const fs=require('fs');
fs.writeFileSync('$CACHE', JSON.stringify({lockHash:'$lock',schemaHash:'$schema'},null,2)+'\n');
"
}

sync_files() {
  echo "==> sync panel files"
  if [[ -d "$SRC/src" ]]; then
    mkdir -p "$PANEL/src"
    cp -a "$SRC/src/." "$PANEL/src/"
  elif [[ -d "$PATCHES/src" ]]; then
    mkdir -p "$PANEL/src"
    cp -a "$PATCHES/src/." "$PANEL/src/"
  else
    echo "ERROR: no src tree in $SRC or $PATCHES" >&2
    exit 1
  fi
  if [[ -d "$SRC/prisma/migrations" ]]; then
    mkdir -p "$PANEL/prisma/migrations"
    cp -a "$SRC/prisma/migrations/." "$PANEL/prisma/migrations/"
  elif [[ -d "$PATCHES/prisma/migrations" ]]; then
    mkdir -p "$PANEL/prisma/migrations"
    cp -a "$PATCHES/prisma/migrations/." "$PANEL/prisma/migrations/"
  fi
  if [[ -f "$SRC/package.json" ]]; then
    cp "$SRC/package.json" "$PANEL/package.json"
    [[ -f "$SRC/package-lock.json" ]] && cp "$SRC/package-lock.json" "$PANEL/package-lock.json"
  elif [[ -f "$PATCHES/package.json" ]]; then
    cp "$PATCHES/package.json" "$PANEL/package.json"
    [[ -f "$PATCHES/package-lock.json" ]] && cp "$PATCHES/package-lock.json" "$PANEL/package-lock.json"
  fi
}

install_deps_if_needed() {
  local cur cached
  cur="$(hash_file "$PANEL/package-lock.json")"
  cached="$(read_cached lockHash)"
  if [[ -n "$cur" && "$cur" == "$cached" && -d "$PANEL/node_modules" ]]; then
    echo "==> npm install (skipped — lockfile unchanged)"
    return 0
  fi
  echo "==> npm ci"
  cd "$PANEL"
  npm ci --no-audit --no-fund --include=dev
}

prisma_if_needed() {
  local cur cached
  cur="$(hash_file "$PANEL/prisma/schema.prisma")"
  cached="$(read_cached schemaHash)"
  cd "$PANEL"
  if [[ -n "$cur" && "$cur" != "$cached" ]]; then
    echo "==> prisma db push"
    npx prisma db push --skip-generate
    echo "==> prisma generate"
    npx prisma generate
  elif [[ ! -d "$PANEL/node_modules/.prisma/client" ]]; then
    echo "==> prisma generate"
    npx prisma generate
  else
    echo "==> prisma (skipped — schema unchanged)"
  fi
}

build_panel() {
  echo "==> npm run build"
  cd "$PANEL"
  NODE_ENV=production npm run build
}

restart_panel() {
  echo "==> pm2 restart"
  APP_DIR="${APP_DIR:-/var/www/nexlify}"
  export PANEL_DIR="$PANEL"
  REBUILD=0 bash "$APP_DIR/deploy/pm2-ensure-panel.sh"
}

case "$PHASE" in
  sync) sync_files ;;
  deps) install_deps_if_needed ;;
  prisma) prisma_if_needed ;;
  build) build_panel ;;
  restart) restart_panel ;;
  all)
    sync_files
    install_deps_if_needed
    prisma_if_needed
    build_panel
    write_cache
    restart_panel
    echo "Fast panel update complete."
    ;;
  *)
    echo "Usage: $0 [sync|deps|prisma|build|restart|all]" >&2
    exit 1
    ;;
esac
