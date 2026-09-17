#!/usr/bin/env bash
set -euo pipefail

# Permanently disable rtmp.d (no rtmp module on nginx.org builds)
if grep -qE '^\s*include /etc/nginx/rtmp\.d' /etc/nginx/nginx.conf; then
  sed -i 's|^\s*include /etc/nginx/rtmp\.d/\*\.conf;|# include /etc/nginx/rtmp.d/*.conf; # disabled: no rtmp module|' /etc/nginx/nginx.conf
fi
mv /etc/nginx/rtmp.d/nexlify-rtmp.conf /etc/nginx/rtmp.d/nexlify-rtmp.conf.disabled 2>/dev/null || true

chmod 755 /opt/nexlify-lb /opt/nexlify-lb/php
chown -R root:www-data /opt/nexlify-lb/php
chmod 644 /opt/nexlify-lb/php/*.php
chmod 640 /etc/nexlify-lb/lb.env
chgrp www-data /etc/nexlify-lb/lb.env

nginx -t
systemctl reload nginx || systemctl restart nginx
systemctl is-active nginx php8.4-fpm redis-server 2>/dev/null || systemctl is-active nginx php8.3-fpm redis-server

echo "HEALTH=$(curl -sS http://127.0.0.1:8090/lb/health)"
curl -sS -o /dev/null -w "noauth=%{http_code}\n" http://127.0.0.1:8090/live/x/y/z.ts

# Resolve line + live stream from panel Postgres (classic-lb StreamServer)
DBURL=$(grep -E '^DATABASE_URL=' /opt/nexlify-panel/.env | head -1 | cut -d= -f2- | sed 's/^["'\'']//;s/["'\'']$//' | tr -d '\r' | sed 's/?.*//')
LB_ID=$(grep -E '^LB_SERVER_ID=' /etc/nexlify-lb/lb.env | head -1 | cut -d= -f2- | tr -d '\r"')
if [[ -z "$LB_ID" ]]; then
  LB_ID=$(psql "$DBURL" -At -c "SELECT id FROM \"StreamServer\" WHERE name='classic-lb' LIMIT 1;")
fi
eval "$(
  psql "$DBURL" -v ON_ERROR_STOP=1 -At -F $'\t' -c "
    SELECT l.username, l.password, s.id
    FROM \"Line\" l
    JOIN \"LineBouquet\" lb ON lb.\"lineId\" = l.id
    JOIN \"BouquetStream\" bs ON bs.\"bouquetId\" = lb.\"bouquetId\"
    JOIN \"Stream\" s ON s.id = bs.\"streamId\"
    WHERE l.status = 'ACTIVE'
      AND s.type = 'LIVE'
      AND s.\"isActive\" = true
      AND (s.\"serverId\" = '${LB_ID}' OR '${LB_ID}' = '')
    LIMIT 1;
  " | awk -F'\t' '{
    gsub(/'\''/, "'\''\\'\'''\''", $1);
    gsub(/'\''/, "'\''\\'\'''\''", $2);
    printf "SMOKE_USER='\''%s'\''\nSMOKE_PASS='\''%s'\''\nSMOKE_ID='\''%s'\''\n", $1, $2, $3;
  }'
)"

if [[ -z "${SMOKE_USER:-}" || -z "${SMOKE_PASS:-}" || -z "${SMOKE_ID:-}" ]]; then
  echo "NO_SMOKE_CREDS"
  exit 2
fi
echo "SMOKE_ID=${SMOKE_ID}"

zap() {
  local url="$1"
  local label="$2"
  local code bytes
  # MPEG-TS is endless; sample briefly. Timeout with bytes still counts as success.
  code=$(curl -sS -o /tmp/nexlify-zap.bin -w '%{http_code}' --max-time 5 --range 0-65535 "$url" 2>/dev/null || true)
  bytes=$(wc -c </tmp/nexlify-zap.bin 2>/dev/null || echo 0)
  if [[ -z "$code" || "$code" == "000" ]] && [[ "${bytes:-0}" -gt 1000 ]]; then
    code=200
  fi
  echo "ZAP_${label} code=${code} bytes=${bytes}"
}

zap "http://127.0.0.1:8090/live/${SMOKE_USER}/${SMOKE_PASS}/${SMOKE_ID}.ts" "TS"
# Second hit should be warm (auth cache + shared ffmpeg)
zap "http://127.0.0.1:8090/live/${SMOKE_USER}/${SMOKE_PASS}/${SMOKE_ID}.ts" "TS2"
zap "http://127.0.0.1:8090/live/${SMOKE_USER}/${SMOKE_PASS}/${SMOKE_ID}/index.m3u8" "HLS"

echo "NGINX=$(nginx -v 2>&1)"
echo "PHP=$(php -v | head -1)"
echo "FFMPEG=$(/usr/local/bin/ffmpeg -version 2>/dev/null | head -1 || ffmpeg -version | head -1)"
echo "REDIS=$(redis-server --version)"
ss -lntp 2>/dev/null | awk '/:(8090|8092) /{print}' | head -5 || true
