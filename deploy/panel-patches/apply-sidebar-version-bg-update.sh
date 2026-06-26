#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-sidebar-version-bg-update ==="

cp "$PATCHES/panel-update-job.ts" "$PANEL/src/lib/panel-update-job.ts"
cp "$PATCHES/panel-update.ts" "$PANEL/src/lib/panel-update.ts"
cp "$PATCHES/panel-update-background.ts" "$PANEL/scripts/panel-update-background.ts"
cp "$PATCHES/panel-sidebar.tsx" "$PANEL/src/components/panel-sidebar.tsx"
cp "$PATCHES/panel-sidebar-version.tsx" "$PANEL/src/components/panel-sidebar-version.tsx"
cp "$PATCHES/panel-update-progress.tsx" "$PANEL/src/components/panel-update-progress.tsx"
cp "$PATCHES/panel-shell.tsx" "$PANEL/src/components/panel-shell.tsx"

mkdir -p "$PANEL/src/app/admin/settings/updates"
cp "$PATCHES/admin-settings-updates-page.tsx" "$PANEL/src/app/admin/settings/updates/page.tsx"

mkdir -p "$PANEL/src/app/api/admin/panel-update"
cp "$PATCHES/panel-update-route.ts" "$PANEL/src/app/api/admin/panel-update/route.ts"

mkdir -p "$PANEL/src/app/api/panel/version"
cp "$PATCHES/api-panel-version/route.ts" "$PANEL/src/app/api/panel/version/route.ts"

# Append sidebar version + progress bar styles if not already present
if ! grep -q "panel-sidebar-version" "$PANEL/src/app/globals.css"; then
  cat >> "$PANEL/src/app/globals.css" <<'CSS'

.panel-sidebar-version {
  position: relative;
  z-index: 1;
  flex-shrink: 0;
  padding: 0.75rem 1rem 1rem;
  border-top: 1px solid rgba(34, 211, 238, 0.12);
  font-size: 0.7rem;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(148, 163, 184, 0.9);
  text-align: center;
}

.panel-update-progress {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 220;
  padding: 0 1rem 1rem;
  pointer-events: none;
}

.panel-update-progress-inner {
  pointer-events: auto;
  max-width: 42rem;
  margin: 0 auto;
  padding: 0.85rem 1rem 1rem;
  border-radius: 0.75rem;
  border: 1px solid rgba(34, 211, 238, 0.35);
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.97), rgba(8, 15, 30, 0.98));
  box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.45);
}

.panel-update-progress-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.panel-update-progress-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #e2e8f0;
}

.panel-update-progress-dismiss {
  border: none;
  background: transparent;
  color: rgba(148, 163, 184, 0.9);
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.15rem 0.35rem;
}

.panel-update-progress-track {
  height: 0.45rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.panel-update-progress-fill {
  height: 100%;
  border-radius: 999px;
  background: linear-gradient(90deg, #22c55e, #38bdf8);
  transition: width 0.4s ease;
}

.panel-update-progress-step {
  margin-top: 0.45rem;
  font-size: 0.75rem;
  color: rgba(203, 213, 225, 0.95);
  display: flex;
  justify-content: space-between;
  gap: 0.5rem;
}

.panel-update-progress-pct {
  font-family: ui-monospace, monospace;
  color: rgba(148, 163, 184, 0.95);
}

.panel-update-progress-hint {
  margin-top: 0.35rem;
  font-size: 0.7rem;
  color: rgba(148, 163, 184, 0.85);
}

.panel-update-progress-message {
  font-size: 0.8rem;
  color: #cbd5e1;
  margin: 0;
}

.panel-update-progress-message--error {
  color: #fca5a5;
}

.panel-update-progress-reload,
.panel-update-progress-link {
  color: #38bdf8;
  background: none;
  border: none;
  padding: 0;
  font-size: inherit;
  cursor: pointer;
  text-decoration: underline;
  text-underline-offset: 2px;
}
CSS
fi

grep -q '.update-progress.json' "$PANEL/.gitignore" 2>/dev/null || echo '.update-progress.json' >> "$PANEL/.gitignore"

cd "$PANEL"
npm run build
pm2 restart nexlify --update-env 2>/dev/null || true

echo "Sidebar version + background panel update with progress bar applied."
