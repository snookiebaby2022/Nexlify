#!/bin/bash
set -euo pipefail
echo "HOST=$(hostname -I | awk '{print $1}')"
echo "=== panel dirs ==="
for d in /opt/nexlify-panel /home/nexlify /home/nexlify-panel; do
  if [ -f "$d/package.json" ]; then
    echo "DIR $d"
    echo -n "  version="; node -p "require('$d/package.json').version" 2>/dev/null || echo "?"
    if [ -d "$d/.git" ]; then
      echo -n "  git="; git -C "$d" log -1 --oneline 2>/dev/null || echo "nogit"
      echo -n "  dirty="; git -C "$d" status -sb --untracked-files=no 2>/dev/null | head -3
    else
      echo "  git=NO"
    fi
    echo -n "  watch_review="; grep -c 'body.review' "$d/src/app/api/admin/watch-folders/route.ts" 2>/dev/null || echo 0
    echo -n "  watch_m3u_lib="; test -f "$d/src/lib/watch-folder-m3u.ts" && echo yes || echo no
    echo -n "  whmcs_nav="; grep -c 'WHMCS' "$d/src/app/admin/settings/api/page.tsx" 2>/dev/null || echo 0
    echo -n "  whmcs_module="; test -f "$d/whmcs-module/nexlify/nexlify.php" && echo yes || echo no
  fi
done
echo "=== pm2 ==="
pm2 jlist 2>/dev/null | python3 -c 'import json,sys; d=json.load(sys.stdin);
[print(p["name"], p["pm2_env"].get("status"), p["pm2_env"].get("pm_cwd","")) for p in d]' 2>/dev/null || pm2 ls | head
echo "=== health ==="
curl -s -m 5 -o /dev/null -w "13000:%{http_code}\n" http://127.0.0.1:13000/api/health || true
curl -s -m 5 -o /dev/null -w "80:%{http_code}\n" http://127.0.0.1/api/health || true
echo "=== billing/whmcs listen ==="
ss -tlnp 2>/dev/null | grep -E ':80|:443|:3306|:2087|:2096' | head || true
echo "=== nginx billing ==="
grep -Rnl 'billing.nexlify\|whmcs' /etc/nginx/ 2>/dev/null | head || echo none
echo "=== processes whmcs ==="
pgrep -af 'whmcs|billing.nexlify' | grep -v pgrep | head || echo none
