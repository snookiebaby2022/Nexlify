#!/usr/bin/env bash
# Sync WHMCS products 1–16 with nexlify.live (names, slugs, GBP pricing, store URLs).
set -euo pipefail

DB="${WHMCS_DB:-whmcs}"
DIR="$(cd "$(dirname "$0")" && pwd)"
SQL="$DIR/sync-whmcs-full.sql"

echo "=== sync-whmcs-full ==="

mysql "$DB" < "$SQL"

# Remove duplicate GBP product pricing rows (keep lowest id per relid)
mysql "$DB" -e "
DELETE p1 FROM tblpricing p1
INNER JOIN tblpricing p2
  ON p1.type='product' AND p2.type='product'
  AND p1.currency=2 AND p2.currency=2
  AND p1.relid=p2.relid AND p1.id>p2.id
WHERE p1.relid BETWEEN 1 AND 16;
"

upsert_price() {
  local relid=$1 monthly=$2 quarterly=$3 annually=$4
  local existing
  existing=$(mysql "$DB" -N -e "SELECT id FROM tblpricing WHERE type='product' AND currency=2 AND relid=$relid LIMIT 1;")
  if [ -n "$existing" ]; then
    mysql "$DB" -e "UPDATE tblpricing SET monthly=$monthly, quarterly=$quarterly, semiannually=-1, annually=$annually, msetupfee=0, qsetupfee=0, ssetupfee=0, asetupfee=0, bsetupfee=0, tsetupfee=0 WHERE id=$existing;"
  else
    mysql "$DB" -e "INSERT INTO tblpricing (type,currency,relid,msetupfee,qsetupfee,ssetupfee,asetupfee,bsetupfee,tsetupfee,monthly,quarterly,semiannually,annually,biennially,triennially) VALUES ('product',2,$relid,0,0,0,0,0,0,$monthly,$quarterly,-1,$annually,-1,-1);"
  fi
}

# Plans
upsert_price 1 50.00 135.00 500.00
upsert_price 2 150.00 405.00 1500.00
upsert_price 3 350.00 945.00 3500.00
# Plugins
upsert_price 4 20.00 54.00 200.00
upsert_price 5 18.00 48.60 180.00
upsert_price 6 15.00 40.50 150.00
upsert_price 7 12.00 32.40 120.00
upsert_price 8 10.00 27.00 100.00
upsert_price 9 10.00 27.00 100.00
upsert_price 10 8.00 21.60 80.00
upsert_price 11 10.00 27.00 100.00
upsert_price 12 8.00 21.60 80.00
# Product 13 (Proxy Plugins) hidden — no pricing sync
# Bundles
upsert_price 14 45.00 121.50 450.00
upsert_price 15 35.00 94.50 350.00
upsert_price 16 99.00 267.30 990.00

# GBP-only billing: drop USD rows so the cart cannot switch to an unpriced currency
mysql "$DB" -e "DELETE FROM tblpricing WHERE type='product' AND currency=1 AND relid BETWEEN 1 AND 16;" 2>/dev/null || true
mysql "$DB" -e "DELETE FROM tblcurrencies WHERE id=1 AND code='USD';" 2>/dev/null || true
mysql "$DB" -e "UPDATE tblcurrencies SET prefix='£', suffix='', format=1 WHERE id=2;" 2>/dev/null || true

rm -rf /var/www/whmcs/templates_c/* 2>/dev/null || true
rm -rf /var/www/whmcs/storage/cache/* 2>/dev/null || true

echo "--- Products ---"
mysql "$DB" -e "SELECT id,name,slug,hidden,gid FROM tblproducts WHERE id BETWEEN 1 AND 16 ORDER BY id;"

echo "--- Store slugs ---"
mysql "$DB" -e "SELECT product_id,group_slug,slug,active FROM tblproducts_slugs WHERE product_id BETWEEN 1 AND 16 AND active=1 ORDER BY product_id;"

echo "--- GBP monthly ---"
mysql "$DB" -e "SELECT p.id,p.name,pr.monthly FROM tblproducts p JOIN tblpricing pr ON pr.relid=p.id AND pr.type='product' AND pr.currency=2 WHERE p.id BETWEEN 1 AND 16 ORDER BY p.id;"

echo "sync-whmcs-full done."
