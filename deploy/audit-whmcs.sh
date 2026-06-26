#!/usr/bin/env bash
set -euo pipefail
DB="${1:-whmcs}"
echo "=== WHMCS products 1-16 ==="
mysql -N "$DB" -e "SELECT id, name, slug, hidden, retired, gid, servertype FROM tblproducts WHERE id BETWEEN 1 AND 16 ORDER BY id;"
echo "=== GBP pricing ==="
mysql -N "$DB" -e "SELECT relid, monthly FROM tblpricing WHERE type='product' AND currency=2 AND relid BETWEEN 1 AND 16 ORDER BY relid;"
echo "=== Product groups ==="
mysql -N "$DB" -e "SELECT id, name, slug FROM tblproductgroups ORDER BY id;"
