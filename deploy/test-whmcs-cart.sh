#!/usr/bin/env bash
set -euo pipefail
COOKIE=/tmp/whmcs-cart-test.txt
rm -f "$COOKIE"

curl -sL -c "$COOKIE" -b "$COOKIE" \
  'https://billing.nexlify.live/cart.php?a=add&pid=1' -o /dev/null

echo "=== AJAX calctotal ==="
curl -sL -c "$COOKIE" -b "$COOKIE" \
  -X POST 'https://billing.nexlify.live/cart.php' \
  -d 'ajax=1&a=confproduct&calctotal=true&configure=true&i=0&billingcycle=monthly' \
  | head -c 2000

echo ""
echo "=== AJAX view cart totals ==="
curl -sL -c "$COOKIE" -b "$COOKIE" \
  -X POST 'https://billing.nexlify.live/cart.php' \
  -d 'ajax=1&a=view&calctotal=true' \
  | head -c 2000
