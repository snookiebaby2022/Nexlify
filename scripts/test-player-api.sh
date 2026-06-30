#!/usr/bin/env bash
echo "13000:"
curl -sS "http://127.0.0.1:13000/player_api.php?username=bad&password=bad&action=get_live_categories"
echo
echo "nginx:"
curl -skS -H "Host: panel.nexlify.live" "https://127.0.0.1/player_api.php?username=bad&password=bad&action=get_live_categories"
echo
echo "public:"
curl -sS "https://panel.nexlify.live/player_api.php?username=bad&password=bad&action=get_live_categories"
echo
grep PANEL_DEMO /home/nexlify-panel/.env
