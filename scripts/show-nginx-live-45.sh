#!/bin/bash
echo "===== http ====="
cat /etc/nginx/conf.d/nexlify-panel-http.conf
echo "===== 8080 ====="
cat /etc/nginx/conf.d/nexlify-live-remote-edge.conf
echo "===== curl -I 8080 ====="
curl -sS -m 5 -o /dev/null -D - http://127.0.0.1:8080/live/test/test/1.ts | head -15
echo "===== curl -I 80 ====="
curl -sS -m 5 -o /dev/null -D - http://127.0.0.1/live/test/test/1.ts | head -15
echo "===== health ====="
curl -sS -m 5 -o /dev/null -w "health:%{http_code} t=%{time_total}\n" http://127.0.0.1:13000/api/health
