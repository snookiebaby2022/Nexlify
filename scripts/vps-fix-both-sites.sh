#!/usr/bin/env bash
# Fix https://nexlify.live and https://panel.nexlify.live on the VPS.
# - panel.nexlify.live → IPTV panel (this repo) on 127.0.0.1:3000
# - nexlify.live       → marketing site on 127.0.0.1:3001 (separate PM2 app)
# Run: sudo bash scripts/vps-fix-both-sites.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
sed -i 's/\r$//' scripts/*.sh nginx/*.conf .env 2>/dev/null || true

if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
  exec sudo bash "$0" "$@"
fi

MARKETING_PORT="${MARKETING_PORT:-13001}"
PANEL_PORT="${PANEL_PORT:-3000}"
MARKETING_ROOT="${MARKETING_ROOT:-}"
for d in /home/nexlify /var/www/nexlify ${MARKETING_ROOT:+$MARKETING_ROOT}; do
  [ -z "$d" ] && continue
  if [ -d "$d" ] && [ -f "$d/package.json" ]; then
    MARKETING_ROOT="$d"
    break
  fi
done
MARKETING_ROOT="${MARKETING_ROOT:-/home/nexlify}"
MARKETING_PM2="${MARKETING_PM2:-nexlify-web}"

echo "=== 1) Panel .env (panel subdomain on :${PANEL_PORT}) ==="
touch .env
set_kv() {
  local k="$1" v="$2"
  if grep -q "^${k}=" .env 2>/dev/null; then
    sed -i "s|^${k}=.*|${k}=${v}|" .env
  else
    echo "${k}=${v}" >> .env
  fi
}
set_kv PORT "${PANEL_PORT}"
set_kv PANEL_PORT "${PANEL_PORT}"
set_kv WEBSITE_PORT "${MARKETING_PORT}"
set_kv STREAM_HTTP_PORT 8080
set_kv PANEL_BEHIND_NGINX 1
set_kv PANEL_BIND_HOST 127.0.0.1
set_kv PANEL_PRIMARY_DOMAIN panel.nexlify.live
set_kv PANEL_ASSUME_PROXY_SSL 1
set_kv PANEL_PUBLIC_PORT 443
set_kv NEXT_PUBLIC_SERVER_URL "https://panel.nexlify.live"
set_kv NEXT_PUBLIC_WEBSITE_URL "https://panel.nexlify.live"

echo ""
echo "=== 2) Free :${PANEL_PORT} for Node (disable nginx :3000 vhosts) ==="
rm -f /etc/nginx/sites-enabled/nexlify-panel-3000 2>/dev/null || true
rm -f /etc/nginx/sites-enabled/nexlify-panel 2>/dev/null || true
for f in /etc/nginx/sites-enabled/*; do
  [ -f "$f" ] || continue
  if grep -q 'listen.*3000' "$f" 2>/dev/null && ! grep -q '127.0.0.1:3000' "$f" 2>/dev/null; then
    echo "Disabling nginx listener on :3000: $f"
    mv "$f" "${f}.disabled-by-fix-both-sites" 2>/dev/null || true
  fi
done

echo ""
echo "=== 3) Nginx upstream + vhosts (443 only) ==="
mkdir -p /etc/nginx/conf.d /etc/nginx/sites-available /etc/nginx/sites-enabled
cp "$ROOT/nginx/nexlify-upstream.conf" /etc/nginx/conf.d/nexlify-upstream.conf
cp "$ROOT/nginx/panel.nexlify.live.conf" /etc/nginx/sites-available/panel.nexlify.live
cp "$ROOT/nginx/nexlify.live.conf" /etc/nginx/sites-available/nexlify.live
ln -sf /etc/nginx/sites-available/panel.nexlify.live /etc/nginx/sites-enabled/panel.nexlify.live
ln -sf /etc/nginx/sites-available/nexlify.live /etc/nginx/sites-enabled/nexlify.live

if ! nginx -t 2>/dev/null; then
  echo "nginx -t failed — trying HTTP-only panel vhost until certs exist..."
  if [ -f "$ROOT/nginx/panel.nexlify.live-http-only.conf" ]; then
    cp "$ROOT/nginx/panel.nexlify.live-http-only.conf" /etc/nginx/sites-available/panel.nexlify.live
  fi
  nginx -t
fi
systemctl reload nginx

echo ""
echo "=== 4) Build + PM2 panel from $ROOT ==="
set -a
. ./.env
set +a
export NEXT_PRIVATE_WORKER_THREADS=false
export PATH="/usr/local/bin:/usr/bin:/bin:$PATH"
if ! bash scripts/has-valid-next-build.sh 2>/dev/null; then
  echo "Missing or stale .next — running npm run build..."
  rm -rf .next
  npm run build
fi
bash scripts/prepare-standalone.sh
if command -v pm2 >/dev/null 2>&1; then
  chmod +x scripts/pm2-start.sh scripts/ensure-panel-env.sh scripts/verify-panel-upstream.sh scripts/wait-panel-ready.sh scripts/has-valid-next-build.sh
  ./scripts/ensure-panel-env.sh
  ./scripts/pm2-start.sh
else
  echo "pm2 missing"
fi

echo ""
echo "=== 5) Marketing app on :${MARKETING_PORT} ($MARKETING_ROOT) ==="
if [ -d "$MARKETING_ROOT" ] && command -v pm2 >/dev/null 2>&1; then
  (
    cd "$MARKETING_ROOT"
    sed -i 's/\r$//' .env package.json 2>/dev/null || true
    if [ -f .env ]; then
      if grep -q '^PORT=' .env 2>/dev/null; then
        sed -i "s|^PORT=.*|PORT=${MARKETING_PORT}|" .env
      else
        echo "PORT=${MARKETING_PORT}" >> .env
      fi
      if grep -q '^HOSTNAME=' .env 2>/dev/null; then
        sed -i 's|^HOSTNAME=.*|HOSTNAME=127.0.0.1|' .env
      else
        echo "HOSTNAME=127.0.0.1" >> .env
      fi
    else
      printf 'PORT=%s\nHOSTNAME=127.0.0.1\n' "${MARKETING_PORT}" > .env
    fi
    if [ ! -f .next/BUILD_ID ] && [ ! -f .next/standalone/server.js ] && [ -f package.json ]; then
      echo "Building marketing..."
      npm run build 2>/dev/null || npm run build || true
    fi
    pm2 delete "${MARKETING_PM2}" 2>/dev/null || true
    PORT="${MARKETING_PORT}" HOSTNAME=127.0.0.1 pm2 start npm --name "${MARKETING_PM2}" -- start -- -H 127.0.0.1 -p "${MARKETING_PORT}"
    pm2 save
  )
else
  echo "Marketing not found at $MARKETING_ROOT"
fi

echo ""
echo "=== 6) Health checks ==="
sleep 4
set -a
. ./.env
set +a
PANEL_PORT="${PORT:-${PANEL_PORT:-13000}}"
ss -tlnp 2>/dev/null | grep -E ":${PANEL_PORT}|:${MARKETING_PORT}" || true
if ./scripts/verify-panel-upstream.sh; then
  curl -fsS "http://127.0.0.1:${PANEL_PORT}/api/health" || true
  echo ""
else
  echo "panel health FAILED — pm2 logs nexlify --lines 30"
  pm2 logs nexlify --lines 15 --nostream 2>/dev/null || true
  exit 1
fi
curl -fsS -o /dev/null -w "marketing :${MARKETING_PORT} HTTP %{http_code}\n" "http://127.0.0.1:${MARKETING_PORT}/" 2>/dev/null \
  || echo "marketing on :${MARKETING_PORT} not responding (panel is OK)"
curl -fsS -o /dev/null -w "webplayer :${MARKETING_PORT} HTTP %{http_code}\n" "http://127.0.0.1:${MARKETING_PORT}/webplayer" 2>/dev/null \
  || echo "webplayer on :${MARKETING_PORT} not responding"

echo ""
echo "=== Done ==="
echo "Panel:    https://panel.nexlify.live/login"
echo "Website:  https://nexlify.live/"
