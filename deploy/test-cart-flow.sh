#!/bin/bash
COOKIE=/tmp/whmcs-cookie.txt
rm -f "$COOKIE"

echo "=== add pid 1 ==="
curl -sL -c "$COOKIE" -b "$COOKIE" -o /tmp/cart1.html -w "final:%{url_effective} code:%{http_code}\n" \
  "https://billing.nexlify.live/cart.php?a=add&pid=1"

grep -iE 'starter|configure|checkout|error|invalid|empty' /tmp/cart1.html | head -8

echo "=== add pid 4 plex ==="
curl -sL -c "$COOKIE" -b "$COOKIE" -o /tmp/cart4.html -w "final:%{url_effective} code:%{http_code}\n" \
  "https://billing.nexlify.live/cart.php?a=add&pid=4"

grep -iE 'plex|configure|checkout|error|invalid' /tmp/cart4.html | head -8
