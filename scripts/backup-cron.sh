#!/usr/bin/env bash
# Example cron: 0 3 * * * /home/nexlify-panel/scripts/backup-cron.sh
set -euo pipefail
cd "$(dirname "$0")/.."
PORT="${PORT:-${PANEL_PORT:-3000}}"
curl -fsS -X POST -H "Cookie: $(cat .backup-cron-cookie 2>/dev/null || echo '')" "http://127.0.0.1:${PORT}/api/admin/backup" || \
  node -e "console.log('Run backup via panel Settings → Backup → Run backup now, or call POST /api/admin/backup while logged in')"
