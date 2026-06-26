#!/bin/bash
mysql whmcs -e "SELECT id,type,paytype,hidden,retired,\`order\`,gid,slug FROM tblproducts WHERE id<=13;"
mysql whmcs -e "SHOW TABLES LIKE '%store%';"
curl -sI "https://billing.nexlify.live/index.php?rp=/store/nexlify/starter-package" | grep -i location
curl -s "https://billing.nexlify.live/index.php?rp=/store/nexlify/starter-package" | grep -i "starter package" | head -3
