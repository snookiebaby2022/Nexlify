#!/usr/bin/env bash
set -euo pipefail
COOKIE=/tmp/whmcs-full-cart.txt
rm -f "$COOKIE"

curl -sL -c "$COOKIE" -b "$COOKIE" 'https://billing.nexlify.live/cart.php?a=add&pid=1' -o /tmp/s1.html
TOKEN=$(grep -oP 'name="token" value="\K[^"]+' /tmp/s1.html | head -1)

# Complete product config (Continue button)
curl -sL -c "$COOKIE" -b "$COOKIE" \
  -X POST 'https://billing.nexlify.live/cart.php?a=confproduct&i=0' \
  -d "token=$TOKEN" \
  -d 'configure=true' \
  -d 'i=0' \
  -d 'billingcycle=monthly' \
  -o /tmp/s2.html

echo "=== after confproduct POST ==="
grep 'cartItemCount' /tmp/s2.html | head -2
grep -iE 'Starter|50|item-price|subtotal|totalDue' /tmp/s2.html | head -15

curl -sL -c "$COOKIE" -b "$COOKIE" 'https://billing.nexlify.live/cart.php?a=view' -o /tmp/s3.html
echo "=== view cart with session ==="
grep -iE 'empty|Starter|item-price|subtotal|totalDue|50' /tmp/s3.html | head -20
