#!/bin/bash
cd /home/nexlify-panel
sed -i 's|// output: "standalone"|output: "standalone"|' next.config.ts
grep output next.config.ts
rm -rf .next
npm run build 2>&1 | tail -5
pm2 start ecosystem.config.cjs
sleep 5
curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:13000/login -H "Host: panel.nexlify.live"
