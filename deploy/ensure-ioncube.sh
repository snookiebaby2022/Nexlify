#!/bin/bash
# ionCube Loader — required for WHMCS (billing.nexlify.live)
set -euo pipefail

PHP_VER="${PHP_VER:-8.3}"
EXT_DIR="/usr/lib/php/20230831"
MODS="/etc/php/${PHP_VER}/mods-available/ioncube.ini"

echo "=== ensure-ioncube (PHP ${PHP_VER}) ==="

if php -m 2>/dev/null | grep -qi ioncube; then
  echo "ionCube already loaded"
  exit 0
fi

apt-get update -qq
apt-get install -y php${PHP_VER}-fpm php${PHP_VER}-cli curl ca-certificates

cd /tmp
curl -fsSL -o ioncube_loaders.tar.gz \
  https://downloads.ioncube.com/loader_downloads/ioncube_loaders_lin_x86-64.tar.gz
tar -xzf ioncube_loaders.tar.gz

LOADER="ioncube/ioncube_loader_lin_${PHP_VER}.so"
if [ ! -f "$LOADER" ]; then
  echo "FAIL: no loader for PHP ${PHP_VER} in ionCube package"
  ls ioncube/
  exit 1
fi

cp "$LOADER" "${EXT_DIR}/ioncube_loader_lin_${PHP_VER}.so"
echo "zend_extension=ioncube_loader_lin_${PHP_VER}.so" > "$MODS"
ln -sf "$MODS" "/etc/php/${PHP_VER}/fpm/conf.d/00-ioncube.ini"
ln -sf "$MODS" "/etc/php/${PHP_VER}/cli/conf.d/00-ioncube.ini"

systemctl restart "php${PHP_VER}-fpm"
php -m | grep -i ioncube
echo "ensure-ioncube done."
