#!/usr/bin/env bash
# Self-hosted Umami analytics (port 3002).
# Prefer stats.nexlify.live — analytics.nexlify.live may be flagged by Google Safe Browsing.
set -euo pipefail

UMAMI_DIR="${UMAMI_DIR:-/opt/umami}"
COMPOSE_SRC="$(cd "$(dirname "$0")" && pwd)/umami/docker-compose.yml"
NGINX_SITE="/etc/nginx/sites-available/analytics.nexlify.live"
DOMAIN="${UMAMI_DOMAIN:-stats.nexlify.live}"

mkdir -p "$UMAMI_DIR"
cp "$COMPOSE_SRC" "$UMAMI_DIR/docker-compose.yml"

if [[ ! -f "$UMAMI_DIR/.env" ]]; then
  UMAMI_DB_PASSWORD="$(openssl rand -hex 24)"
  UMAMI_APP_SECRET="$(openssl rand -hex 32)"
  cat >"$UMAMI_DIR/.env" <<EOF
UMAMI_DB_PASSWORD=${UMAMI_DB_PASSWORD}
UMAMI_APP_SECRET=${UMAMI_APP_SECRET}
EOF
  chmod 600 "$UMAMI_DIR/.env"
  echo "Created $UMAMI_DIR/.env"
fi

set -a
# shellcheck disable=SC1091
source "$UMAMI_DIR/.env"
set +a

cd "$UMAMI_DIR"
docker compose pull -q
docker compose up -d

echo "Waiting for Umami..."
for _ in $(seq 1 40); do
  if curl -sf "http://127.0.0.1:3002/api/heartbeat" >/dev/null 2>&1; then
    break
  fi
  sleep 2
done

if ! curl -sf "http://127.0.0.1:3002/api/heartbeat" >/dev/null 2>&1; then
  echo "Umami did not become healthy on :3002" >&2
  exit 1
fi

# Seed default admin (admin / umami) on first install only.
if docker compose exec -T umami node scripts/check-db.js >/dev/null 2>&1; then
  :
fi
docker compose exec -T umami npx prisma db seed 2>/dev/null || true

if [[ ! -f "$NGINX_SITE" ]]; then
  cat >"$NGINX_SITE" <<EOF
server {
    listen 80;
    server_name ${DOMAIN};

    location / {
        proxy_pass http://127.0.0.1:3002;
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
  ln -sf "$NGINX_SITE" "/etc/nginx/sites-enabled/$(basename "$NGINX_SITE")"
  nginx -t
  systemctl reload nginx
  echo "Nginx vhost for ${DOMAIN} installed (HTTP). Run enable-ssl.sh for HTTPS."
fi

echo "Umami is running at http://127.0.0.1:3002"
echo "Dashboard: https://${DOMAIN} (after DNS + SSL)"
echo "Default login after seed: admin / umami — change password immediately."
