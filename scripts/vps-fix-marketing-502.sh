#!/usr/bin/env bash
# Fix 502 on https://nexlify.live (marketing app / nexlify-web)
# Run on VPS: sudo bash /home/nexlify-panel/scripts/vps-fix-marketing-502.sh
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
MARKETING="${MARKETING_ROOT:-/var/www/nexlify}"
PORT="${MARKETING_PORT:-13001}"
PM2_NAME="${MARKETING_PM2:-nexlify-web}"
DROPIN="$PANEL/marketing-drop-in"

for d in /var/www/nexlify /home/nexlify ${MARKETING_ROOT:-}; do
  if [ -n "$d" ] && [ -f "$d/package.json" ]; then
    MARKETING="$d"
    break
  fi
done

if [ ! -f "$MARKETING/package.json" ]; then
  echo "ERROR: marketing app not found (tried /var/www/nexlify, /home/nexlify)" >&2
  exit 1
fi

echo "=== Marketing root: $MARKETING (port $PORT) ==="

echo ""
echo "=== 1) Livestream drop-in (optional) ==="
if [ -f "$DROPIN/src/app/livestream/page.tsx" ]; then
  mkdir -p "$MARKETING/src/app/livestream" \
    "$MARKETING/src/app/api/livestream/status" \
    "$MARKETING/src/components" \
    "$MARKETING/src/lib"
  cp "$DROPIN/src/app/livestream/page.tsx" "$MARKETING/src/app/livestream/page.tsx"
  cp "$DROPIN/src/app/api/livestream/status/route.ts" "$MARKETING/src/app/api/livestream/status/route.ts"
  cp "$DROPIN/src/components/LivestreamPlayer.tsx" "$MARKETING/src/components/LivestreamPlayer.tsx"
  cp "$DROPIN/src/components/ObsSetupPanel.tsx" "$MARKETING/src/components/ObsSetupPanel.tsx"
  cp "$DROPIN/src/lib/livestream.ts" "$MARKETING/src/lib/livestream.ts"
  echo "Copied livestream files from $DROPIN"
else
  echo "Skip copy (no drop-in at $DROPIN)"
fi

echo ""
echo "=== 2) .env PORT=$PORT ==="
cd "$MARKETING"
touch .env
sed -i 's/\r$//' .env 2>/dev/null || true
set_kv() {
  local k="$1" v="$2"
  if grep -q "^${k}=" .env 2>/dev/null; then
    sed -i "s|^${k}=.*|${k}=${v}|" .env
  else
    echo "${k}=${v}" >> .env
  fi
}
set_kv PORT "$PORT"
set_kv HOSTNAME "127.0.0.1"

if [ -f "$PANEL/scripts/ensure-marketing-env.sh" ]; then
  sed -i 's/\r$//' "$PANEL/scripts/ensure-marketing-env.sh" 2>/dev/null || true
  bash "$PANEL/scripts/ensure-marketing-env.sh" "$MARKETING"
fi

echo ""
echo "=== 2b) Auth UI + API drop-in ==="
if [ -d "$DROPIN/src" ]; then
  cp "$DROPIN/src/components/AuthForm.tsx" "$MARKETING/src/components/AuthForm.tsx"
  cp "$DROPIN/src/app/api/auth/login/route.ts" "$MARKETING/src/app/api/auth/login/route.ts"
  cp "$DROPIN/src/app/login/page.tsx" "$MARKETING/src/app/login/page.tsx"
  echo "Patched login (AuthForm + API + page)"
fi

echo ""
echo "=== 2c) Prisma migrate ==="
npx prisma migrate deploy 2>/dev/null || npx prisma db push 2>/dev/null || true

echo ""
echo "=== 3) Production build ==="
  npm install hls.js@1.5.15 --save
  npm run build

echo ""
echo "=== 3b) Free port $PORT if Docker holds it ==="
if ss -tlnp 2>/dev/null | grep ":${PORT}" | grep -q docker-proxy; then
  echo "Docker is bound to :${PORT} — nginx hits the container, not PM2."
  mapfile -t DOCKER_IDS < <(docker ps -q 2>/dev/null || true)
  for cid in "${DOCKER_IDS[@]}"; do
    ports="$(docker port "$cid" 2>/dev/null || true)"
    if echo "$ports" | grep -q "${PORT}"; then
      name="$(docker inspect --format '{{.Name}}' "$cid" 2>/dev/null | sed 's|^/||')"
      echo "Stopping container $name ($cid) on :${PORT}"
      docker stop "$cid" || true
    fi
  done
  # Match publish=3001 filter as fallback
  docker ps -q --filter "publish=${PORT}" 2>/dev/null | xargs -r docker stop || true
  sleep 2
fi

echo ""
echo "=== 4) PM2 $PM2_NAME on 127.0.0.1:$PORT ==="
pm2 delete "$PM2_NAME" 2>/dev/null || true
cd "$MARKETING"
pm2 start npm --name "$PM2_NAME" -- start -- -H 127.0.0.1 -p "$PORT"
pm2 save

echo "Waiting for :${PORT} to listen..."
for i in $(seq 1 30); do
  if ss -tlnp 2>/dev/null | grep -q ":${PORT}"; then
    break
  fi
  sleep 1
done
if ! ss -tlnp 2>/dev/null | grep -q ":${PORT}"; then
  echo "ERROR: nothing listening on :${PORT} — PM2 logs:" >&2
  pm2 logs "$PM2_NAME" --lines 25 --nostream 2>/dev/null || true
  exit 1
fi

echo ""
echo "=== 5) Nginx upstream → :$PORT ==="
if [ -f "$PANEL/nginx/nexlify-upstream.conf" ]; then
  cp "$PANEL/nginx/nexlify-upstream.conf" /etc/nginx/conf.d/nexlify-upstream.conf
fi
if [ -f "$PANEL/nginx/nexlify.live.conf" ]; then
  cp "$PANEL/nginx/nexlify.live.conf" /etc/nginx/sites-available/nexlify.live
  ln -sf /etc/nginx/sites-available/nexlify.live /etc/nginx/sites-enabled/nexlify.live
fi
nginx -t
systemctl reload nginx

echo ""
echo "=== 6) Verify ==="
pm2 status "$PM2_NAME" || true
ss -tlnp | grep ":${PORT}" || echo "WARN: nothing listening on :${PORT}"
curl -sS -o /dev/null -w "GET / → %{http_code}\n" "http://127.0.0.1:${PORT}/" || echo "FAIL /"
curl -sS -o /dev/null -w "GET /livestream → %{http_code}\n" "http://127.0.0.1:${PORT}/livestream" || echo "FAIL /livestream"

echo ""
echo "If both show 200, https://nexlify.live/livestream should work (purge Cloudflare cache if needed)."
