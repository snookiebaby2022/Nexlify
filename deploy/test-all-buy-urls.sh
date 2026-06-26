#!/usr/bin/env bash
BASE="https://billing.nexlify.live"
declare -A PRODUCTS=(
  [1]="nexlify/starter-package"
  [2]="nexlify/main-package"
  [3]="nexlify/top-tier"
  [4]="panel-plugins/plex-plugin"
  [14]="panel-plugins/media-pack"
  [16]="panel-plugins/full-plugin-pack"
)
for pid in 1 2 3 4 14 16; do
  echo "=== pid=$pid cart add ==="
  curl -sI "$BASE/cart.php?a=add&pid=$pid" | grep -i location
  slug="${PRODUCTS[$pid]}"
  echo "=== store /$slug ==="
  curl -sI "$BASE/index.php?rp=/store/$slug" | grep -i location
  echo
done
