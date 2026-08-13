#!/usr/bin/env bash
# EMERGENCY: customer panel stuck on v1.9.7–v1.9.13 with
#   "Cannot access 'toVersion' before initialization"
#
# Run ON THE CUSTOMER VPS (not the vendor server at panel.nexlify.live):
#   curl -fsSL 'http://85.17.162.54/install/scripts/fix-stuck-customer-panel.sh' -H 'Host: nexlify.live' | bash
#
# Or after SSH:
#   bash /opt/nexlify-panel/scripts/fix-stuck-customer-panel.sh
set -euo pipefail

PANEL_VENDOR_IP="${PANEL_VENDOR_IP:-85.17.162.54}"
PANEL_VENDOR_HOST="${PANEL_VENDOR_HOST:-nexlify.live}"
PANEL_INSTALL_BASE="${PANEL_INSTALL_BASE:-https://nexlify.live/install}"

find_panel_root() {
  local dir="${1:-$(pwd)}"
  while [ -n "$dir" ] && [ "$dir" != "/" ]; do
    if [ -f "$dir/package.json" ] && [ -f "$dir/src/lib/panel-update.ts" ]; then
      echo "$dir"
      return 0
    fi
    if [[ "$dir" == *"/.next/standalone" ]]; then
      dir="$(cd "$dir/../../.." && pwd)"
      continue
    fi
    dir="$(dirname "$dir")"
  done
  for candidate in /home/nexlify-panel /opt/nexlify-panel; do
    if [ -f "$candidate/src/lib/panel-update.ts" ]; then
      echo "$candidate"
      return 0
    fi
  done
  return 1
}

ROOT="${PANEL_ROOT:-}"
if [ -z "$ROOT" ] && [ -f "$(dirname "$0")/../src/lib/panel-update.ts" ]; then
  ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fi
if [ -z "$ROOT" ]; then
  ROOT="$(find_panel_root "$(pwd)" || true)"
fi
if [ -z "$ROOT" ] || [ ! -f "$ROOT/src/lib/panel-update.ts" ]; then
  echo "ERROR: could not find panel install root (need src/lib/panel-update.ts)" >&2
  exit 1
fi
cd "$ROOT"

echo "=========================================="
echo " EMERGENCY customer panel fix"
echo " Root: $ROOT"
echo "=========================================="

curl_origin() {
  local path="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  curl -fsSL -A "NexlifyPanelUpdater/1.0" \
    "http://${PANEL_VENDOR_IP}${path}" -H "Host: ${PANEL_VENDOR_HOST}" \
    -o "${dest}.new"
  sed -i 's/\r$//' "${dest}.new" 2>/dev/null || true
  chmod +x "${dest}.new" 2>/dev/null || true
  mv "${dest}.new" "$dest"
}

patch_tdz() {
  local target="$ROOT/src/lib/panel-update.ts"
  [ -f "$target" ] || return 0
  node -e "
    const fs = require('fs');
    const p = process.argv[1];
    let s = fs.readFileSync(p, 'utf8');
    if (s.includes('let toVersion = fromVersion')) {
      console.log('TDZ patch already applied');
      process.exit(0);
    }
    if (!s.includes('const { version: toVersion }')) {
      console.log('WARN: panel-update.ts has no const toVersion — may already be fixed');
      process.exit(0);
    }
    s = s.replace(
      /(const \\{ version: fromVersion \\} = await readInstalledVersion\\(repoPath\\);\\r?\\n)/g,
      '\$1  let toVersion = fromVersion;\\n'
    );
    s = s.replace(
      /const \\{ version: toVersion \\} = await readInstalledVersion\\(repoPath\\);/g,
      'toVersion = (await readInstalledVersion(repoPath)).version;'
    );
    if (!s.includes('let toVersion = fromVersion')) {
      console.error('TDZ patch failed — unexpected panel-update.ts shape');
      process.exit(1);
    }
    fs.writeFileSync(p, s);
    console.log('Patched src/lib/panel-update.ts (toVersion TDZ fix)');
  " "$target"
}

