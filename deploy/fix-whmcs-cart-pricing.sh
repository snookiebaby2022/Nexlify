#!/usr/bin/env bash
# Fix WHMCS cart showing blank prices (USD selectable but pricing disabled).
set -euo pipefail

DB="${WHMCS_DB:-whmcs}"
DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== fix-whmcs-cart-pricing ==="

# Re-sync GBP product prices from website catalog
bash "$DIR/sync-whmcs-full.sh"
bash "$DIR/ensure-whmcs-gbp-currency.sh"

# Remove USD currency — cart was offering USD with all prices set to -1 (blank in cart).
mysql "$DB" -e "DELETE FROM tblpricing WHERE type='product' AND currency=1 AND relid BETWEEN 1 AND 16;"
mysql "$DB" -e "DELETE FROM tblcurrencies WHERE id=1 AND code='USD';"

# GBP display: £50.00 not £50.00GBP
mysql "$DB" -e "UPDATE tblcurrencies SET prefix='£', suffix='', format=1 WHERE id=2;"

# Default currency GBP for any clients still on removed USD id
mysql "$DB" -e "UPDATE tblclients SET currency=2 WHERE currency=1;" 2>/dev/null || true

rm -rf /var/www/whmcs/templates_c/* 2>/dev/null || true
rm -rf /var/www/whmcs/storage/cache/* 2>/dev/null || true

echo "--- currencies ---"
mysql "$DB" -e "SELECT id, code, prefix, suffix, \`default\` FROM tblcurrencies;"

echo "--- GBP monthly (sellable) ---"
mysql "$DB" -e "SELECT p.id, p.name, pr.monthly FROM tblproducts p JOIN tblpricing pr ON pr.relid=p.id AND pr.type='product' AND pr.currency=2 WHERE p.hidden=0 AND p.retired=0 AND pr.monthly > 0 ORDER BY p.id;"

echo "fix-whmcs-cart-pricing done."
