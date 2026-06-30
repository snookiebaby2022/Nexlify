#!/usr/bin/env bash
# OBS livestream RTMP ingest for nexlify.live/livestream
#
# Main site nginx (apt) does NOT include RTMP by default — including
# nexlify.live-rtmp-hls.conf without the module breaks nginx -t.
#
# This script either:
#   A) installs libnginx-mod-rtmp + load_module in main nginx, or
#   B) runs a separate nginx-rtmp binary on :1935 (does not touch main nginx.conf)
#
# Usage (on VPS as root):
#   sudo bash /home/nexlify-panel/scripts/install-livestream-rtmp.sh
#
# Recover broken nginx first:
#   sudo bash /home/nexlify-panel/scripts/install-livestream-rtmp.sh --recover-only
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
RTMP_CONF_SRC="$ROOT/nginx/nexlify.live-rtmp-hls.conf"
RTMP_CONF_DST="/etc/nginx/nexlify.live-rtmp-hls.conf"
HLS_DIR="/var/www/nexlify-hls"
STANDALONE_ROOT="/opt/nexlify-rtmp"
STANDALONE_CONF="$STANDALONE_ROOT/nginx.conf"
MODE="${LIVESTREAM_RTMP_MODE:-auto}" # auto | module | standalone

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root: sudo bash $0" >&2
  exit 1
fi

recover_main_nginx() {
  if grep -q 'nexlify.live-rtmp-hls.conf' /etc/nginx/nginx.conf 2>/dev/null; then
    echo "Removing RTMP include from /etc/nginx/nginx.conf (fixes unknown directive rtmp)..."
    sed -i '/nexlify.live-rtmp-hls.conf/d' /etc/nginx/nginx.conf
  fi
  if grep -q 'load_module.*ngx_rtmp_module' /etc/nginx/nginx.conf 2>/dev/null; then
    echo "Removing duplicate load_module ngx_rtmp_module from /etc/nginx/nginx.conf..."
    sed -i '/load_module.*ngx_rtmp_module/d' /etc/nginx/nginx.conf
  fi
  nginx -t
  systemctl reload nginx
  echo "Main nginx recovered."
}

if [ "${1:-}" = "--recover-only" ]; then
  recover_main_nginx
  exit 0
fi

echo "=== 1) Recover main nginx if RTMP include broke it ==="
if ! nginx -t 2>/dev/null; then
  recover_main_nginx
else
  echo "Main nginx config OK."
fi

echo ""
echo "=== 2) HLS output directory ==="
mkdir -p "$HLS_DIR"
chown www-data:www-data "$HLS_DIR"

echo ""
echo "=== 3) Copy RTMP config ==="
cp "$RTMP_CONF_SRC" "$RTMP_CONF_DST"

echo ""
echo "=== 4) Ensure /hls/ location on nexlify.live vhost ==="
SITE="/etc/nginx/sites-available/nexlify.live"
if [ -f "$SITE" ] && ! grep -q 'location /hls/' "$SITE"; then
  echo "WARNING: $SITE has no location /hls/ — copy from $ROOT/nginx/nexlify.live.conf"
fi

rtmp_module_already_loaded() {
  grep -rq 'ngx_rtmp_module' /etc/nginx/modules-enabled/ 2>/dev/null \
    || grep -q 'ngx_rtmp_module' /etc/nginx/nginx.conf 2>/dev/null
}

try_apt_rtmp_module() {
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq libnginx-mod-rtmp 2>/dev/null || return 1

  local mod=""
  for candidate in \
    /usr/lib/nginx/modules/ngx_rtmp_module.so \
    /etc/nginx/modules/ngx_rtmp_module.so; do
    if [ -f "$candidate" ]; then
      mod="$candidate"
      break
    fi
  done
  [ -n "$mod" ] || rtmp_module_already_loaded || return 1

  # Ubuntu loads libnginx-mod-rtmp via /etc/nginx/modules-enabled/ — do not duplicate load_module
  sed -i '/load_module.*ngx_rtmp_module/d' /etc/nginx/nginx.conf

  if ! grep -q 'nexlify.live-rtmp-hls.conf' /etc/nginx/nginx.conf; then
    sed -i "/^events/i include ${RTMP_CONF_DST};" /etc/nginx/nginx.conf
  fi
  nginx -t
  systemctl reload nginx
  echo "RTMP enabled via libnginx-mod-rtmp on main nginx (port 1935)."
  return 0
}

