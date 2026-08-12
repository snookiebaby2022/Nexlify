#!/bin/bash
# Build a clean installer archive with only IPTV panel files
set -euo pipefail

SRC="/opt/nexlify-panel"
DEST="/tmp/nexlify-panel-clean"
ARCHIVE="/var/www/nexlify/public/downloads/nexlify-panel.tar.gz"

# Clean up
rm -rf "$DEST"
mkdir -p "$DEST"

# Essential files for IPTV panel
rsync -a --delete \
  --include='package.json' \
  --include='package-lock.json' \
  --include='.env.example' \
  --include='.nvmrc' \
  --include='next-env.d.ts' \
  --include='next.config.ts' \
  --include='tailwind.config.ts' \
  --include='postcss.config.mjs' \
  --include='tsconfig.json' \
  --include='ecosystem.config.cjs' \
  --include='release-notes.md' \
  --include='prisma/' \
  --include='prisma/**' \
  --include='src/' \
  --include='src/**' \
  --include='scripts/' \
  --include='scripts/install-linux.sh' \
  --include='scripts/set-admin-password.cjs' \
  --include='scripts/load-env.cjs' \
  --include='scripts/ensure-panel-env.sh' \
  --include='scripts/pm2-start.sh' \
  --include='scripts/pm2-boot-enable.sh' \
  --include='scripts/check-package.mjs' \
  --include='scripts/check-schema.mjs' \
  --include='scripts/prepare-standalone.sh' \
  --include='scripts/obfuscate-license.js' \
  --include='scripts/run-next.mjs' \
  --include='scripts/fix-panel-ip-login.sh' \
  --include='scripts/fix-panel-license-sync.sh' \
  --include='scripts/fix-panel-auto-update.sh' \
  --include='scripts/sync-license-env.mjs' \
  --include='scripts/verify-install-smoke.sh' \
  --include='scripts/panel-releases.json' \
  --include='public/' \
  --include='public/**' \
  --include='nginx/' \
  --include='nginx/nexlify-upstream.conf' \
  --include='nginx/panel.nexlify.live-http-only.conf' \
  --include='nginx/nexlify.conf' \
  --exclude='*' \
  "$SRC/" "$DEST/"

# Create archive
cd "$DEST"
tar czf "$ARCHIVE" .

# Report
echo "Archive created: $ARCHIVE"
ls -lh "$ARCHIVE"
echo "File count:"
find . -type f | wc -l

# Cleanup
rm -rf "$DEST"
