#!/usr/bin/env bash
# Export a full XUI.one MySQL dump suitable for Nexlify Panel migration.
#
# XUI.one does not ship a separate “backup script” for Nexlify — the official
# path is mysqldump of the panel database (usually named `xui`).
#
# Usage (run on the XUI host):
#   bash xui-export-backup.sh                 # DB=xui → ./xui-backup-YYYYMMDD.sql
#   bash xui-export-backup.sh xuione          # custom DB name
#   bash xui-export-backup.sh xui /tmp/xui.sql
#
# Then on Nexlify: Admin → Import → Panel migration → source XUI.one → upload.

set -euo pipefail

DB_NAME="${1:-xui}"
OUT="${2:-./xui-backup-$(date +%Y%m%d-%H%M%S).sql}"
MYSQL_USER="${MYSQL_USER:-root}"

echo "Exporting XUI database '${DB_NAME}' → ${OUT}"
echo "Using MySQL user '${MYSQL_USER}' (set MYSQL_USER / MYSQL_PWD if needed)."

# --complete-insert puts column names on every INSERT (required for accurate mapping).
# --single-transaction keeps InnoDB consistent without long locks.
mysqldump \
  -u "$MYSQL_USER" \
  ${MYSQL_PWD:+-p"$MYSQL_PWD"} \
  --single-transaction \
  --quick \
  --complete-insert \
  --routines=false \
  --triggers=false \
  --set-gtid-purged=OFF \
  "$DB_NAME" > "$OUT"

BYTES=$(wc -c < "$OUT" | tr -d ' ')
echo "Done: ${OUT} (${BYTES} bytes)"
echo
echo "Next on Nexlify:"
echo "  1. Admin → Import → Panel migration"
echo "  2. Source: XUI.one"
echo "  3. Upload this .sql → Preview → verify counts → Run import"
echo
echo "If your DB is not named 'xui', common alternatives: xuione, xuoione"
echo "  mysql -u root -e 'SHOW DATABASES;'"
