#!/usr/bin/env bash
COOKIE=/tmp/whmcs-cookie2.txt
rm -f "$COOKIE"
for url in \
  'https://billing.nexlify.live/index.php?rp=/store/nexlify/starter-package' \
  'https://billing.nexlify.live/index.php?rp=/store/panel-plugins/plex-plugin' \
  'https://billing.nexlify.live/index.php?rp=/store/panel-plugins/media-pack'
do
  rm -f "$COOKIE"
  echo "=== $url ==="
  curl -sL -c "$COOKIE" -b "$COOKIE" -o /tmp/out.html -w "final: %{url_effective}\n" "$url"
  grep -oE '<title>[^<]+|Configure Product|Shopping Cart' /tmp/out.html | head -3
  grep -oiE 'starter|plex|media pack|product' /tmp/out.html | head -5
  echo
done
