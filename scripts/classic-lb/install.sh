#!/usr/bin/env bash
# Install / upgrade Nexlify classic LB (XUI-style data plane).
# Stack targets (best available on host): PHP 8.4-FPM, nginx mainline, Redis, FFmpeg 8 static.
# Media path: nginx auth_request → shared FFmpeg HLS; MPEG-TS via per-client copy-remux.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
INSTALL_ROOT="${INSTALL_ROOT:-/opt/nexlify-lb}"
ENV_FILE="${NEXLIFY_LB_ENV:-/etc/nexlify-lb/lb.env}"

need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "Run as root" >&2
    exit 1
  fi
}
need_root

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg lsb-release software-properties-common \
  python3 python3-venv xz-utils tar

# --- PHP 8.4 (fallback 8.3) ---
PHP_VER=8.4
if ! php8.4 -v >/dev/null 2>&1; then
  add-apt-repository -y ppa:ondrej/php || true
  apt-get update -y
  apt-get install -y php8.4-fpm php8.4-cli php8.4-curl php8.4-mysql php8.4-redis php8.4-mbstring \
    || { PHP_VER=8.3; apt-get install -y php8.3-fpm php8.3-cli php8.3-curl php8.3-mysql php8.3-redis php8.3-mbstring; }
fi
if php8.4 -v >/dev/null 2>&1; then PHP_VER=8.4; else PHP_VER=8.3; fi
apt-get install -y "php${PHP_VER}-mysql" "php${PHP_VER}-redis" 2>/dev/null || true

# --- Redis (distro; Redis 8 when available) ---
apt-get install -y redis-server || apt-get install -y redis
systemctl enable --now redis-server 2>/dev/null || systemctl enable --now redis 2>/dev/null || true

# --- MariaDB ---
apt-get install -y mariadb-server || apt-get install -y mysql-server

# --- nginx mainline (fallback distro) ---
if ! nginx -v 2>&1 | grep -qE 'nginx/[12]\.(2[7-9]|[3-9])'; then
  curl -fsSL https://nginx.org/keys/nginx_signing.key | gpg --dearmor -o /usr/share/keyrings/nginx-archive-keyring.gpg 2>/dev/null || true
  CODENAME="$(lsb_release -cs 2>/dev/null || echo noble)"
  echo "deb [signed-by=/usr/share/keyrings/nginx-archive-keyring.gpg] http://nginx.org/packages/mainline/ubuntu ${CODENAME} nginx" \
    > /etc/apt/sources.list.d/nginx-mainline.list
  apt-get update -y || true
fi
apt-get -o Dpkg::Options::='--force-confold' -o Dpkg::Options::='--force-confdef' -y install nginx || true

# Disable rtmp early (nginx.org builds have no rtmp module)
chattr -i /etc/nginx/nginx.conf 2>/dev/null || true
if grep -qE 'include /etc/nginx/rtmp\.d' /etc/nginx/nginx.conf 2>/dev/null; then
  sed -i 's|^\s*include /etc/nginx/rtmp\.d/\*\.conf;|# include /etc/nginx/rtmp.d/*.conf; # disabled: no rtmp module|' /etc/nginx/nginx.conf || true
fi
if [ -f /etc/nginx/rtmp.d/nexlify-rtmp.conf ]; then
  chattr -i /etc/nginx/rtmp.d/nexlify-rtmp.conf 2>/dev/null || true
  : > /etc/nginx/rtmp.d/nexlify-rtmp.conf || true
fi
rm -f /etc/nginx/conf.d/nexlify-smoke-hls.conf 2>/dev/null || true

