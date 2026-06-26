#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-panel-report ==="

cp "$PATCHES/panel-email.ts" "$PANEL/src/lib/panel-email.ts"
cp "$PATCHES/panel-report.ts" "$PANEL/src/lib/panel-report.ts"
cp "$PATCHES/panel-sidebar-report.tsx" "$PANEL/src/components/panel-sidebar-report.tsx"
cp "$PATCHES/panel-sidebar.tsx" "$PANEL/src/components/panel-sidebar.tsx"
cp "$PATCHES/panel-shell.tsx" "$PANEL/src/components/panel-shell.tsx"

mkdir -p "$PANEL/src/app/api/admin/panel-report"
cp "$PATCHES/panel-report-route.ts" "$PANEL/src/app/api/admin/panel-report/route.ts"

if ! grep -q '"nodemailer"' "$PANEL/package.json"; then
  node -e "
    const fs=require('fs');
    const p=JSON.parse(fs.readFileSync('$PANEL/package.json','utf8'));
    p.dependencies=p.dependencies||{};
    p.dependencies.nodemailer='6.10.1';
    p.devDependencies=p.devDependencies||{};
    p.devDependencies['@types/nodemailer']='6.4.17';
    fs.writeFileSync('$PANEL/package.json', JSON.stringify(p,null,2)+'\n');
  "
fi

if ! grep -q 'panel-sidebar-footer-actions' "$PANEL/src/app/globals.css"; then
  cat >> "$PANEL/src/app/globals.css" <<'CSS'

.panel-sidebar-footer-actions {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  padding: 0.35rem 0.5rem 0;
  border-top: 1px solid rgba(34, 211, 238, 0.08);
}

.panel-sidebar-report-btn {
  color: rgba(255, 255, 255, 0.88);
  background: transparent;
  border: none;
  transition: background 0.15s ease;
}

.panel-sidebar-report-btn:hover {
  background: rgba(251, 191, 36, 0.12);
}
CSS
fi

ENV_FILE="$PANEL/.env"
grep -q '^PANEL_REPORT_EMAIL=' "$ENV_FILE" 2>/dev/null || echo 'PANEL_REPORT_EMAIL=snookiebaby2022@gmail.com' >> "$ENV_FILE"

cd "$PANEL"
npm install --no-audit --no-fund
npm run build
pm2 restart nexlify --update-env 2>/dev/null || true

echo "Panel Report button installed. Set SMTP in .env or Admin → Settings → Notifications to send email."
