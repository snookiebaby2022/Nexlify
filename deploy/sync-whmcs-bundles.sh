#!/bin/bash
set -euo pipefail
DB=whmcs
SQL="/tmp/sync-whmcs-bundles.sql"

mysql "$DB" < "$SQL"

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

upsert_price 14 45.00 121.50 450.00
upsert_price 15 35.00 94.50 350.00
upsert_price 16 99.00 267.30 990.00

mysql "$DB" -e "SELECT id,name,slug,hidden FROM tblproducts WHERE id IN (14,15,16);"
mysql "$DB" -e "SELECT p.id,p.name,pr.monthly,pr.annually FROM tblproducts p JOIN tblpricing pr ON pr.relid=p.id AND pr.type='product' AND pr.currency=2 WHERE p.id IN (14,15,16);"
echo "sync-whmcs-bundles done."
