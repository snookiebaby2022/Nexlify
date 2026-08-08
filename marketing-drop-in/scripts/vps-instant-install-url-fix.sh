#!/usr/bin/env bash
# Fix wrong install URL (?v1.9.7 -> ?v=1.9.7) on ALL marketing copies.
# The stale .next bundles use panel.sh?${VAR} where VAR="v1.9.7" — NOT a literal string.
set -euo pipefail

PORT="${MARKETING_PORT:-13001}"
VER="${PANEL_VERSION:-1.9.7}"
CORRECT_URL="https://nexlify.live/install/panel.sh?v=${VER}"
CORRECT_CMD="curl -fsSL '${CORRECT_URL}' | sudo bash"

pm2_cwd() {
  pm2 describe nexlify-web 2>/dev/null | awk -F'│' '/exec cwd/{gsub(/ /,""); print $2; exit}'
  pm2 jlist 2>/dev/null | python3 -c "
import json, sys
try:
  for a in json.load(sys.stdin):
    if a.get('name') in ('nexlify-web', 'nexlify-website'):
      print(a.get('pm2_env', {}).get('pm_cwd', ''))
      break
except Exception:
  pass
" 2>/dev/null
}

patch_next_files() {
  local dir="$1"
  local n=0
  [ -d "$dir/.next" ] || return 0
  while IFS= read -r f; do
    sed -i \
      -e "s|https://nexlify.live/install/panel.sh?\${[^}]*}|${CORRECT_URL}|g" \
      -e 's|panel.sh?v1.9.7|panel.sh?v=1.9.7|g' \
      -e 's|panel.sh?v1\.9\.7|panel.sh?v=1.9.7|g' \
      "$f"
    n=$((n + 1))
  done < <(find "$dir/.next" -type f \( -name '*.js' -o -name '*.json' \) 2>/dev/null)
  echo "   patched $n .next file(s)"
}

patch_dir() {
  local dir="$1"
  [ -d "$dir" ] || return 0
  echo ""
  echo "-> $dir"

  mkdir -p "$dir/public"
  cat > "$dir/public/install-command.json" << JSON
{
  "version": "${VER}",
  "label": "v${VER}",
  "url": "${CORRECT_URL}",
  "command": "${CORRECT_CMD}"
}
JSON
  echo "   wrote public/install-command.json"

  patch_next_files "$dir"
}

echo "=== Nexlify install URL fix (template \${VAR} patch) ==="
CWD="$(pm2_cwd | head -1)"
echo "PM2 nexlify-web cwd: ${CWD:-unknown}"

for d in "$CWD" /var/www/nexlify /home/nexlify-panel/marketing-drop-in /opt/nexlify-panel/marketing-drop-in; do
  [ -n "$d" ] && patch_dir "$d"
done

echo ""
echo "-> Restarting nexlify-web..."
pm2 restart nexlify-web --update-env 2>&1 | tail -3
pm2 save 2>/dev/null || true
sleep 4

echo ""
echo "=== Verification ==="
curl -fsS "http://127.0.0.1:${PORT}/install-command.json" 2>/dev/null | head -1 || true
echo ""
HTML="$(curl -fsS "http://127.0.0.1:${PORT}/install" 2>/dev/null || true)"
if echo "$HTML" | grep -q 'panel.sh?v=1.9.7'; then
  echo "OK: /install shows ?v=${VER}"
  echo "$HTML" | grep -oE 'panel\.sh[^"'\''<> ]*' | sort -u | head -5
elif echo "$HTML" | grep -q 'panel.sh?v1.9.7'; then
  echo "FAIL: still wrong — run full rebuild:"
  echo "  cd /var/www/nexlify && bash /root/vps-hotfix-marketing-now.sh"
  echo "$HTML" | grep -oE 'panel\.sh[^"'\''<> ]*' | sort -u | head -5
  exit 1
else
  echo "WARN: could not confirm URL in HTML"
fi

echo ""
echo "Hard-refresh https://nexlify.live/install (Ctrl+Shift+R)"
