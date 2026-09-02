#!/bin/bash
U=sme_snooki_c7weo
P=bv5sfzkyep
echo "=== user_info Lavf UA (like device 87.192.105.4) ==="
curl -sS -m 15 -A 'Lavf/58.29.100' "http://127.0.0.1:8080/player_api.php?username=${U}&password=${P}" | tee /tmp/ui.json | wc -c
echo
echo "=== get_live_categories Lavf ==="
curl -sS -m 20 -A 'Lavf/58.29.100' "http://127.0.0.1:8080/player_api.php?username=${U}&password=${P}&action=get_live_categories" | python3 -c "import sys,json; d=json.load(sys.stdin); print('cats', len(d)); print('first3', d[:3] if d else [])"
echo "=== get_live_streams ==="
curl -sS -m 20 -A 'Lavf/58.29.100' "http://127.0.0.1:8080/player_api.php?username=${U}&password=${P}&action=get_live_streams&category_id=215594974" | python3 -c "import sys,json; d=json.load(sys.stdin); print('streams', len(d) if isinstance(d,list) else d)"
echo "=== get.php m3u_plus first lines ==="
curl -sS -m 20 -A 'Lavf/58.29.100' "http://127.0.0.1:8080/get.php?username=${U}&password=${P}&type=m3u_plus&output=ts" | head -15
echo "=== vod categories + first cat streams ==="
curl -sS -m 20 -A 'Lavf/58.29.100' "http://127.0.0.1:8080/player_api.php?username=${U}&password=${P}&action=get_vod_categories" | python3 -c "import sys,json; d=json.load(sys.stdin); print('vod_cats', len(d)); print('first', d[0] if d else None)"
VCAT=$(curl -sS -m 20 -A 'Lavf/58.29.100' "http://127.0.0.1:8080/player_api.php?username=${U}&password=${P}&action=get_vod_categories" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d[0]['category_id'] if d else '')")
curl -sS -m 20 -A 'Lavf/58.29.100' "http://127.0.0.1:8080/player_api.php?username=${U}&password=${P}&action=get_vod_streams&category_id=${VCAT}" | python3 -c "import sys,json; d=json.load(sys.stdin); print('vod_streams_in_first_cat', len(d) if isinstance(d,list) else d)"
