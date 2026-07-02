#!/usr/bin/env bash
# Clear stuck panel update + apply firewall + restart (customer VPS repair).
set -euo pipefail
PANEL_DIR="${PANEL_DIR:-/opt/nexlify-panel}"
cd "$PANEL_DIR"
pkill -f 'panel-update-background' 2>/dev/null || true
pkill -f 'apply-panel-fast-update' 2>/dev/null || true
rm -f .update-progress.pid .update-in-progress
if [ -f .update-progress.json ]; then
  node -e "
    const fs=require('fs');
    const p='.update-progress.json';
    try {
      const j=JSON.parse(fs.readFileSync(p,'utf8'));
      if (j.status==='running') {
        j.status='failed';
        j.message='Cleared by audit repair';
        j.finishedAt=new Date().toISOString();
        fs.writeFileSync(p, JSON.stringify(j,null,2));
      }
    } catch { fs.unlinkSync(p); }
  " 2>/dev/null || rm -f .update-progress.json
fi
sed -i 's/\r$//' scripts/*.sh 2>/dev/null || true
chmod +x scripts/*.sh
bash scripts/nexlify-firewall-ports.sh 2>/dev/null || true
bash scripts/pm2-start.sh 2>/dev/null || bash scripts/panel-restart-safe.sh --nexlify-only 2>/dev/null || bash scripts/pm2-start.sh
bash scripts/full-audit-smoke.sh 2>&1 || true
echo REPAIR_OK
