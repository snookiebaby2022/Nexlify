#!/usr/bin/env bash
# Post-release checks — standalone JS/CSS, version API, login. Run on the panel VPS after deploy.
set -euo pipefail

ROOT="${PANEL_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$ROOT"

fail() {
  echo "VERIFY FAIL: $*" >&2
  exit 1
}

read_env() {
  grep "^${1}=" .env 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^["'\'' ]*//' -e 's/["'\'' ]*$//' || true
}

PKG_VER="$(node -e "try{process.stdout.write(require('./package.json').version||'')}catch{}" 2>/dev/null || true)"
[ -n "$PKG_VER" ] || fail "package.json version missing"

set -a
[ -f .env ] && . ./.env
set +a

PORT="${PORT:-${PANEL_PORT:-13000}}"
BIND_HOST="${PANEL_BIND_HOST:-127.0.0.1}"

echo "==> Panel release verify (v${PKG_VER}) in ${ROOT}"

if [ -f .next/standalone/server.js ]; then
  unset NEXLIFY_DIST_DIR 2>/dev/null || true
  bash scripts/verify-standalone.sh
  STANDALONE_CSS="$(find .next/standalone/.next/static/css -name '*.css' 2>/dev/null | wc -l | tr -d ' ')"
  STANDALONE_CHUNKS="$(find .next/standalone/.next/static/chunks -maxdepth 1 -type f 2>/dev/null | wc -l | tr -d ' ')"
  [ "${STANDALONE_CSS:-0}" -ge 1 ] || fail "standalone has no CSS bundles"
  [ "${STANDALONE_CHUNKS:-0}" -ge 5 ] || fail "standalone has too few JS chunks (${STANDALONE_CHUNKS})"
  if [ ! -f .next/standalone/package.json ] && [ ! -f package.json ]; then
    fail "package.json missing for version API"
  fi
  echo "    standalone OK (${STANDALONE_CHUNKS} chunks, ${STANDALONE_CSS} CSS)"
else
  echo "    WARN: no standalone build (non-standalone PM2 mode)"
fi

if [ -x scripts/wait-panel-ready.sh ]; then
  bash scripts/wait-panel-ready.sh || fail "panel not ready (wait-panel-ready timed out)"
fi

probe_url() {
  local url="$1"
  curl -fsS -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 15 "$url" 2>/dev/null || echo "000"
}

BASE=""
for candidate in "http://${BIND_HOST}:${PORT}" "http://127.0.0.1:${PORT}" "http://127.0.0.1:80" "http://127.0.0.1:3000" "http://127.0.0.1:13000"; do
  [ -n "$candidate" ] || continue
  code="$(probe_url "${candidate}/api/health")"
  if [ "$code" = "200" ]; then
    BASE="$candidate"
    break
  fi
done

DOMAIN="$(read_env PANEL_PRIMARY_DOMAIN)"
if [ -z "$BASE" ] && [ -n "$DOMAIN" ]; then
  code="$(curl -fsS -o /dev/null -w '%{http_code}' --connect-timeout 5 --max-time 15 \
    -H "Host: ${DOMAIN}" "http://127.0.0.1:${PORT}/api/health" 2>/dev/null || echo "000")"
  if [ "$code" = "200" ]; then
    BASE="http://127.0.0.1:${PORT}"
  fi
fi

[ -n "$BASE" ] || fail "panel not responding on ${BIND_HOST}:${PORT} (also tried :80, :3000, :13000)"

HEALTH="$(probe_url "${BASE}/api/health")"
[ "$HEALTH" = "200" ] || fail "/api/health returned ${HEALTH} (expected 200)"

LOGIN="$(probe_url "${BASE}/login")"
[ "$LOGIN" = "200" ] || fail "/login returned ${LOGIN} (expected 200)"

API_VER="$(curl -fsS --connect-timeout 5 --max-time 15 "${BASE}/api/panel/version" 2>/dev/null \
  | node -e "let s='';process.stdin.on('data',d=>s+=d);process.stdin.on('end',()=>{try{const j=JSON.parse(s);process.stdout.write(String(j.version||''))}catch{}})" 2>/dev/null || true)"
[ -n "$API_VER" ] && [ "$API_VER" != "unknown" ] || fail "/api/panel/version missing or unknown"
[ "$API_VER" = "$PKG_VER" ] || fail "version mismatch: package.json=${PKG_VER} api=${API_VER}"

echo "    health OK (${BASE})"
echo "    login OK"
echo "    version API OK (v${API_VER})"
echo "VERIFY OK — panel v${PKG_VER} ready"
