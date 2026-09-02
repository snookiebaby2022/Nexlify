#!/bin/bash
set +e
cd /opt/nexlify-panel
echo "=== health ==="
curl -sS -m 5 http://127.0.0.1:13000/api/health
echo
echo "=== pm2 edge ==="
pm2 jlist 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin); [print(x.get("name"), x.get("pm2_env",{}).get("status")) for x in d]'
echo "=== :8080 owner ==="
ss -tlnp | grep ':8080' | head -1
echo "=== edge fix on 45 file ==="
grep -n "Never pause the origin\|16_000_000\|idleMs" scripts/iptv-edge-proxy.mjs | head -6
echo "=== QoE idleMs in panel ==="
grep -n "PLAYER_STALL_IDLE_MS\|idleMs" src/lib/connection-quality-live.ts | head -6
echo "=== ITV 20s probe ==="
NODE_PATH=/opt/nexlify-panel/node_modules node /tmp/_tmp-itv-hd-cadence2.cjs 2>/dev/null
echo "=== ITV active rows ==="
NODE_PATH=/opt/nexlify-panel/node_modules node /tmp/_tmp-itv-alts.cjs 2>/dev/null
echo "=== 10gbs edge ==="
NODE_PATH=/opt/nexlify-panel/node_modules node /tmp/_tmp-10gbs-edge-logs.cjs 2>/dev/null | head -5
