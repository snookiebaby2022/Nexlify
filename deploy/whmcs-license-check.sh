#!/bin/bash
set -euo pipefail
echo "=== WHMCS license check ==="
mysql whmcs -e "SELECT setting, value FROM tblconfiguration WHERE setting IN ('License','SystemURL','Domain','Version');" 2>/dev/null || echo "DB query failed"
PUBLIC_IP=$(curl -s --max-time 5 https://api.ipify.org 2>/dev/null || curl -s --max-time 5 ifconfig.me 2>/dev/null || echo unknown)
echo "Server public IP: $PUBLIC_IP"
if grep -q '^\$license' /var/www/whmcs/configuration.php 2>/dev/null; then
  echo "configuration.php: has \$license line"
else
  echo "configuration.php: NO \$license line (may use DB only)"
fi
ls -la /var/www/whmcs/vendor/whmcs/whmcs-foundation/lib/License.php
php -m 2>/dev/null | grep -i ioncube || echo "ionCube MISSING"
