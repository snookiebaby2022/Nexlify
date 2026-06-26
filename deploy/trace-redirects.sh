#!/usr/bin/env bash
trace() {
  local url="$1"
  echo "TRACE: $url"
  local current="$url"
  for i in 1 2 3 4 5; do
    resp=$(curl -sI -L --max-redirs 0 "$current" 2>/dev/null | tr -d '\r')
    loc=$(echo "$resp" | grep -i '^location:' | tail -1 | cut -d' ' -f2-)
    code=$(echo "$resp" | grep -i '^HTTP' | tail -1)
    echo "  $code -> ${loc:-FINAL}"
    [ -z "$loc" ] && break
    if [[ "$loc" == /* ]]; then
      current="https://billing.nexlify.live$loc"
    else
      current="$loc"
    fi
  done
  echo
}

trace 'https://billing.nexlify.live/cart.php?a=add&pid=1'
trace 'https://billing.nexlify.live/index.php?rp=/store/nexlify/starter-package'
trace 'https://billing.nexlify.live/index.php?rp=/store/panel-plugins/plex-plugin'
trace 'https://billing.nexlify.live/cart.php?a=confproduct&i=0'
