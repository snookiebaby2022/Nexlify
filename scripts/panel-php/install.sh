#!/usr/bin/env bash
# Install Nexlify PHP panel (Xtream control plane) — Phase 1.
# PHP-FPM + Redis + PDO Postgres; nginx snippet for Main cutover.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
INSTALL_ROOT="${INSTALL_ROOT:-/opt/nexlify-panel-php}"
ENV_FILE="${NEXLIFY_PANEL_ENV:-/etc/nexlify-panel/panel.env}"
NEXT_ENV="${NEXT_ENV:-/opt/nexlify-panel/.env}"

need_root() {
  if [ "$(id -u)" -ne 0 ]; then
    echo "Run as root" >&2
    exit 1
  fi
}
need_root

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl ca-certificates gnupg lsb-release software-properties-common

# --- PHP 8.4 (fallback 8.3) + pgsql + redis ---
PHP_VER=8.4
if ! php8.4 -v >/dev/null 2>&1; then
  add-apt-repository -y ppa:ondrej/php || true
  apt-get update -y
fi
if php8.4 -v >/dev/null 2>&1 || apt-get install -y php8.4-fpm php8.4-cli php8.4-pgsql php8.4-redis php8.4-mbstring php8.4-curl 2>/dev/null; then
  PHP_VER=8.4
else
  PHP_VER=8.3
  apt-get install -y php8.3-fpm php8.3-cli php8.3-pgsql php8.3-redis php8.3-mbstring php8.3-curl
fi
apt-get install -y "php${PHP_VER}-pgsql" "php${PHP_VER}-redis" "php${PHP_VER}-mbstring" "php${PHP_VER}-curl" 2>/dev/null || true

# --- Redis ---
apt-get install -y redis-server || apt-get install -y redis
systemctl enable --now redis-server 2>/dev/null || systemctl enable --now redis 2>/dev/null || true

# --- Layout ---
mkdir -p "$INSTALL_ROOT/php" /etc/nexlify-panel /var/www/nexlify-panel-php
cp -a "$ROOT/php/." "$INSTALL_ROOT/php/"
# Public aliases under docroot (nginx root) — every *.php that is a public endpoint
mkdir -p /var/www/nexlify-panel-php
for f in player_api.php panel_api.php get.php playlist.php xmltv.php epg.php health.php \
  live-auth.php lib.php proxy_next_lib.php enigma2.php probe.php subtitle.php thumb.php \
  api.php xplugin.php progress.php constants.php init.php rtmp.php; do
  if [ -f "$INSTALL_ROOT/php/$f" ]; then
    ln -sfn "$INSTALL_ROOT/php/$f" "/var/www/nexlify-panel-php/$f"
  fi
done
chmod 755 "$INSTALL_ROOT" "$INSTALL_ROOT/php" /var/www/nexlify-panel-php
chmod 644 "$INSTALL_ROOT/php/"*.php
chown -R root:www-data "$INSTALL_ROOT/php"

# --- Env ---
if [ ! -f "$ENV_FILE" ]; then
  cp "$ROOT/env.example" "$ENV_FILE"
fi
# Seed secrets from Next panel .env when present
if [ -f "$NEXT_ENV" ]; then
  for key in DATABASE_URL PANEL_INTERNAL_SECRET AGENT_TOKEN STREAM_HTTP_PORT STREAM_HTTPS_PORT REDIS_URL; do
    val="$(grep -E "^${key}=" "$NEXT_ENV" 2>/dev/null | head -1 | cut -d= -f2- | sed -e 's/^["'\'' ]*//' -e 's/["'\'' ]*$//' || true)"
    if [ -n "$val" ]; then
      if grep -qE "^${key}=" "$ENV_FILE"; then
        cur="$(grep -E "^${key}=" "$ENV_FILE" | head -1 | cut -d= -f2-)"
        # Replace empty / placeholder values (CHANGE_ME may appear mid-URL)
        if [ -z "$cur" ] || echo "$cur" | grep -qiE 'CHANGE_ME|change-me'; then
          # Escape sed replacement metacharacters
          esc="$(printf '%s' "$val" | sed -e 's/[&|\\]/\\&/g')"
          sed -i "s|^${key}=.*|${key}=${esc}|" "$ENV_FILE"
        fi
      else
        echo "${key}=${val}" >> "$ENV_FILE"
      fi
    fi
  done
