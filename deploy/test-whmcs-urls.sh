#!/usr/bin/env bash
for u in \
  "cart.php?a=add&pid=1" \
  "cart.php?a=add&pid=14" \
  "cart.php?a=add&pid=16" \
  "index.php?rp=/store/panel-plugins/media-pack" \
  "index.php?rp=/store/panel-plugins/plex-plugin" \
  "index.php?rp=/store/nexlify/starter-package"
do
  echo "=== $u ==="
  curl -sI "https://billing.nexlify.live/$u" | grep -iE '^HTTP|^location'
done