install_standalone_nginx_rtmp() {
  echo "Installing standalone nginx-rtmp to $STANDALONE_ROOT ..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -qq
  apt-get install -y -qq build-essential libpcre3-dev libssl-dev zlib1g-dev wget tar

  mkdir -p "$STANDALONE_ROOT/src"
  cd "$STANDALONE_ROOT/src"

  NGINX_VER="${NGINX_RTMP_NGINX_VERSION:-1.24.0}"
  RTMP_VER="${NGINX_RTMP_MODULE_VERSION:-1.2.2}"

  if [ ! -d "nginx-${NGINX_VER}" ]; then
    wget -q "https://nginx.org/download/nginx-${NGINX_VER}.tar.gz"
    tar xf "nginx-${NGINX_VER}.tar.gz"
  fi
  if [ ! -d "nginx-rtmp-module-${RTMP_VER}" ]; then
    wget -q "https://github.com/arut/nginx-rtmp-module/archive/v${RTMP_VER}.tar.gz" -O "nginx-rtmp-module-${RTMP_VER}.tar.gz"
    tar xf "nginx-rtmp-module-${RTMP_VER}.tar.gz"
  fi

  cd "nginx-${NGINX_VER}"
  ./configure \
    --prefix="$STANDALONE_ROOT" \
    --with-http_ssl_module \
    --add-module="../nginx-rtmp-module-${RTMP_VER}" \
    --conf-path="$STANDALONE_CONF" \
    --pid-path="$STANDALONE_ROOT/nginx.pid" \
    --error-log-path="$STANDALONE_ROOT/error.log"
  make -j"$(nproc)"
  make install

  cp "$RTMP_CONF_DST" "$STANDALONE_ROOT/rtmp.conf"
  cat > "$STANDALONE_CONF" <<EOF
# Nexlify standalone RTMP ingest (OBS) — does not replace system nginx
pid $STANDALONE_ROOT/nginx.pid;
error_log $STANDALONE_ROOT/error.log;

events {
    worker_connections 1024;
}

include $STANDALONE_ROOT/rtmp.conf;
EOF

  cat > /etc/systemd/system/nexlify-rtmp.service <<EOF
[Unit]
Description=Nexlify RTMP ingest (OBS → HLS)
After=network.target

[Service]
Type=forking
PIDFile=$STANDALONE_ROOT/nginx.pid
ExecStart=$STANDALONE_ROOT/sbin/nginx -c $STANDALONE_CONF
ExecReload=$STANDALONE_ROOT/sbin/nginx -c $STANDALONE_CONF -s reload
ExecStop=$STANDALONE_ROOT/sbin/nginx -c $STANDALONE_CONF -s quit
Restart=on-failure

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable nexlify-rtmp
  systemctl restart nexlify-rtmp
  echo "Standalone RTMP nginx running on port 1935 (service: nexlify-rtmp)."
}

echo ""
echo "=== 5) Enable RTMP ingest ==="
if [ "$MODE" = "standalone" ]; then
  install_standalone_nginx_rtmp
elif [ "$MODE" = "module" ]; then
  try_apt_rtmp_module
else
  if try_apt_rtmp_module; then
    :
  else
    echo "libnginx-mod-rtmp unavailable — using standalone nginx-rtmp build..."
    install_standalone_nginx_rtmp
  fi
fi

if command -v ufw >/dev/null 2>&1; then
  ufw allow 1935/tcp comment 'Nexlify OBS RTMP' 2>/dev/null || true
fi

echo ""
echo "=== Done ==="
echo "HLS dir:  $HLS_DIR"
echo "Manifest: https://nexlify.live/hls/nexlify.m3u8  (stream key must match filename)"
echo "OBS server: rtmp://nexlify.live/live"
echo "Test after streaming: curl -s https://nexlify.live/hls/nexlify.m3u8 | head"
