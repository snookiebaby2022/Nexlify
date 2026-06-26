#!/bin/bash
COOKIE=/tmp/whmcs-cookie2.txt
rm -f "$COOKIE"
curl -sL -c "$COOKIE" -b "$COOKIE" -o /tmp/conf.html \
  "https://billing.nexlify.live/cart.php?a=add&pid=1"
grep -iE 'Configure Server|servername|Root Password|NS1|product-title' /tmp/conf.html | head -10
