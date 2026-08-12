#!/usr/bin/env bash
# Sync extracted marketing drop-in into /var/www/nexlify then rebuild (preserves .env)
set -euo pipefail
SRC="${1:-/tmp/marketing-full-drop-in}"
WWW=/var/www/nexlify
[ -d "$SRC/src" ] || { echo "ERROR: bad src $SRC"; exit 1; }
mkdir -p "$WWW"
cp -a "$WWW/.env" /tmp/nexlify-www.env.bak 2>/dev/null || true
rsync -a --delete \
  --exclude node_modules --exclude .next --exclude .env --exclude .env.local \
  --exclude data --exclude src/generated --exclude '*.db' --exclude marketing-drop-in \
  --exclude public/downloads \
  "$SRC/" "$WWW/"
# Keep published panel installer assets (tarball lives only under public/downloads)
mkdir -p "$WWW/public/downloads" "$WWW/public/install"
# Prefer latest installer from panel repo if present on this host
if [ -f /home/nexlify-panel/scripts/install-linux.sh ]; then
  cp -f /home/nexlify-panel/scripts/install-linux.sh "$WWW/public/install/panel.sh"
  PANEL_VER="$(node -p "require('/home/nexlify-panel/package.json').version.replace(/\\./g,'')" 2>/dev/null || true)"
  if [ -n "${PANEL_VER:-}" ]; then
    sed -i "s/PANEL_CACHE_BUST=\"\${PANEL_CACHE_BUST:-v[0-9a-zA-Z]*}\"/PANEL_CACHE_BUST=\"\${PANEL_CACHE_BUST:-v${PANEL_VER}}\"/" \
      "$WWW/public/install/panel.sh" 2>/dev/null || true
  fi
  sed -i 's/\r$//' "$WWW/public/install/panel.sh" 2>/dev/null || true
  chmod +x "$WWW/public/install/panel.sh" 2>/dev/null || true
fi
rm -rf "$WWW/marketing-drop-in" 2>/dev/null || true
if [ -f /tmp/nexlify-www.env.bak ]; then
  cp /tmp/nexlify-www.env.bak "$WWW/.env"
fi
# Deploy helpers live in panel repo scripts/ — always reinstall after rsync --delete
mkdir -p "$WWW/scripts"
for f in marketing-deploy-vps.sh marketing-smoke-test.sh sync-marketing-admin.cjs verify-admin-login.cjs sync-marketing-env.py run-broadcast-panel-update.sh; do
  [ -f "/tmp/$f" ] && cp "/tmp/$f" "$WWW/scripts/$f"
done
# Also accept copies already placed beside this script
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
for f in marketing-deploy-vps.sh marketing-smoke-test.sh; do
  [ -f "$SCRIPT_DIR/$f" ] && cp "$SCRIPT_DIR/$f" "$WWW/scripts/$f"
done
# Normalize DATABASE_URL quotes
python3 - <<'PY'
from pathlib import Path
import re
p = Path("/var/www/nexlify/.env")
text = p.read_text(encoding="utf-8", errors="replace")
out=[]
for line in text.splitlines(True):
    m=re.match(r'^(DATABASE_URL=)([\"\'])(.+)\2(\r?\n)?$', line)
    if m:
        line=m.group(1)+m.group(3)+(m.group(4) or "\n")
    out.append(line)
p.write_text("".join(out), encoding="utf-8", newline="\n")
print("env ok")
PY
sed -i 's/\r$//' "$WWW/scripts/"*.sh 2>/dev/null || true
chmod +x "$WWW/scripts/"*.sh 2>/dev/null || true
bash "$WWW/scripts/marketing-deploy-vps.sh"
