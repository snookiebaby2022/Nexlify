#!/usr/bin/env bash
# Safe cleanup on vendor VPS — removes temp/backup artifacts, keeps secrets + builds.
# Run as root: bash /home/nexlify-panel/scripts/nexlify-vps-cleanup.sh

set -uo pipefail

FREED=0
removed() { echo "  removed: $*"; FREED=$((FREED + 1)); }

echo "=== Nexlify VPS cleanup ==="

# Temp staging dirs
for d in /tmp/nexlify-publish-* /tmp/marketing-full-drop-in /tmp/mk-bundle.tgz; do
  [ -e "$d" ] && rm -rf "$d" && removed "$d"
done

# Old .env backups (keep newest 2 per app)
for envdir in /var/www/nexlify /home/nexlify-panel /opt/nexlify-panel; do
  [ -d "$envdir" ] || continue
  ls -t "$envdir"/.env.backup.* 2>/dev/null | tail -n +3 | while read -r f; do
    rm -f "$f" && removed "$f"
  done
done

# nginx config backups (keep newest 2)
for f in /etc/nginx/sites-enabled/*.bak.*; do
  [ -f "$f" ] || continue
done
for conf in /etc/nginx/sites-enabled/nexlify.live*; do
  [ -f "$conf" ] || continue
  ls -t "${conf}.bak."* 2>/dev/null | tail -n +3 | while read -r f; do
    rm -f "$f" && removed "$f"
  done
done

# npm cache (safe)
if command -v npm >/dev/null 2>&1; then
  npm cache clean --force >/dev/null 2>&1 && echo "  npm cache cleaned"
fi

# Stale PM2 logs (truncate, don't delete process list)
if command -v pm2 >/dev/null 2>&1; then
  pm2 flush >/dev/null 2>&1 && echo "  PM2 logs flushed"
fi

# Old root deploy bundles (keep newest vps-full-update)
ls -t /root/vps-full-update.sh.bak.* 2>/dev/null | tail -n +2 | while read -r f; do
  rm -f "$f" && removed "$f"
done

# Panel dist on VPS (rebuilt by publish-panel-release)
for d in /home/nexlify-panel/dist /opt/nexlify-panel/dist; do
  if [ -d "$d" ] && [ -f "$d/nexlify-panel.tar.gz" ]; then
    # tarball is published to marketing public/downloads — dist copy optional
    :
  fi
done

echo ""
echo "=== Verify canonical paths ==="
for path in \
  /var/www/nexlify/.env \
  /var/www/nexlify/.next/BUILD_ID \
  /var/www/nexlify/public/downloads/nexlify-panel.tar.gz \
  /home/nexlify-panel/.env \
  /home/nexlify-panel/.next/BUILD_ID; do
  [ -e "$path" ] && echo "  OK $path" || echo "  -- missing (may be OK): $path"
done

echo ""
echo "Cleanup done ($FREED items removed)."
echo "Run: bash /root/nexlify-full-platform-audit.sh"
