#!/usr/bin/env bash
set -euo pipefail
DB="${WHMCS_DB:-whmcs}"
mysql "$DB" -e "SELECT setting, value FROM tblconfiguration WHERE setting='OrderFormTemplate' OR setting='Template';"

echo "=== diff viewcart.tpl (first 80 lines of diff stat) ==="
diff -u /var/www/whmcs/templates/orderforms/standard_cart/viewcart.tpl \
        /var/www/whmcs/templates/orderforms/nexlify_cart/viewcart.tpl | head -80 || true

echo "=== diff base.js recalctotals section ==="
diff -u /var/www/whmcs/templates/orderforms/standard_cart/js/base.js \
        /var/www/whmcs/templates/orderforms/nexlify_cart/js/base.js | head -60 || true
