#!/usr/bin/env bash
set +e
echo "=== IFACE RATES ==="
cat /proc/net/dev | awk 'NR>2 {print $1,$2,$10}'
echo "=== TOP TALKERS (ss) ==="
ss -tan | awk '{print $4,$5}' | head -5
echo "established 80:" $(ss -tan state established | grep -c ':80 ')
echo "established 443:" $(ss -tan state established | grep -c ':443 ')
echo "established 8080:" $(ss -tan state established | grep -c ':8080 ')
echo "established 13000:" $(ss -tan state established | grep -c ':13000 ')
echo "=== nginx listen ==="
ss -tlnp | grep nginx | awk '{print $4}' | sort -u
echo "=== nginx live locations ==="
grep -nE 'location.*live|proxy_pass|listen ' /etc/nginx/conf.d/*.conf /etc/nginx/sites-enabled/* 2>/dev/null | head -80
echo "=== conntrack top dest ==="
ss -tan state established | awk '{print $5}' | sed 's/:[0-9]*$//' | sort | uniq -c | sort -nr | head -15
echo "=== nethogs-ish (iftop snapshot via /proc) ==="
sleep 1
cat /proc/net/dev | awk 'NR>2 {print $1,$2,$10}'
echo "=== DNS / stream advertise ==="
cd /opt/nexlify-panel 2>/dev/null
grep -E '^(PANEL_PRIMARY|NEXT_PUBLIC_SERVER|STREAM_|NEXLIFY_USE)' .env 2>/dev/null | grep -v SECRET
echo "=== live location on :80/:443 ==="
nginx -T 2>/dev/null | grep -nE 'listen |location.*live|proxy_pass' | head -60
