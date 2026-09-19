#!/usr/bin/env bash
# Apply the 50k-subscriber capacity profile on an already-installed Main or LB.
#
#   sudo bash scripts/tune-capacity-50k.sh
#   sudo NEXLIFY_CAPACITY_ROLE=lb bash scripts/tune-capacity-50k.sh
#
# Does not restart Postgres (drop-in only). Reloads nginx + php-fpm.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
# shellcheck disable=SC1091
. "$ROOT/scripts/lib/nexlify-capacity.sh"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run as root" >&2
  exit 1
fi

nexlify_capacity_compute "$(nexlify_capacity_detect_role)"
nexlify_capacity_summary
nexlify_capacity_sysctl
nexlify_capacity_limits
nexlify_capacity_nginx_events /etc/nginx/nginx.conf || true
nexlify_capacity_redis || true
nexlify_capacity_postgres_hint || true
nexlify_capacity_shrink_www || true

PHP_VER=8.4
php8.4 -v >/dev/null 2>&1 || PHP_VER=8.3
POOL_DIR="/etc/php/${PHP_VER}/fpm/pool.d"
LB_TEMPLATES="$ROOT/scripts/classic-lb"
PANEL_TEMPLATES="$ROOT/scripts/panel-php"

if [ -f "${POOL_DIR}/nexlify-lb-auth.conf" ] && [ -f "$LB_TEMPLATES/php-fpm-pool-auth.conf" ]; then
  sed -e "s|php8.4-fpm-lb-auth|php${PHP_VER}-fpm-lb-auth|g" \
      -e "s|php8.4-fpm-lb-auth-slow|php${PHP_VER}-fpm-lb-auth-slow|g" \
      "$LB_TEMPLATES/php-fpm-pool-auth.conf" | nexlify_capacity_sub_pool auth \
      > "${POOL_DIR}/nexlify-lb-auth.conf"
  sed -e "s|php8.4-fpm-lb-media|php${PHP_VER}-fpm-lb-media|g" \
      -e "s|php8.4-fpm-lb-media-slow|php${PHP_VER}-fpm-lb-media-slow|g" \
      "$LB_TEMPLATES/php-fpm-pool-media.conf" | nexlify_capacity_sub_pool media \
      > "${POOL_DIR}/nexlify-lb-media.conf"
  echo "rewrote LB FPM pools"
fi

if [ -f "${POOL_DIR}/nexlify-panel.conf" ] && [ -f "$PANEL_TEMPLATES/php-fpm-pool.conf" ]; then
  sed -e "s|{POOL_NAME}|nexlify-panel|g" \
      -e "s|{PHP_SOCK}|php${PHP_VER}-fpm-panel.sock|g" \
      -e "s|{PHP_VER}|${PHP_VER}|g" \
      "$PANEL_TEMPLATES/php-fpm-pool.conf" | nexlify_capacity_sub_pool panel \
      > "${POOL_DIR}/nexlify-panel.conf"
  if ! grep -q 'NEXLIFY_PANEL_ENV' "${POOL_DIR}/nexlify-panel.conf"; then
    echo "env[NEXLIFY_PANEL_ENV] = ${NEXLIFY_PANEL_ENV:-/etc/nexlify-panel/panel.env}" >> "${POOL_DIR}/nexlify-panel.conf"
  fi
  echo "rewrote panel FPM pool"
fi

if [ -f /etc/nexlify-lb/lb.env ]; then
  if grep -q '^AUTH_READY_WAIT_MS=' /etc/nexlify-lb/lb.env; then
    sed -i 's/^AUTH_READY_WAIT_MS=.*/AUTH_READY_WAIT_MS=4000/' /etc/nexlify-lb/lb.env
  else
    echo 'AUTH_READY_WAIT_MS=4000' >> /etc/nexlify-lb/lb.env
  fi
  if ! grep -q '^CONNECTION_HANDLER=redis' /etc/nexlify-lb/lb.env; then
    if [ "${NEXLIFY_CAP_CONN_HANDLER}" = "redis" ]; then
      sed -i 's/^CONNECTION_HANDLER=.*/CONNECTION_HANDLER=redis/' /etc/nexlify-lb/lb.env || \
        echo 'CONNECTION_HANDLER=redis' >> /etc/nexlify-lb/lb.env
    fi
  fi
fi

nginx -t
systemctl reload nginx 2>/dev/null || systemctl restart nginx
systemctl reload "php${PHP_VER}-fpm" 2>/dev/null || systemctl restart "php${PHP_VER}-fpm"
echo "TUNE_CAPACITY_50K_OK role=${NEXLIFY_CAP_ROLE} media=${NEXLIFY_CAP_MEDIA_MAX} panel=${NEXLIFY_CAP_PANEL_MAX}"