stop_update_loop() {
  echo "-> Stopping background update worker and auto-apply loop ..."
  pkill -f 'panel-update-background' 2>/dev/null || true
  rm -f .update-progress.pid .update-in-progress .update-progress.json

  for envfile in .env .next/standalone/.env; do
    if [ -f "$envfile" ]; then
      sed -i '/^PANEL_REPO_PATH=/d' "$envfile" 2>/dev/null || true
      echo "PANEL_REPO_PATH=$ROOT" >> "$envfile"
    fi
  done
  rm -rf .next/standalone/scripts 2>/dev/null || true

  if [ -f data/panel.db ]; then
    node -e "
      const { execSync } = require('child_process');
      const db = 'data/panel.db';
      const root = process.argv[1];
      try {
        const raw = execSync(\"sqlite3 \" + db + \" \\\"SELECT value FROM PanelSetting WHERE key='server';\\\"\", { encoding: 'utf8' }).trim();
        if (!raw) process.exit(0);
        const j = JSON.parse(raw);
        let changed = false;
        if (j.panelUpdateAutoDownload !== false) {
          j.panelUpdateAutoDownload = false;
          changed = true;
          console.log('Disabled panelUpdateAutoDownload in panel.db (stops retry loop)');
        }
        const rp = String(j.repoPath || '').trim();
        if (!rp || rp.includes('/.next/standalone') || rp.endsWith('/standalone') || rp !== root) {
          j.repoPath = root;
          changed = true;
          console.log('Fixed server.repoPath in panel.db →', root);
        }
        if (changed) {
          const esc = JSON.stringify(j).replace(/'/g, \"''\");
          execSync(\"sqlite3 \" + db + \" \\\"UPDATE PanelSetting SET value='\" + esc + \"' WHERE key='server';\\\"\");
        }
      } catch (e) {
        console.warn('Could not update panel.db:', e.message);
      }
    " "$ROOT" 2>/dev/null || true
  fi
}

echo "-> Step 1: stop auto-apply loop and patch TDZ bug locally ..."
stop_update_loop
patch_tdz

echo "-> Step 2: fetch latest repair scripts (origin IP, bypasses Cloudflare) ..."
for pair in \
  "/install/scripts/fix-update-worker-now.sh scripts/fix-update-worker-now.sh" \
  "/install/scripts/fix-all-customer-updates.sh scripts/fix-all-customer-updates.sh" \
  "/install/apply-panel-fast-update.sh scripts/apply-panel-fast-update.sh" \
  "/install/panel-vendor-origin.env scripts/panel-vendor-origin.env"; do
  path="${pair%% *}"
  dest="${pair#* }"
  if curl_origin "$path" "$ROOT/$dest" 2>/dev/null; then
    echo "   Fetched $(basename "$dest")"
  else
    echo "   WARN: could not fetch $path (continuing with local files)"
  fi
done

# Symlink apply-panel-fast-update at install root if scripts copy exists
if [ -f "$ROOT/scripts/apply-panel-fast-update.sh" ] && [ ! -f "$ROOT/scripts/../apply-panel-fast-update.sh" ]; then
  ln -sf "$ROOT/scripts/apply-panel-fast-update.sh" "$ROOT/apply-panel-fast-update.sh" 2>/dev/null || \
    cp -f "$ROOT/scripts/apply-panel-fast-update.sh" "$ROOT/apply-panel-fast-update.sh" 2>/dev/null || true
fi

if [ -f "$ROOT/scripts/fix-all-customer-updates.sh" ]; then
  echo "-> Step 3: full repair (sync + build from vendor tarball) ..."
  export PANEL_VENDOR_IP PANEL_VENDOR_HOST PANEL_INSTALL_BASE
  bash "$ROOT/scripts/fix-all-customer-updates.sh"
else
  echo "-> Step 3: worker hotfix only (could not fetch fix-all-customer-updates.sh) ..."
  if [ -f "$ROOT/scripts/fix-update-worker-now.sh" ]; then
    bash "$ROOT/scripts/fix-update-worker-now.sh"
  fi
  echo ""
  echo "=========================================="
  echo " TDZ patched + auto-apply OFF."
  echo " Reload Admin → Settings → Updates."
  echo " Re-enable auto-apply after update succeeds."
  echo "=========================================="
fi
