#!/bin/bash
set +e
UA='Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager'
echo '=== origin :80 WebOS ==='
echo -n 'GET no creds: '
curl -sS -o /tmp/pa.json -w '%{http_code}\n' --max-time 8 -A "$UA" -H 'Host: darkcdn.store' 'http://127.0.0.1/player_api.php'
python3 -c 'import json; j=json.load(open("/tmp/pa.json")); print("auth", j.get("user_info",{}).get("auth"), "port", j.get("server_info",{}).get("port"), "proto", j.get("server_info",{}).get("server_protocol"))'
echo -n 'HEAD no creds: '
curl -sSI --max-time 8 -A "$UA" -H 'Host: darkcdn.store' 'http://127.0.0.1/player_api.php' | tr -d '\r' | awk 'NR==1{print}'
echo -n 'GET bad creds: '
curl -sS -o /tmp/pa-bad.json -w '%{http_code}\n' --max-time 8 -A "$UA" -H 'Host: darkcdn.store' 'http://127.0.0.1/player_api.php?username=x&password=y'
python3 -c 'import json; j=json.load(open("/tmp/pa-bad.json")); print("auth", j.get("user_info",{}).get("auth"), "port", j.get("server_info",{}).get("port"), "https_port", j.get("server_info",{}).get("https_port"), "proto", j.get("server_info",{}).get("server_protocol"))'
echo '=== public ==='
echo -n 'HTTP: '
curl -sS -o /tmp/pa-pub.json -w '%{http_code} redir:%{redirect_url} http:%{http_version}\n' --max-time 8 -A "$UA" 'http://darkcdn.store/player_api.php'
python3 -c 'import json; j=json.load(open("/tmp/pa-pub.json")); print("auth", j.get("user_info",{}).get("auth"), "port", j.get("server_info",{}).get("port"), "proto", j.get("server_info",{}).get("server_protocol"))'
echo -n 'HTTPS: '
curl -sS -o /dev/null -w '%{http_code} http:%{http_version}\n' --max-time 8 -A "$UA" 'https://darkcdn.store/player_api.php'
echo '=== 8080 / health ==='
ss -ltnp | awk '/:8080 /{print; exit}'
curl -sS -o /dev/null -w 'health:%{http_code}\n' --max-time 8 http://127.0.0.1:13000/api/health
pm2 list | awk '/iptv-edge/{print}'
echo PROBE_OK
