#!/usr/bin/env bash
# Fix: duplicate upstream "nexlify_panel" — one shared file in conf.d
set -euo pipefail
SUDO="${SUDO:-sudo}"

echo "=== Shared upstream ==="
$SUDO tee /etc/nginx/conf.d/nexlify-upstream.conf >/dev/null <<'EOF'
upstream nexlify_panel {
    server 127.0.0.1:3000;
}
EOF

echo "=== Remove duplicate upstream blocks from sites ==="
for f in /etc/nginx/sites-available/* /etc/nginx/sites-enabled/*; do
  [ -f "$f" ] || continue
  if grep -q 'upstream nexlify_panel' "$f" 2>/dev/null; then
    echo "Patching $f"
    $SUDO sed -i '/^upstream nexlify_panel/,/^}/d' "$f"
  fi
done

echo "=== Test nginx ==="
$SUDO nginx -t
$SUDO systemctl reload nginx
echo "OK. Run: sudo certbot certonly --nginx -d panel.nexlify.live"
