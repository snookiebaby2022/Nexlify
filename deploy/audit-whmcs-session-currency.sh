#!/usr/bin/env bash
set -euo pipefail
DB="${WHMCS_DB:-whmcs}"
mysql "$DB" -e "SELECT setting, value FROM tblconfiguration WHERE setting LIKE '%urrency%';"
echo "=== clients on bad currency id ==="
mysql "$DB" -e "SELECT id, currency FROM tblclients WHERE currency NOT IN (SELECT id FROM tblcurrencies);"
