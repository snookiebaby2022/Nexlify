#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-login-demo-hardening ==="

cp "$PATCHES/login-form.tsx" "$PANEL/src/components/login-form.tsx"
cp "$PATCHES/login-page.tsx" "$PANEL/src/app/login/page.tsx"

cd "$PANEL"
npm run build
pm2 restart nexlify --update-env 2>/dev/null || true

echo "Demo login hints now only show on panel.demo.nexlify.live."