# --- FFmpeg 8 static (BtbN / johnvansickle style) ---
install_ffmpeg8() {
  local dest=/usr/local/bin/ffmpeg
  if [ -x "$dest" ] && "$dest" -version 2>/dev/null | head -1 | grep -qE 'ffmpeg version ([89]|[1-9][0-9])'; then
    echo "FFmpeg OK: $($dest -version 2>&1 | head -1)"
    return 0
  fi
  local tmp
  tmp="$(mktemp -d)"
  # Prefer BtbN linux64 gpl build (FFmpeg 8.x when published)
  local url
  url="$(curl -fsSL https://api.github.com/repos/BtbN/FFmpeg-Builds/releases/latest \
    | grep -oE 'https://[^"]+ffmpeg-master-latest-linux64-gpl\.tar\.xz' | head -1 || true)"
  if [ -z "$url" ]; then
    url="https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz"
  fi
  echo "Downloading FFmpeg: $url"
  if curl -fsSL "$url" -o "$tmp/ffmpeg.tar.xz"; then
    tar -xJf "$tmp/ffmpeg.tar.xz" -C "$tmp"
    local bin
    bin="$(find "$tmp" -type f -name ffmpeg | head -1)"
    if [ -n "$bin" ] && [ -x "$bin" ]; then
      install -m 0755 "$bin" /usr/local/bin/ffmpeg
      local ffprobe
      ffprobe="$(find "$tmp" -type f -name ffprobe | head -1 || true)"
      [ -n "$ffprobe" ] && install -m 0755 "$ffprobe" /usr/local/bin/ffprobe || true
      echo "Installed $($dest -version 2>&1 | head -1)"
    fi
  fi
  rm -rf "$tmp"
  apt-get install -y ffmpeg || true
}
install_ffmpeg8

# --- Layout ---
mkdir -p "$INSTALL_ROOT/php" /etc/nexlify-lb /var/lib/nexlify-lb/{hls,pids,logs,viewers} /var/www/nexlify-lb
cp -a "$ROOT/php/." "$INSTALL_ROOT/php/"
rm -f "$INSTALL_ROOT/mpegts-fanout.py"
chmod 755 "$INSTALL_ROOT" "$INSTALL_ROOT/php"
chmod 644 "$INSTALL_ROOT/php/"*.php
chmod +x "$ROOT/ffmpeg-idle-reaper.sh" "$ROOT/stop-node-edge.sh" "$ROOT/install.sh" "$ROOT/smoke.sh" 2>/dev/null || true
chown -R www-data:www-data /var/lib/nexlify-lb

if [ ! -f "$ENV_FILE" ]; then
  cp "$ROOT/env.example" "$ENV_FILE"
  LB_PASS="$(openssl rand -hex 12)"
  sed -i "s/change-me/${LB_PASS}/" "$ENV_FILE"
  if [ -n "${PANEL_URL:-}" ]; then sed -i "s|^PANEL_URL=.*|PANEL_URL=${PANEL_URL}|" "$ENV_FILE"; fi
  if [ -n "${AGENT_TOKEN:-}" ]; then sed -i "s|^AGENT_TOKEN=.*|AGENT_TOKEN=${AGENT_TOKEN}|" "$ENV_FILE"; fi
  if [ -n "${LB_SERVER_ID:-}" ]; then sed -i "s|^LB_SERVER_ID=.*|LB_SERVER_ID=${LB_SERVER_ID}|" "$ENV_FILE"; fi
fi

FFMPEG_BIN="$(command -v /usr/local/bin/ffmpeg || command -v ffmpeg || echo /usr/bin/ffmpeg)"
sed -i "s|^FFMPEG_BIN=.*|FFMPEG_BIN=${FFMPEG_BIN}|" "$ENV_FILE" || echo "FFMPEG_BIN=${FFMPEG_BIN}" >> "$ENV_FILE"
grep -q '^AUTH_CACHE_SECS=' "$ENV_FILE" || echo 'AUTH_CACHE_SECS=25' >> "$ENV_FILE"
sed -i '/^FANOUT_/d' "$ENV_FILE" 2>/dev/null || true

chgrp www-data "$ENV_FILE" 2>/dev/null || true
chmod 640 "$ENV_FILE"

