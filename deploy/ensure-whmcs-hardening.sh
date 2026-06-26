#!/bin/bash
# Fix WHMCS System Health warnings (paths, soap, nginx, cart template, updater staging)
set -euo pipefail

WHMCS_ROOT="/var/www/whmcs"
PRIVATE_ROOT="/var/www/whmcs_private"
CONF="$WHMCS_ROOT/configuration.php"
CART_CUSTOM="nexlify_cart"

echo "=== ensure-whmcs-hardening ==="

[ -f "$CONF" ] || { echo "WHMCS not installed ($CONF missing)"; exit 1; }

apt-get update -qq
apt-get install -y php8.3-soap 2>/dev/null || apt-get install -y php-soap
systemctl restart php8.3-fpm

mkdir -p \
  "$PRIVATE_ROOT/attachments/projects" \
  "$PRIVATE_ROOT/downloads" \
  "$PRIVATE_ROOT/templates_c" \
  "$PRIVATE_ROOT/crons" \
  "$PRIVATE_ROOT/update_staging"

for d in attachments downloads templates_c crons; do
  if [ -d "$WHMCS_ROOT/$d" ] && [ "$(ls -A "$WHMCS_ROOT/$d" 2>/dev/null)" ]; then
    rsync -a "$WHMCS_ROOT/$d/" "$PRIVATE_ROOT/$d/" 2>/dev/null || true
  fi
done

chown -R www-data:www-data "$PRIVATE_ROOT"
chmod -R 775 "$PRIVATE_ROOT"

# configuration.php — templates + crons outside web root
php <<'PHPCONF'
<?php
$conf = '/var/www/whmcs/configuration.php';
$private = '/var/www/whmcs_private';
include $conf;
$lines = file_get_contents($conf);
$updates = [
  'templates_compiledir' => "'$private/templates_c'",
  'crons_dir' => "'$private/crons'",
];
foreach ($updates as $key => $val) {
  if (preg_match('/^\$' . preg_quote($key, '/') . '\s*=/m', $lines)) {
    $lines = preg_replace('/^\$' . preg_quote($key, '/') . '\s*=.*/m', '$' . $key . ' = ' . $val . ';', $lines);
  } else {
    $lines = rtrim($lines) . "\n\$" . $key . ' = ' . $val . ";\n";
  }
}
file_put_contents($conf, $lines);
PHPCONF

chown www-data:www-data "$CONF"
chmod 400 "$CONF"

# Storage paths (WHMCS 9)
mysql whmcs <<SQL
UPDATE tblstorageconfigurations SET
  name='Local Storage: private downloads',
  settings='{"local_path":"/var/www/whmcs_private/downloads"}'
WHERE id=1;
UPDATE tblstorageconfigurations SET
  name='Local Storage: private attachments',
  settings='{"local_path":"/var/www/whmcs_private/attachments"}'
WHERE id=2;
UPDATE tblstorageconfigurations SET
  name='Local Storage: private projects',
  settings='{"local_path":"/var/www/whmcs_private/attachments/projects"}'
WHERE id=3;
SQL

# Custom cart order form (not default name)
if [ -d "$WHMCS_ROOT/templates/orderforms/standard_cart" ] && [ ! -d "$WHMCS_ROOT/templates/orderforms/$CART_CUSTOM" ]; then
  cp -a "$WHMCS_ROOT/templates/orderforms/standard_cart" "$WHMCS_ROOT/templates/orderforms/$CART_CUSTOM"
  chown -R www-data:www-data "$WHMCS_ROOT/templates/orderforms/$CART_CUSTOM"
fi
mysql whmcs -e "UPDATE tblconfiguration SET value='${CART_CUSTOM}' WHERE setting='OrderFormTemplate';"

# Updater temporary path (if setting exists)
mysql whmcs -e "INSERT INTO tblconfiguration (setting, value) SELECT 'UpdateTempPath', '/var/www/whmcs_private/update_staging' FROM DUAL WHERE NOT EXISTS (SELECT 1 FROM tblconfiguration WHERE setting='UpdateTempPath');" 2>/dev/null || true
mysql whmcs -e "UPDATE tblconfiguration SET value='/var/www/whmcs_private/update_staging' WHERE setting IN ('UpdateTempPath','UpdaterTempPath','TemporaryUpdatePath');" 2>/dev/null || true

# Remove web-accessible default dirs (keep stubs blocked by nginx)
for d in attachments downloads templates_c; do
  rm -rf "$WHMCS_ROOT/$d"
  mkdir -p "$WHMCS_ROOT/$d"
  echo 'Deny from all' > "$WHMCS_ROOT/$d/index.php" 2>/dev/null || true
done
rm -rf "$WHMCS_ROOT/crons"

# Nginx hardening for WHMCS on nginx
NGINX_CONF="/etc/nginx/sites-available/billing.nexlify.live"
if [ -f /var/www/nexlify/deploy/nginx-billing.nexlify.live.conf ]; then
  cp /var/www/nexlify/deploy/nginx-billing.nexlify.live.conf "$NGINX_CONF"
  ln -sf "$NGINX_CONF" /etc/nginx/sites-enabled/billing.nexlify.live
  nginx -t && systemctl reload nginx
fi

# Cron job uses private crons path
( crontab -l 2>/dev/null | grep -v 'whmcs/crons/cron.php' | grep -v 'whmcs_private/crons/cron.php'
  echo "*/5 * * * * /usr/bin/php -q $PRIVATE_ROOT/crons/cron.php >/dev/null 2>&1"
) | crontab -

bash /var/www/nexlify/deploy/ensure-whmcs-permissions.sh 2>/dev/null || true
bash /var/www/nexlify/deploy/ensure-whmcs-return-url.sh 2>/dev/null || true

echo ""
echo "Done:"
echo "  Private data: $PRIVATE_ROOT"
echo "  Cart template: $CART_CUSTOM"
echo "  Updater staging: $PRIVATE_ROOT/update_staging"
echo "  php-soap: installed"
echo ""
echo "Manual (clears remaining warnings):"
echo "  Utilities → Update WHMCS → Configure Update Settings"
echo "  Temporary Path: /var/www/whmcs_private/update_staging"
bash /var/www/nexlify/deploy/ensure-whmcs-opcache-nginx.sh 2>/dev/null || true
echo "  OPcache disabled + nginx hardening: deploy/ensure-whmcs-opcache-nginx.sh"