fi
# Prefer dedicated redis DB 3 if unset
grep -q '^REDIS_URL=' "$ENV_FILE" || echo 'REDIS_URL=redis://127.0.0.1:6379/3' >> "$ENV_FILE"
chgrp www-data "$ENV_FILE" 2>/dev/null || true
chmod 640 "$ENV_FILE"

# --- 50k capacity + PHP-FPM pool ---
CAP_LIB="$ROOT/../lib/nexlify-capacity.sh"
SOCK="/run/php/php${PHP_VER}-fpm.sock"
POOL_DIR="/etc/php/${PHP_VER}/fpm/pool.d"
mkdir -p "$POOL_DIR"
if [ -f "$CAP_LIB" ]; then
  # shellcheck disable=SC1090
  . "$CAP_LIB"
  if [ -z "${NEXLIFY_CAPACITY_ROLE:-}" ]; then
    if [ -d /opt/nexlify-lb ] || [ -f /etc/nexlify-lb/lb.env ]; then
      export NEXLIFY_CAPACITY_ROLE=colocated
    else
      export NEXLIFY_CAPACITY_ROLE=panel
    fi
  fi
  nexlify_capacity_compute "$NEXLIFY_CAPACITY_ROLE"
  nexlify_capacity_summary
  nexlify_capacity_nginx_events /etc/nginx/nginx.conf || true
  nexlify_capacity_sysctl /etc/sysctl.d/99-nexlify-50k.conf || true
  nexlify_capacity_limits /etc/security/limits.d/99-nexlify-50k.conf || true
  nexlify_capacity_redis || true
  nexlify_capacity_postgres_hint || true
  sed -e "s|{POOL_NAME}|nexlify-panel|g" \
      -e "s|{PHP_SOCK}|php${PHP_VER}-fpm-panel.sock|g" \
      -e "s|{PHP_VER}|${PHP_VER}|g" \
      "$ROOT/php-fpm-pool.conf" | nexlify_capacity_sub_pool panel \
      > "${POOL_DIR}/nexlify-panel.conf"
  nexlify_capacity_shrink_www || true
else
  echo "WARN: $CAP_LIB missing — using 50k floor defaults" >&2
  sed -e "s|{POOL_NAME}|nexlify-panel|g" \
      -e "s|{PHP_SOCK}|php${PHP_VER}-fpm-panel.sock|g" \
      -e "s|{PHP_VER}|${PHP_VER}|g" \
      -e "s|__PM_MAX_CHILDREN__|160|g" -e "s|__PM_START_SERVERS__|8|g" \
      -e "s|__PM_MIN_SPARE__|4|g" -e "s|__PM_MAX_SPARE__|16|g" \
      "$ROOT/php-fpm-pool.conf" > "${POOL_DIR}/nexlify-panel.conf"
fi
# Ensure env is visible
if ! grep -q 'NEXLIFY_PANEL_ENV' "${POOL_DIR}/nexlify-panel.conf"; then
  echo "env[NEXLIFY_PANEL_ENV] = ${ENV_FILE}" >> "${POOL_DIR}/nexlify-panel.conf"
fi
systemctl enable --now "php${PHP_VER}-fpm"
systemctl restart "php${PHP_VER}-fpm"
PANEL_SOCK="/run/php/php${PHP_VER}-fpm-panel.sock"
if [ ! -S "$PANEL_SOCK" ]; then
  # Fallback to www sock if pool failed
  PANEL_SOCK="$(ls /run/php/php*-fpm.sock 2>/dev/null | head -1 || true)"
fi

# --- nginx include (not enabled until cutover) ---
mkdir -p /etc/nginx/snippets
sed -e "s|unix:/run/php/php8.4-fpm-panel.sock|unix:${PANEL_SOCK}|g" \
    "$ROOT/nginx-panel-xtream.conf" > /etc/nginx/snippets/nexlify-panel-php-xtream.conf

echo "PANEL_PHP_INSTALLED php=${PHP_VER} root=${INSTALL_ROOT} env=${ENV_FILE} sock=${PANEL_SOCK}"
echo "Next: bash ${ROOT}/cutover-main-nginx.sh"
