#!/bin/bash
# Run on VPS: bash /var/www/nexlify/deploy/diagnose.sh
echo "========== NEXLIFY DIAGNOSE =========="
echo "IP: $(curl -s --max-time 3 ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
echo ""
echo "--- Ports ---"
ss -tlnp | grep -E ':80|:443|:3000|:3001' || echo "none"
echo ""
echo "--- nginx ---"
systemctl is-active nginx 2>/dev/null || echo "nginx unknown"
nginx -t 2>&1 | tail -3
echo ""
echo "--- PM2 ---"
pm2 status 2>/dev/null || echo "pm2 not running"
echo "--- PM2 (expect nexlify-web :3001 + nexlify :3000) ---"
pm2 jlist 2>/dev/null | grep -E '"name"|"pm_cwd"|"PORT"' | head -20 || true
echo ""
echo "--- Local HTTP ---"
curl -sI --max-time 3 http://127.0.0.1:3001 | head -3 || echo "3001 FAIL"
curl -s --max-time 3 http://127.0.0.1:3001/api/health 2>/dev/null || echo "health FAIL"
curl -sI --max-time 3 http://127.0.0.1:3000 | head -3 || echo "3000 FAIL"
curl -sI --max-time 3 http://127.0.0.1:80 | head -3 || echo "port 80 FAIL"
echo ""
echo "--- App dir ---"
ls -la /var/www/nexlify/package.json 2>&1 || echo "MISSING /var/www/nexlify"
grep -E '^PORT=|^JWT' /var/www/nexlify/.env 2>/dev/null | head -3 || echo "no .env"
echo ""
echo "--- DNS check (nexlify.live) ---"
dig +short nexlify.live 2>/dev/null || echo "dig n/a"
echo ""
echo "--- nginx sites-enabled ---"
ls -la /etc/nginx/sites-enabled/ 2>/dev/null || true
echo ""
echo "--- Origin TLS (526 if wrong CN) ---"
for h in nexlify.live panel.nexlify.live panel.demo.nexlify.live billing.nexlify.live; do
  subj=$(openssl s_client -connect 127.0.0.1:443 -servername "$h" </dev/null 2>/dev/null \
    | openssl x509 -noout -subject 2>/dev/null || echo "MISSING")
  echo "  $h -> $subj"
done
echo ""
echo "--- Demo redirect ---"
curl -sI --max-time 5 -k -H "Host: panel.demo.nexlify.live" "https://127.0.0.1/" | grep -iE 'HTTP/|location:' || echo "panel.demo FAIL"
echo "========================================"
