#!/usr/bin/env bash
# One-shot: stop broken auto-update, recover panel, upgrade to latest safe tarball.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

export PATH="/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin:${PATH:-}"
if [ -s "$HOME/.nvm/nvm.sh" ]; then
  # shellcheck disable=SC1090
  . "$HOME/.nvm/nvm.sh"
fi

echo "=== fix-customer-panel-permanent ==="

# Stop runaway update workers
pkill -f 'panel-update-background' 2>/dev/null || true
pkill -f 'apply-panel-fast-update' 2>/dev/null || true
rm -f .update-progress.pid .update-in-progress

# Mark stale job failed so cron/watchdog stop waiting
if [ -f .update-progress.json ]; then
  node -e "
    const fs = require('fs');
    const p = '.update-progress.json';
    try {
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      j.status = 'failed';
      j.currentStep = null;
      j.finishedAt = new Date().toISOString();
      j.message = 'Update cancelled — permanent safe-update fix applied.';
      fs.writeFileSync(p, JSON.stringify(j, null, 2));
    } catch { fs.unlinkSync(p); }
  " 2>/dev/null || rm -f .update-progress.json
fi

# Disable auto-apply in panel settings until v1.6.4+ is running
if [ -f data/panel.db ]; then
  node -e "
    const { execSync } = require('child_process');
    const db = 'data/panel.db';
    try {
      const raw = execSync(\"sqlite3 \" + db + \" \\\"SELECT value FROM PanelSetting WHERE key='server';\\\"\", { encoding: 'utf8' }).trim();
      if (!raw) process.exit(0);
      const j = JSON.parse(raw);
      j.panelUpdateAutoDownload = false;
      const esc = JSON.stringify(j).replace(/'/g, \"''\");
      execSync(\"sqlite3 \" + db + \" \\\"UPDATE PanelSetting SET value='\" + esc + \"' WHERE key='server';\\\"\");
      console.log('Auto-update disabled in panel settings');
    } catch (e) { /* ignore */ }
  " 2>/dev/null || true
fi

# Ensure safe scripts are active locally
sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true

# Recover if panel is down but build exists
if ! curl -fsS -o /dev/null --max-time 5 http://127.0.0.1/api/health 2>/dev/null; then
  if [ -x scripts/panel-update-recover.sh ]; then
    bash scripts/panel-update-recover.sh --quick || bash scripts/panel-update-recover.sh || true
  fi
fi

# Full upgrade from vendor tarball (v1.6.4+ with safe update logic)
export PANEL_CACHE_BUST="${PANEL_CACHE_BUST:-v164}"
export NEXT_PRIVATE_WORKER_THREADS=false

echo "Syncing vendor tarball ..."
bash scripts/apply-panel-fast-update.sh sync

echo "Installing deps + prisma ..."
bash scripts/apply-panel-fast-update.sh deps
bash scripts/apply-panel-fast-update.sh prisma

echo "Building with safe rollback (backup .next first) ..."
bash scripts/apply-panel-fast-update.sh build

echo "Restarting panel ..."
bash scripts/apply-panel-fast-update.sh restart

# Verify
sleep 5
health="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1/api/health || echo 000)"
admin="$(curl -sS -o /dev/null -w '%{http_code}' http://127.0.0.1/admin/ || echo 000)"
ver="$(node -e "try{process.stdout.write(require('./package.json').version)}catch{process.stdout.write('?')}" 2>/dev/null || echo '?')"
echo "Version: $ver | health: $health | admin: $admin"

if [ "$health" != "200" ]; then
  echo "ERROR: panel health check failed" >&2
  bash scripts/panel-update-recover.sh || true
  exit 1
fi

echo "=== fix-customer-panel-permanent OK ==="
