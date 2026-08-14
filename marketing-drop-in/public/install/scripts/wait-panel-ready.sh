#!/usr/bin/env bash
# Wait until at least one nexlify PM2 worker responds on /api/health.
set -euo pipefail
cd "$(dirname "$0")/.."
set -a
[ -f .env ] && . ./.env
set +a

PORT="${PORT:-${PANEL_PORT:-13000}}"
HOST="${PANEL_BIND_HOST:-127.0.0.1}"
# 0.0.0.0 is a bind wildcard, not a valid connect address — use localhost for health checks.
[ "$HOST" = "0.0.0.0" ] && HOST="127.0.0.1"
URL="http://${HOST}:${PORT}/api/health"
MAX_PM2_WAIT="${PANEL_PM2_WAIT_SEC:-90}"
MAX_HEALTH_WAIT="${PANEL_HEALTH_WAIT_SEC:-90}"

echo "Waiting for nexlify PM2 workers (up to ${MAX_PM2_WAIT}s)..."

pm2_deadline=$((SECONDS + MAX_PM2_WAIT))
while [ "$SECONDS" -lt "$pm2_deadline" ]; do
  online="$(pm2 jlist 2>/dev/null | node -e "
    try {
      const list = JSON.parse(require('fs').readFileSync(0, 'utf8'));
      const apps = list.filter((x) => x.name === 'nexlify');
      const online = apps.filter((a) => a.pm2_env && a.pm2_env.status === 'online').length;
      const launching = apps.filter((a) => a.pm2_env && a.pm2_env.status === 'launching').length;
      process.stdout.write(String(online) + ' ' + String(launching));
    } catch {
      process.stdout.write('0 0');
    }
  " 2>/dev/null || echo "0 0")"
  read -r online_count launching_count <<< "$online"
  if [ "${online_count:-0}" -ge 1 ]; then
    echo "PM2: ${online_count} online, ${launching_count:-0} launching"
    break
  fi
  sleep 2
done

echo "Waiting for ${URL} (up to ${MAX_HEALTH_WAIT}s)..."
health_deadline=$((SECONDS + MAX_HEALTH_WAIT))
tmp_health="$(mktemp)"
ready=0
while [ "$SECONDS" -lt "$health_deadline" ]; do
  for try_url in "$URL" "http://127.0.0.1/api/health" "http://127.0.0.1:13000/api/health"; do
    code="$(curl -sS -o "$tmp_health" -w '%{http_code}' -m 5 "$try_url" 2>/dev/null || echo 000)"
    if [ "$code" = "200" ] || grep -q '"app":"ok"' "$tmp_health" 2>/dev/null; then
      echo "OK: $try_url (HTTP $code)"
      ready=1
      break 2
    fi
  done
  sleep 2
done

if [ "$ready" != "1" ]; then
  echo "ERROR: panel not ready at $URL after ${MAX_HEALTH_WAIT}s"
  cat "$tmp_health" 2>/dev/null || true
  rm -f "$tmp_health"
  pm2 status nexlify 2>/dev/null || true
  pm2 logs nexlify --lines 15 --nostream 2>/dev/null || true
  exit 1
fi
rm -f "$tmp_health"

# Guard against staging distDir mismatch (static 404 → client-side Application error)
chunk="$(find .next/static/chunks -maxdepth 1 -name 'webpack-*.js' 2>/dev/null | head -1 || true)"
if [ -n "$chunk" ]; then
  bn="$(basename "$chunk")"
  static_ok=0
  for base in "http://127.0.0.1" "http://127.0.0.1:13000" "http://${HOST}:${PORT}"; do
    scode="$(curl -sS -o /dev/null -w '%{http_code}' -m 5 -A 'Mozilla/5.0' "${base}/_next/static/chunks/${bn}" 2>/dev/null || echo 000)"
    if [ "$scode" = "200" ]; then
      echo "OK: static chunk HTTP 200 (${bn})"
      static_ok=1
      break
    fi
  done
  if [ "$static_ok" != "1" ]; then
    echo "WARN: /_next/static/chunks/${bn} not HTTP 200 — attempting distdir repair" >&2
    bash scripts/fix-next-distdir-references.sh .next 2>/dev/null || true
    bash scripts/prepare-standalone.sh 2>/dev/null || true
  fi
fi

exit 0
