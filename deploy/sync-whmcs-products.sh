#!/bin/bash
# Sync Nexlify WHMCS products 1-13: GBP pricing, groups, module settings.
set -euo pipefail

SQL="/tmp/sync-whmcs-products.sql"
DB="whmcs"

echo "=== sync-whmcs-products ==="

# Inspect before
mysql "$DB" -N -e "SELECT id,name,servertype,gid,hidden FROM tblproducts ORDER BY id;"

mysql "$DB" < "$SQL" || {
  echo "SQL file failed — applying via upsert script..."
  bash /tmp/sync-whmcs-pricing-upsert.sh
}

# Ensure GBP pricing rows exist (update or insert)
upsert_price() {
  local relid=$1 monthly=$2 quarterly=$3 annually=$4
  local existing
  existing=$(mysql "$DB" -N -e "SELECT id FROM tblpricing WHERE type='product' AND currency=2 AND relid=$relid LIMIT 1;")
  if [ -n "$existing" ]; then
    mysql "$DB" -e "UPDATE tblpricing SET monthly=$monthly, quarterly=$quarterly, semiannually=-1, annually=$annually WHERE id=$existing;"
  else
    mysql "$DB" -e "INSERT INTO tblpricing (type,currency,relid,msetupfee,qsetupfee,ssetupfee,asetupfee,bsetupfee,tsetupfee,monthly,quarterly,semiannually,annually,biennially,triennially) VALUES ('product',2,$relid,0,0,0,0,0,0,$monthly,$quarterly,-1,$annually,-1,-1);"
  fi
}

upsert_price 1 50.00 135.00 500.00
upsert_price 2 150.00 405.00 1500.00
upsert_price 3 350.00 945.00 3500.00
upsert_price 4 20.00 54.00 200.00
upsert_price 5 18.00 48.60 180.00
upsert_price 6 15.00 40.50 150.00
upsert_price 7 12.00 32.40 120.00
upsert_price 8 10.00 27.00 100.00
upsert_price 9 10.00 27.00 100.00
upsert_price 10 8.00 21.60 80.00
upsert_price 11 10.00 27.00 100.00
upsert_price 12 8.00 21.60 80.00
upsert_price 13 15.00 40.50 150.00

# GBP-only billing (USD removed — was selectable in cart with no prices)
mysql "$DB" -e "DELETE FROM tblpricing WHERE type='product' AND currency=1 AND relid BETWEEN 1 AND 16;" 2>/dev/null || true
mysql "$DB" -e "DELETE FROM tblcurrencies WHERE id=1 AND code='USD';" 2>/dev/null || true
mysql "$DB" -e "UPDATE tblcurrencies SET prefix='£', suffix='', format=1 WHERE id=2;" 2>/dev/null || true

rm -rf /var/www/whmcs/templates_c/* 2>/dev/null || true

echo "--- GBP pricing after sync ---"
mysql "$DB" -e "SELECT p.id,p.name,pr.monthly,pr.quarterly,pr.annually FROM tblproducts p JOIN tblpricing pr ON pr.relid=p.id AND pr.type='product' AND pr.currency=2 WHERE p.id BETWEEN 1 AND 13 ORDER BY p.id;"

echo "sync-whmcs-products done."
