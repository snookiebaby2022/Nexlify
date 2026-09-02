#!/bin/bash
echo "=== tarball ==="
for f in /home/nexlify-panel/public/downloads/nexlify-panel.tar.gz /home/nexlify-panel/dist/nexlify-panel.tar.gz /var/www/nexlify/public/downloads/nexlify-panel.tar.gz; do
  if [ -f "$f" ]; then
    echo "FILE $f"
    ls -lh "$f"
    tar -xOf "$f" package.json 2>/dev/null | head -5 || tar -xOf "$f" nexlify-panel/package.json 2>/dev/null | head -5 || echo "no package.json at root"
  fi
done
echo "=== marketing live (nexlify.live tree) ==="
for d in /var/www/nexlify /home/nexlify-panel /home/nexlify; do
  if [ -f "$d/package.json" ]; then
    echo "DIR $d"
    node -p "require('$d/package.json').name + ' ' + require('$d/package.json').version" 2>/dev/null || true
    [ -d "$d/.git" ] && git -C "$d" log -1 --oneline
  fi
done
echo "=== marketing WHMCS pages ==="
ls /var/www/nexlify/src/app/docs/whmcs 2>/dev/null || echo no_www_docs_whmcs
ls /home/nexlify-panel/src/app/docs/whmcs 2>/dev/null || echo no_panel_docs_whmcs
ls /home/nexlify-panel/marketing-drop-in/src/app/docs/whmcs 2>/dev/null || echo no_dropin_docs_whmcs
echo "=== billing ==="
ls -ld /var/www/whmcs
test -f /etc/nginx/sites-enabled/billing.nexlify.live && echo BILLING_ENABLED || echo BILLING_OFF
test -f /etc/nginx/sites-enabled/billing.nexlify.live.parked && echo BILLING_PARKED
echo "=== demo vs staging watch ==="
echo -n "demo_watch="; test -f /home/nexlify/src/lib/watch-folder-m3u.ts && echo yes || echo no
echo -n "stage_watch="; test -f /home/nexlify-panel/src/lib/watch-folder-m3u.ts && echo yes || echo no
echo -n "demo_whmcs_mod="; test -f /home/nexlify/whmcs-module/nexlify/nexlify.php && echo yes || echo no
echo -n "stage_whmcs_mod="; test -f /home/nexlify-panel/whmcs-module/nexlify/nexlify.php && echo yes || echo no
