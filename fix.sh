#!/bin/bash
cd /opt/nexlify-panel

echo "=== FINAL VERIFICATION ==="
# Panel health
curl -s http://127.0.0.1:80/api/health
echo ""
# Panel version
curl -s http://127.0.0.1:80/api/panel/version
echo ""

# Login page (with browser UA)
curl -s -o /dev/null -w 'login (browser): %{http_code}\n' -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0' http://75.119.137.174/login
curl -s -o /dev/null -w 'dashboard (browser): %{http_code}\n' -H 'User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/131.0.0.0' http://75.119.137.174/admin/dashboard

# PM2
pm2 status

# Version check
grep '"version"' package.json | head -1
