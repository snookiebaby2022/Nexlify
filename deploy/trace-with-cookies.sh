#!/usr/bin/env bash
COOKIE=/tmp/whmcs-cookie.txt
rm -f "$COOKIE"

test_flow() {
  local label="$1"
  local url="$2"
  echo "=== $label ==="
  curl -sL -c "$COOKIE" -b "$COOKIE" -o /tmp/whmcs-last.html -w "final: %{url_effective}\n" "$url"
  grep -oE '<title>[^<]+' /tmp/whmcs-last.html | head -1
  echo
}

test_flow "add pid=4 plex" 'https://billing.nexlify.live/cart.php?a=add&pid=4'
test_flow "add pid=1 starter" 'https://billing.nexlify.live/cart.php?a=add&pid=1'
