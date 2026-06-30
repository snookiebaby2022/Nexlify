#!/usr/bin/env bash
# Generate / refresh RTMP ingest vhost from RTMP_PORT in .env (panel-driven).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=scripts/nexlify-port-registry.sh
source "$ROOT/scripts/nexlify-port-registry.sh"
nexlify_load_ports_from_env "$ROOT"

DEST="/etc/nginx/conf.d/nexlify-rtmp.conf"
HLS_DIR="${NEXLIFY_HLS_DIR:-/var/www/nexlify-hls}"
RTMP_PORT="$NEXLIFY_PORT_RTMP"

nexlify_read_env_file() {
  grep "^${1}=" "$ROOT/.env" 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^["'\'' ]*//' -e 's/["'\'' ]*$//' || true
}

RTMP_ENABLED="$(nexlify_read_env_file NEXLIFY_RTMP_ENABLED)"
if [ "$RTMP_ENABLED" = "0" ] || [ "$RTMP_ENABLED" = "false" ]; then
  echo "[rtmp] RTMP disabled in .env — removing vhost"
  rm -f "$DEST" 2>/dev/null || true
  if command -v nginx >/dev/null 2>&1; then
    nginx -t 2>/dev/null && systemctl reload nginx 2>/dev/null || true
  fi
  exit 0
fi

if ! command -v nginx >/dev/null 2>&1; then
  echo "[rtmp] nginx not installed — skip"
  exit 0
fi

if ! nginx -V 2>&1 | grep -qi rtmp; then
  echo "[rtmp] nginx RTMP module not found — installing libnginx-mod-rtmp (if available)…"
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq 2>/dev/null || true
  apt-get install -y -qq libnginx-mod-rtmp 2>/dev/null || \
    apt-get install -y -qq nginx-extras 2>/dev/null || \
    echo "[rtmp] WARN: install libnginx-mod-rtmp manually for RTMP ingest"
fi

mkdir -p "$HLS_DIR"
chown -R www-data:www-data "$HLS_DIR" 2>/dev/null || true

cat > "$DEST" <<RTMP
# Nexlify RTMP ingest — generated $(date -u +%Y-%m-%dT%H:%M:%SZ)
# OBS: rtmp://YOUR_HOST:${RTMP_PORT}/live  stream key: your-stream-name
# HLS playback: /hls/STREAM-NAME.m3u8 (when nginx-rtmp module is loaded)

rtmp {
    server {
        listen ${RTMP_PORT};
        chunk_size 4096;

        application live {
            live on;
            record off;

            allow publish all;
            allow play 127.0.0.1;
            deny play all;

            hls on;
            hls_path ${HLS_DIR};
            wait_key on;
            hls_fragment 2s;
            hls_playlist_length 30s;
            hls_nested off;
            hls_sync 200ms;
        }
    }
}
RTMP

nginx -t
systemctl reload nginx

echo "[rtmp] RTMP ingest on :${RTMP_PORT} (HLS → ${HLS_DIR})"
