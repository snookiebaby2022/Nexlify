#!/usr/bin/env bash
# Install Nexlify music relay on the VPS (yt-dlp + spotdl + PM2).
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/nexlify}"
RELAY_DIR="${RELAY_DIR:-/opt/nexlify-music-relay}"
PORT="${MUSIC_RELAY_PORT:-8788}"

echo "=== install-music-relay ==="

command -v node >/dev/null || { echo "Node.js required"; exit 1; }

apt-get update -qq
apt-get install -y -qq python3-pip ffmpeg curl >/dev/null 2>&1 || true
pip3 install -q --upgrade yt-dlp spotdl 2>/dev/null || pip install -q --upgrade yt-dlp spotdl 2>/dev/null || true

mkdir -p "$RELAY_DIR"
rsync -a --delete "$APP_DIR/music-relay/" "$RELAY_DIR/" \
  --exclude node_modules --exclude dist --exclude .env

cd "$RELAY_DIR"
if [ ! -f .env ]; then
  cp .env.example .env
  RELAY_KEY=$(openssl rand -hex 24 2>/dev/null || head -c 48 /dev/urandom | xxd -p | tr -d '\n')
  sed -i "s/^RELAY_API_KEY=.*/RELAY_API_KEY=$RELAY_KEY/" .env
  sed -i "s/^PORT=.*/PORT=$PORT/" .env || echo "PORT=$PORT" >> .env
  echo "Created $RELAY_DIR/.env — RELAY_API_KEY generated"
fi

RELAY_KEY="$(grep ^RELAY_API_KEY= "$RELAY_DIR/.env" | cut -d= -f2-)"
PANEL_DIR="${PANEL_DIR:-/home/nexlify-panel}"
PANEL_ENV="$PANEL_DIR/.env"
if [ -f "$PANEL_ENV" ]; then
  grep -q '^MUSIC_RELAY_BASE_URL=' "$PANEL_ENV" || echo "MUSIC_RELAY_BASE_URL=http://127.0.0.1:$PORT" >> "$PANEL_ENV"
  if [ -n "$RELAY_KEY" ]; then
    if grep -q '^MUSIC_RELAY_API_KEY=' "$PANEL_ENV"; then
      sed -i "s|^MUSIC_RELAY_API_KEY=.*|MUSIC_RELAY_API_KEY=$RELAY_KEY|" "$PANEL_ENV"
    else
      echo "MUSIC_RELAY_API_KEY=$RELAY_KEY" >> "$PANEL_ENV"
    fi
  fi
  echo "Panel env updated: MUSIC_RELAY_BASE_URL + MUSIC_RELAY_API_KEY"
fi

npm ci 2>/dev/null || npm install
npm run build

pm2 delete music-relay 2>/dev/null || true
PORT="$PORT" RELAY_API_KEY="$(grep ^RELAY_API_KEY= .env | cut -d= -f2-)" \
  pm2 start dist/server.js --name music-relay --cwd "$RELAY_DIR" --update-env
pm2 save

echo "music-relay on http://127.0.0.1:$PORT"
curl -sf "http://127.0.0.1:$PORT/health" && echo " health OK" || echo "WARN: health check failed"
echo "Done. Relay listens on http://127.0.0.1:$PORT (panel uses MUSIC_RELAY_BASE_URL automatically)."
