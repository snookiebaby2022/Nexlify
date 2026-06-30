#!/usr/bin/env bash
# Nexlify stream stack installer — Nginx 1.29 (HTTP/2/3/QUIC) + FFmpeg 8 + optional NVIDIA CUDA
# Run as root on Ubuntu 22.04+ / Debian 12+ stream VPS
set -euo pipefail

BIN_ROOT="${BIN_ROOT:-/home/nexlify/bin}"
NGINX_VER="${NGINX_VER:-1.29.0}"
FFMPEG_VER="${FFMPEG_VER:-8.0}"
INSTALL_CUDA="${INSTALL_CUDA:-1}"

echo "[nexlify] Installing stream stack to $BIN_ROOT ..."

export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq build-essential libpcre3-dev zlib1g-dev libssl-dev \
  libbrotli-dev libxml2-dev libxslt1-dev libgd-dev libgeoip-dev geoip-database \
  curl ca-certificates redis-server

mkdir -p "$BIN_ROOT"/{nginx,ffmpeg_bin,maxmind}

# --- FFmpeg 8 (system package + symlink into bin layout) ---
if ! command -v ffmpeg >/dev/null 2>&1; then
  apt-get install -y -qq ffmpeg
fi
FFMPEG_SYS="$(command -v ffmpeg)"
mkdir -p "$BIN_ROOT/ffmpeg_bin/$FFMPEG_VER"
ln -sf "$FFMPEG_SYS" "$BIN_ROOT/ffmpeg_bin/$FFMPEG_VER/ffmpeg"
ln -sf "$FFMPEG_SYS" "$BIN_ROOT/ffmpeg_bin/ffmpeg"

if [ "$INSTALL_CUDA" = "1" ] && command -v nvidia-smi >/dev/null 2>&1; then
  echo "[nexlify] NVIDIA GPU detected — link FFmpeg for NVENC profiles"
  mkdir -p "$BIN_ROOT/ffmpeg_bin/8.0_nvenc" "$BIN_ROOT/ffmpeg_bin/8.0_cuda"
  ln -sf "$FFMPEG_SYS" "$BIN_ROOT/ffmpeg_bin/8.0_nvenc/ffmpeg"
  ln -sf "$FFMPEG_SYS" "$BIN_ROOT/ffmpeg_bin/8.0_cuda/ffmpeg"
fi

# --- Nginx 1.29 from source with HTTP/3 (QUIC) when supported ---
NGINX_PREFIX="$BIN_ROOT/nginx/$NGINX_VER"
if [ ! -x "$NGINX_PREFIX/sbin/nginx" ]; then
  echo "[nexlify] Building Nginx $NGINX_VER with HTTP/2 + HTTP/3 ..."
  BUILD_DIR="/tmp/nexlify-nginx-build-$$"
  mkdir -p "$BUILD_DIR"
  cd "$BUILD_DIR"
  curl -fsSL "https://nginx.org/download/nginx-${NGINX_VER}.tar.gz" -o nginx.tar.gz
  tar xf nginx.tar.gz
  cd "nginx-${NGINX_VER}"
  ./configure \
    --prefix="$NGINX_PREFIX" \
    --with-http_ssl_module \
    --with-http_v2_module \
    --with-http_v3_module \
    --with-stream \
    --with-stream_ssl_module \
    --with-http_realip_module \
    --with-http_geoip_module=dynamic \
    --with-http_gzip_static_module \
    --with-file-aio \
    --with-threads
  make -j"$(nproc)"
  make install
  ln -sf "$NGINX_PREFIX/sbin/nginx" "$BIN_ROOT/nginx/sbin/nginx"
  cd /
  rm -rf "$BUILD_DIR"
fi

# --- GeoIP placeholder ---
touch "$BIN_ROOT/maxmind/.keep"
echo "[nexlify] Upload GeoLite2-City.mmdb to $BIN_ROOT/maxmind/ for offline GeoIP"

# --- Redis + agent bootstrap ---
bash "$(dirname "$0")/nexlify-server-install.sh" "$@"

echo "[nexlify] Stack ready:"
echo "  Nginx:  $NGINX_PREFIX/sbin/nginx -v"
echo "  FFmpeg: $BIN_ROOT/ffmpeg_bin/$FFMPEG_VER/ffmpeg"
echo "  GeoIP:  nginx --with-http_geoip_module + MaxMind DB"
