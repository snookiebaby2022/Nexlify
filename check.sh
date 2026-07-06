#!/bin/bash
sleep 3
ss -tlnp | grep -E "13000|:80 "
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:13000/api/health
echo
curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:80/api/health
echo
pm2 logs nexlify --lines 5 --nostream
