#!/usr/bin/env bash
mysql whmcs -N -e "SELECT id, name, slug FROM tblproducts WHERE id BETWEEN 1 AND 16 ORDER BY id;"
echo "--- redirect pid=14 ---"
curl -sI "https://billing.nexlify.live/cart.php?a=add&pid=14" | grep -i location