# shellcheck disable=SC1090
set -a && . "$ENV_FILE" && set +a
MYSQL_PASSWORD="${MYSQL_PASSWORD:-nexlify}"
MYSQL_USER="${MYSQL_USER:-nexlify_lb}"
MYSQL_DATABASE="${MYSQL_DATABASE:-nexlify_lb}"

mysql_root() {
  if mysql -u root -e "SELECT 1" >/dev/null 2>&1; then mysql -u root "$@"
  elif sudo mysql -u root -e "SELECT 1" >/dev/null 2>&1; then sudo mysql -u root "$@"
  elif mariadb -u root -e "SELECT 1" >/dev/null 2>&1; then mariadb -u root "$@"
  else sudo mariadb -u root "$@"
  fi
}

mysql_root -e "CREATE DATABASE IF NOT EXISTS \`${MYSQL_DATABASE}\`;" || true
mysql_root -e "CREATE USER IF NOT EXISTS '${MYSQL_USER}'@'localhost' IDENTIFIED BY '${MYSQL_PASSWORD}';" 2>/dev/null || \
  mysql_root -e "CREATE USER '${MYSQL_USER}'@'localhost' IDENTIFIED BY '${MYSQL_PASSWORD}';" 2>/dev/null || true
mysql_root -e "ALTER USER '${MYSQL_USER}'@'localhost' IDENTIFIED BY '${MYSQL_PASSWORD}';" 2>/dev/null || true
mysql_root -e "GRANT ALL ON \`${MYSQL_DATABASE}\`.* TO '${MYSQL_USER}'@'localhost'; FLUSH PRIVILEGES;"
mysql_root "${MYSQL_DATABASE}" < "$ROOT/schema.sql" || \
  mysql -u "${MYSQL_USER}" -p"${MYSQL_PASSWORD}" "${MYSQL_DATABASE}" < "$ROOT/schema.sql"

# --- PHP-FPM: tune default www pool (do not add a second pool on the same sock) ---
SOCK="/run/php/php${PHP_VER}-fpm.sock"
POOL_DIR="/etc/php/${PHP_VER}/fpm/pool.d"
mkdir -p "$POOL_DIR"
rm -f "${POOL_DIR}/nexlify-lb.conf"
if [ -f "${POOL_DIR}/www.conf" ]; then
  sed -i 's/^pm = .*/pm = dynamic/' "${POOL_DIR}/www.conf" || true
  sed -i 's/^pm.max_children = .*/pm.max_children = 256/' "${POOL_DIR}/www.conf" || true
  sed -i 's/^pm.start_servers = .*/pm.start_servers = 16/' "${POOL_DIR}/www.conf" || true
  sed -i 's/^pm.min_spare_servers = .*/pm.min_spare_servers = 8/' "${POOL_DIR}/www.conf" || true
  sed -i 's/^pm.max_spare_servers = .*/pm.max_spare_servers = 32/' "${POOL_DIR}/www.conf" || true
  sed -i 's/^;*pm.max_requests = .*/pm.max_requests = 2000/' "${POOL_DIR}/www.conf" || true
fi
systemctl enable --now "php${PHP_VER}-fpm"
systemctl restart "php${PHP_VER}-fpm"
if [ ! -S "$SOCK" ]; then
  SOCK="$(ls /run/php/php*-fpm.sock 2>/dev/null | head -1 || true)"
fi

# --- nginx site + tuning ---
LISTEN_PORT="${LISTEN_HTTP:-8090}"
sed -e "s|unix:/run/php/php8.4-fpm.sock|unix:${SOCK}|g" \
    -e "s|unix:/run/php/php8.3-fpm.sock|unix:${SOCK}|g" \
    "$ROOT/nginx-tuning.conf" > /etc/nginx/conf.d/00-nexlify-lb-tuning.conf

