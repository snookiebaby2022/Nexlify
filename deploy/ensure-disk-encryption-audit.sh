#!/usr/bin/env bash
# Audit LUKS / encrypted volumes; warn when data dirs are on plain disks.
set -euo pipefail

APP_DIR="${APP_DIR:-/var/www/nexlify}"
STATUS_FILE="${APP_DIR}/data/.disk-encryption-audit.json"

echo "=== ensure-disk-encryption-audit ==="

luks_detected="false"
if command -v lsblk >/dev/null 2>&1 && lsblk -f 2>/dev/null | grep -qi crypt; then
  luks_detected="true"
  echo "  LUKS encrypted block device detected"
else
  echo "  WARN: no LUKS volume detected — enable provider disk encryption or add an encrypted data volume (see deploy/SECURITY.md)"
fi

pg_mount="$(df /var/lib/postgresql 2>/dev/null | tail -1 | awk '{print $6}' || echo unknown)"
app_mount="$(df "$APP_DIR/data" 2>/dev/null | tail -1 | awk '{print $6}' || echo unknown)"

mkdir -p "$APP_DIR/data"
node -e "
const fs=require('fs');
const out={
  checkedAt:new Date().toISOString(),
  luksDetected:'$luks_detected'==='true',
  postgresMount:'$pg_mount',
  appDataMount:'$app_mount',
  recommendation:'Enable VPS provider volume encryption or LUKS for /var/lib/postgresql and app data.'
};
fs.writeFileSync('$STATUS_FILE', JSON.stringify(out,null,2)+'\n');
console.log('  audit written:', '$STATUS_FILE');
" 2>/dev/null || echo "  audit: luks=$luks_detected pg=$pg_mount app=$app_mount"

echo "ensure-disk-encryption-audit done."
