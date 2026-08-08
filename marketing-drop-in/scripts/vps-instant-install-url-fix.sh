#!/usr/bin/env bash
# Fix wrong install URL (?v1.9.7) on ALL marketing copies PM2 might serve.
# Patches every known path + PM2 cwd. No rebuild required.
#
# SSH as root on 85.17.162.54 and run:
#   bash /root/vps-instant-install-url-fix.sh
set -euo pipefail

PORT="${MARKETING_PORT:-13001}"

pm2_cwd() {
  pm2 jlist 2>/dev/null | python3 -c "
import json, sys
try:
  apps = json.load(sys.stdin)
except Exception:
  sys.exit(0)
for a in apps:
  if a.get('name') in ('nexlify-web', 'nexlify-website'):
    print(a.get('pm2_env', {}).get('pm_cwd', ''))
    break
" 2>/dev/null || true
}

patch_dir() {
  local dir="$1"
  [ -d "$dir" ] || return 0
  echo ""
  echo "-> $dir"

  local pi="$dir/src/lib/panel-install.ts"
  if [ -f "$pi" ] && ! grep -q 'INSTALLER_CACHE_QUERY' "$pi" 2>/dev/null; then
    sed -i \
      -e 's|panel.sh?${INSTALLER_VERSION}|panel.sh?${INSTALLER_CACHE_QUERY}|g' \
      -e 's|panel.sh?v1.9.7|panel.sh?v=1.9.7|g' \
      "$pi"
    grep -q 'INSTALLER_CACHE_QUERY' "$pi" 2>/dev/null || \
      sed -i '/export const INSTALLER_VERSION/a export const INSTALLER_CACHE_QUERY = `v=${PANEL_VERSION}`;' "$pi"
    echo "   source panel-install.ts patched"
  fi

  local json="$dir/public/install-command.json"
  if [ ! -f "$json" ] || ! grep -q '"url".*v=1.9.7' "$json" 2>/dev/null; then
    mkdir -p "$(dirname "$json")"
    cat > "$json" << 'JSON'
{
  "version": "1.9.7",
  "label": "v1.9.7",
  "url": "https://nexlify.live/install/panel.sh?v=1.9.7",
  "command": "curl -fsSL 'https://nexlify.live/install/panel.sh?v=1.9.7' | sudo bash"
}
JSON
    echo "   wrote public/install-command.json"
  fi

  local n=0
  if [ -d "$dir/.next" ]; then
    while IFS= read -r f; do
      sed -i \
        -e 's|panel.sh?v1.9.7|panel.sh?v=1.9.7|g' \
        -e 's|panel.sh?v1\.9\.7|panel.sh?v=1.9.7|g' \
        "$f"
      n=$((n + 1))
    done < <(grep -rlE 'panel\.sh\?v1\.9\.7|panel\.sh\?v[0-9]+\.[0-9]+\.[0-9]+' "$dir/.next" 2>/dev/null || true)
  fi
  echo "   patched $n cached .next file(s)"
}

echo "=== Nexlify install URL fix (all marketing paths) ==="

CWD="$(pm2_cwd)"
echo "PM2 nexlify-web cwd: ${CWD:-unknown}"

for d in \
  "$CWD" \
  /var/www/nexlify \
  /home/nexlify-panel/marketing-drop-in \
  /opt/nexlify-panel/marketing-drop-in; do
  [ -n "$d" ] && patch_dir "$d"
done

echo ""
echo "-> Restarting nexlify-web..."
pm2 restart nexlify-web --update-env 2>&1 | tail -3 || pm2 restart all --update-env 2>&1 | tail -3
pm2 save 2>/dev/null || true
sleep 4

echo ""
echo "=== Verification ==="
for port in "$PORT" 3001; do
  if curl -fsS "http://127.0.0.1:${port}/install-command.json" 2>/dev/null | grep -q 'v=1.9.7'; then
    echo "OK: port $port serves /install-command.json with ?v=1.9.7"
  fi
  html="$(curl -fsS "http://127.0.0.1:${port}/install" 2>/dev/null || true)"
  if [ -n "$html" ]; then
    echo "Port $port /install:"
    echo "$html" | grep -oE 'panel\.sh[^"'\''<> ]*' | head -3 || echo "  (URL in client JS — hard-refresh after deploy)"
  fi
done

echo ""
echo "=== DONE ==="
echo "Correct command: curl -fsSL 'https://nexlify.live/install/panel.sh?v=1.9.7' | sudo bash"
echo "Hard-refresh https://nexlify.live/install (Ctrl+Shift+R)"
echo "If still wrong in browser: purge Cloudflare cache for nexlify.live"
