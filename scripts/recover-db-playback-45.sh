#!/usr/bin/env bash
set -euo pipefail
cd /opt/nexlify-panel
pkill -f 'purge-live-url-duplicates' 2>/dev/null || true
sudo -u postgres psql -d nexlify -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='nexlify' AND pid <> pg_backend_pid();" >/dev/null 2>&1 || true
sleep 2
pm2 restart nexlify --update-env
sleep 25
curl -sS -m 12 http://127.0.0.1:13000/api/health || true
echo
node scripts/ensure-smoke-test-line.cjs 2>&1 | tail -2
curl -sS -m 22 -o /tmp/p.bin -w "play:%{http_code} bytes=%{size_download}\n" -A "VLC/3.0.20" "http://127.0.0.1:8080/live/_smoke_test/SmokeTest2026%21/1476023810.ts" || true
wc -c /tmp/p.bin 2>/dev/null || true
CREDS=$(node scripts/ensure-smoke-test-line.cjs 2>/dev/null | tail -1)
U=$(node -e "console.log(JSON.parse(process.argv[1]).u)" "$CREDS")
P=$(node -e "console.log(JSON.parse(process.argv[1]).p)" "$CREDS")
curl -sS -m 90 -o /tmp/live.json -w "catalog:%{http_code} bytes=%{size_download}\n" "http://127.0.0.1:8080/player_api.php?username=${U}&password=${P}&action=get_live_streams" || true
