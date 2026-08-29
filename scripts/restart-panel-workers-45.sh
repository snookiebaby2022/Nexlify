#!/usr/bin/env bash
set +e
cd /opt/nexlify-panel
pm2 delete nexlify
sleep 2
pm2 start ecosystem.config.cjs --only nexlify --update-env
for i in 1 2 3 4 5 6 7 8 9 10 11 12; do
  if curl -sf -m 3 http://127.0.0.1:13000/api/health >/dev/null; then
    echo "healthy try=$i"
    break
  fi
  sleep 2
done
curl -sS -m 6 -o /dev/null -w "health:%{http_code} t=%{time_total}s\n" http://127.0.0.1:13000/api/health
pm2 list | head -12
ss -tlnp | grep 13000
