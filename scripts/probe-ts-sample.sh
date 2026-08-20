#!/usr/bin/env bash
set -euo pipefail
U="${1:-Wardonet31}"
P="${2:-VftY9jVbNT}"
API="http://127.0.0.1:13000/player_api.php?username=${U}&password=${P}"
IDS=$(curl -sS "${API}&action=get_live_streams" | python3 -c "import sys,json; d=json.load(sys.stdin); print(' '.join(str(x['stream_id']) for x in d[:15]))")
ok=0 fail=0
for SID in $IDS; do
  code=$(curl -sS -m 8 -A "XCIPTV/5.0.0" -o /dev/null -w "%{http_code}" "http://127.0.0.1/live/${U}/${P}/${SID}.ts" || echo 000)
  bytes=$(curl -sS -m 3 -A "XCIPTV/5.0.0" -o /dev/null -w "%{size_download}" "http://127.0.0.1/live/${U}/${P}/${SID}.ts" 2>/dev/null || echo 0)
  if [ "$code" = "200" ] && [ "${bytes:-0}" -gt 1000 ]; then ok=$((ok+1)); mark=OK; else fail=$((fail+1)); mark=FAIL; fi
  echo "$mark sid=$SID http=$code bytes=$bytes"
done
echo "summary ok=$ok fail=$fail"
