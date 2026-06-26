#!/bin/bash
set -euo pipefail
DB=whmcs

echo "=== dedupe-whmcs-pricing (GBP product rows) ==="
mysql "$DB" -N -e "
SELECT relid, MIN(id) AS keep_id, COUNT(*) AS cnt
FROM tblpricing WHERE type='product' AND currency=2 AND relid BETWEEN 1 AND 13
GROUP BY relid HAVING cnt > 1;" | while IFS=$'\t' read -r relid keep_id cnt; do
  [ -z "$relid" ] && continue
  mysql "$DB" -e "DELETE FROM tblpricing WHERE type='product' AND currency=2 AND relid=$relid AND id != $keep_id;"
  echo "relid $relid: kept id $keep_id"
done

mysql "$DB" -e "UPDATE tblproducts SET hidden=1, retired=1 WHERE id IN (14,15,16);"
mysql "$DB" -e "SELECT id,hidden,retired,name FROM tblproducts WHERE id>=14;"
mysql "$DB" -e "SELECT p.id,p.name,pr.monthly,pr.quarterly,pr.annually FROM tblproducts p JOIN tblpricing pr ON pr.relid=p.id AND pr.type='product' AND pr.currency=2 WHERE p.id BETWEEN 1 AND 13 ORDER BY p.id;"
