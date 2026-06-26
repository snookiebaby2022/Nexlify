#!/bin/bash
# Fix WHMCS Invalid License — set licensed domain + system URL
set -euo pipefail

WHMCS_DOMAIN="${WHMCS_DOMAIN:-billing.nexlify.live}"
SYSTEM_URL="${SYSTEM_URL:-https://billing.nexlify.live/}"

echo "=== WHMCS fix license domain ($WHMCS_DOMAIN) ==="

mysql whmcs <<SQL
UPDATE tblconfiguration SET value='${SYSTEM_URL}' WHERE setting='SystemURL';
UPDATE tblconfiguration SET value='https://${WHMCS_DOMAIN}/' WHERE setting='Domain';
SQL

bash /var/www/nexlify/deploy/ensure-whmcs-permissions.sh 2>/dev/null || true

echo "Updated settings:"
mysql whmcs -e "SELECT setting, value FROM tblconfiguration WHERE setting IN ('Domain','SystemURL','Version');"

echo ""
echo "If still Invalid License:"
echo "  1. https://www.whmcs.com/members/clientarea.php → your license"
echo "  2. Add valid domain: ${WHMCS_DOMAIN}"
echo "  3. Ensure license includes WHMCS 9.x (upgrade from 8.x if needed)"
echo "  4. Admin → System Settings → General → re-enter license key"