CONF_OUT=/etc/nginx/conf.d/nexlify-classic-lb.conf
HLS_STATIC_PORT="${HLS_STATIC_PORT:-8092}"
sed -e "s|__LISTEN_PORT__|${LISTEN_PORT}|g" \
    -e "s|__HLS_STATIC_PORT__|${HLS_STATIC_PORT}|g" \
    "$ROOT/nginx-lb.conf" > "$CONF_OUT"
# Avoid duplicate server blocks if an older sites-enabled copy exists
rm -f /etc/nginx/sites-enabled/nexlify-classic-lb.conf \
      /etc/nginx/sites-available/nexlify-classic-lb.conf 2>/dev/null || true

# PHP scripts must be traversable by www-data (FPM "Primary script unknown" otherwise)
chmod 755 /opt/nexlify-lb /opt/nexlify-lb/php
chown -R root:www-data /opt/nexlify-lb/php
chmod 644 /opt/nexlify-lb/php/*.php
chmod 640 "$ENV_FILE"
chgrp www-data "$ENV_FILE" 2>/dev/null || true

# nginx.org packages ship without the rtmp module — disable leftover includes
if grep -qE '^\s*include /etc/nginx/rtmp\.d' /etc/nginx/nginx.conf 2>/dev/null; then
  sed -i 's|^\s*include /etc/nginx/rtmp\.d/\*\.conf;|# include /etc/nginx/rtmp.d/*.conf; # disabled: no rtmp module|' /etc/nginx/nginx.conf || true
fi
if [ -f /etc/nginx/rtmp.d/nexlify-rtmp.conf ]; then
  mv /etc/nginx/rtmp.d/nexlify-rtmp.conf /etc/nginx/rtmp.d/nexlify-rtmp.conf.disabled || true
fi

# Raise worker_connections if still low
if grep -q 'worker_connections' /etc/nginx/nginx.conf; then
  sed -i 's/worker_connections\s\+[0-9]\+/worker_connections 65535/' /etc/nginx/nginx.conf || true
fi
if grep -q 'worker_rlimit_nofile' /etc/nginx/nginx.conf; then
  sed -i 's/worker_rlimit_nofile\s\+[0-9]\+/worker_rlimit_nofile 1048576/' /etc/nginx/nginx.conf || true
elif grep -q '^worker_processes' /etc/nginx/nginx.conf; then
  sed -i '/^worker_processes/a worker_rlimit_nofile 1048576;' /etc/nginx/nginx.conf || true
fi

# --- sysctl + limits ---
cp "$ROOT/sysctl-lb.conf" /etc/sysctl.d/99-nexlify-lb.conf
sysctl --system >/dev/null 2>&1 || true
cp "$ROOT/limits-lb.conf" /etc/security/limits.d/99-nexlify-lb.conf

# --- retire MPEG-TS fan-out if previously installed ---
systemctl disable --now nexlify-mpegts-fanout 2>/dev/null || true
rm -f /etc/systemd/system/nexlify-mpegts-fanout.service
systemctl daemon-reload || true
rm -f /opt/nexlify-lb/mpegts-fanout.py

bash "$ROOT/stop-node-edge.sh" || true

nginx -t
systemctl enable --now nginx
systemctl reload nginx || systemctl restart nginx

# Idle reaper
echo "* * * * * root NEXLIFY_LB_ENV=${ENV_FILE} bash ${ROOT}/ffmpeg-idle-reaper.sh" \
  > /etc/cron.d/nexlify-classic-lb-reaper
chmod 644 /etc/cron.d/nexlify-classic-lb-reaper

# Disable conflicting apache if present
systemctl disable --now apache2 2>/dev/null || true

sleep 1
echo "--- health ---"
curl -fsS "http://127.0.0.1:${LISTEN_PORT}/lb/health" || true
echo
echo "CLASSIC_LB_INSTALLED php=${PHP_VER} ffmpeg=${FFMPEG_BIN} listen=${LISTEN_PORT} mpegts=php-remux"
echo "Scale: add more LB StreamServers horizontally; use CONNECTION_HANDLER=redis above ~2k concurrent/box"
