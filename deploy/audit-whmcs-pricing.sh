#!/usr/bin/env bash
set -euo pipefail
DB="${WHMCS_DB:-whmcs}"

echo "=== currencies ==="
mysql "$DB" -e "SELECT id, code, \`default\`, rate FROM tblcurrencies;"

echo "=== all product pricing 1-16 ==="
mysql "$DB" -e "SELECT id, type, currency, relid, monthly, quarterly, annually FROM tblpricing WHERE type='product' AND relid BETWEEN 1 AND 16 ORDER BY relid, currency;"

echo "=== duplicate GBP rows ==="
mysql "$DB" -e "SELECT relid, COUNT(*) AS c FROM tblpricing WHERE type='product' AND currency=2 AND relid BETWEEN 1 AND 16 GROUP BY relid HAVING c > 1;"

echo "=== currency config ==="
mysql "$DB" -e "SELECT setting, value FROM tblconfiguration WHERE setting LIKE '%urrency%';"

echo "=== products paytype/billing ==="
mysql "$DB" -e "SELECT id, name, paytype, hidden, retired FROM tblproducts WHERE id BETWEEN 1 AND 16 ORDER BY id;"
