#!/usr/bin/env bash
# Hotfix stuck "Update worker crashed: Cannot find module panel-server" without using the UI updater.
# Run on customer VPS: bash /opt/nexlify-panel/scripts/fix-update-worker-now.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PANEL_INSTALL_BASE="${PANEL_INSTALL_BASE:-https://nexlify.live/install}"
_PV="$(bash "$ROOT/scripts/panel-version.sh" 2>/dev/null || echo 0)"
CACHE="${PANEL_CACHE_BUST:-v${_PV}}"

echo "=== fix-update-worker-now (panel root: $ROOT) ==="

pkill -f 'panel-update-background' 2>/dev/null || true
rm -f .update-progress.pid .update-in-progress

# Point PM2 / standalone runtime at the real install root (fixes pre-v1.9.11 bundled code).
for envfile in .env .next/standalone/.env; do
  if [ -f "$envfile" ]; then
    sed -i '/^PANEL_REPO_PATH=/d' "$envfile" 2>/dev/null || true
    echo "PANEL_REPO_PATH=$ROOT" >> "$envfile"
  fi
done

# Stale copy in standalone breaks module resolution for old worker scripts.
rm -rf .next/standalone/scripts 2>/dev/null || true

# Fix DB repoPath if it points at .next/standalone (breaks pre-v1.9.11 update worker).
if [ -f data/panel.db ]; then
  node -e "
    const { execSync } = require('child_process');
    const db = 'data/panel.db';
    try {
      const raw = execSync(\"sqlite3 \" + db + \" \\\"SELECT value FROM PanelSetting WHERE key='server';\\\"\", { encoding: 'utf8' }).trim();
      if (!raw) process.exit(0);
      const j = JSON.parse(raw);
      const rp = String(j.repoPath || '').trim();
      if (rp.includes('/.next/standalone') || rp.endsWith('/standalone')) {
        j.repoPath = process.env.PANEL_ROOT || '$ROOT';
        const esc = JSON.stringify(j).replace(/'/g, \"''\");
        execSync(\"sqlite3 \" + db + \" \\\"UPDATE PanelSetting SET value='\" + esc + \"' WHERE key='server';\\\"\");
        console.log('Fixed server.repoPath in panel.db →', j.repoPath);
      }
    } catch (e) { /* ignore */ }
  " 2>/dev/null || true
fi

fetch_one() {
  local url="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  if curl -fsSL "$url" -o "${dest}.new" 2>/dev/null; then
    sed -i 's/\r$//' "${dest}.new" 2>/dev/null || true
    chmod +x "${dest}.new" 2>/dev/null || true
    mv "${dest}.new" "$dest"
    echo "Fetched $(basename "$dest")"
  fi
}

fetch_one "${PANEL_INSTALL_BASE}/scripts/panel-update-background.sh?${CACHE}" "$ROOT/scripts/panel-update-background.sh"
fetch_one "${PANEL_INSTALL_BASE}/scripts/panel-update-background.ts?${CACHE}" "$ROOT/scripts/panel-update-background.ts" 2>/dev/null || true

chmod +x "$ROOT/scripts/panel-update-background.sh" 2>/dev/null || true
sed -i 's/\r$//' "$ROOT"/scripts/*.sh 2>/dev/null || true

if ! command -v npx >/dev/null 2>&1 || ! npx tsx --version >/dev/null 2>&1; then
  echo "Installing tsx ..."
  npm install -g tsx 2>/dev/null || npm install -g tsx --prefix /usr/local 2>/dev/null || true
fi

if [ -f .update-progress.json ]; then
  node -e "
    const fs = require('fs');
    const p = '.update-progress.json';
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      if (j.status === 'running') {
        j.status = 'failed';
        j.currentStep = null;
        j.finishedAt = new Date().toISOString();
        j.message = 'Cleared by fix-update-worker-now.sh — retry Update from Settings.';
        fs.writeFileSync(p, JSON.stringify(j, null, 2));
      }
    } catch { fs.unlinkSync(p); }
  " 2>/dev/null || rm -f .update-progress.json
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart nexlify 2>/dev/null || pm2 restart all 2>/dev/null || true
fi

echo "=== fix-update-worker-now OK — retry Admin → Settings → Updates ==="
