#!/usr/bin/env bash
# Hotfix stuck "Update worker crashed: Cannot find module panel-server" without using the UI updater.
# Run on customer VPS: bash /opt/nexlify-panel/scripts/fix-update-worker-now.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PANEL_INSTALL_BASE="${PANEL_INSTALL_BASE:-https://nexlify.live/install}"
_PV="$(bash "$ROOT/scripts/panel-version.sh" 2>/dev/null || echo 0)"
CACHE="${PANEL_CACHE_BUST:-v${_PV}}"

curl_vendor() {
  local url="$1" dest="$2"
  local ua="NexlifyPanelUpdater/1.0"
  if curl -fsSL -A "$ua" --retry 2 "$url" -o "$dest" 2>/dev/null; then return 0; fi
  local ip host path origin="${PANEL_INSTALL_BASE}/panel-vendor-origin.env"
  ip="${PANEL_VENDOR_IP:-}"
  host="${PANEL_VENDOR_HOST:-nexlify.live}"
  if [ -z "$ip" ] && curl -fsSL -A "$ua" "$origin" -o /tmp/nexlify-vendor-origin.env 2>/dev/null; then
    # shellcheck disable=SC1091
    source /tmp/nexlify-vendor-origin.env 2>/dev/null || true
    ip="${PANEL_VENDOR_IP:-}"
    host="${PANEL_VENDOR_HOST:-nexlify.live}"
  fi
  if [ -z "$ip" ]; then ip="${PANEL_VENDOR_IP:-85.17.162.54}"; fi
  if [[ "$url" == https://${host}* ]]; then path="${url#https://${host}}";
  elif [[ "$url" == https://nexlify.live* ]]; then path="${url#https://nexlify.live}"; fi
  if [ -n "$ip" ] && [ -n "$path" ]; then
    echo "WARN: CDN blocked — fetch via http://${ip}${path} (Host: ${host})" >&2
    curl -fsSL -A "$ua" "http://${ip}${path}" -H "Host: ${host}" -o "$dest"
    return $?
  fi
  return 1
}

echo "=== fix-update-worker-now (panel root: $ROOT) ==="

pkill -f 'panel-update-background' 2>/dev/null || true
rm -f .update-progress.pid .update-in-progress .update-progress.json

# Point PM2 / standalone runtime at the real install root (fixes pre-v1.9.11 bundled code).
for envfile in .env .next/standalone/.env; do
  if [ -f "$envfile" ]; then
    sed -i '/^PANEL_REPO_PATH=/d' "$envfile" 2>/dev/null || true
    echo "PANEL_REPO_PATH=$ROOT" >> "$envfile"
  fi
done

# Stale copy in standalone breaks module resolution for old worker scripts.
rm -rf .next/standalone/scripts 2>/dev/null || true

# Fix DB repoPath + disable auto-apply (stops retry loop on TDZ crash).
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
        console.log('Disabled panelUpdateAutoDownload (retry loop stopped)');
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
    } catch (e) { /* ignore */ }
  " "$ROOT" 2>/dev/null || true
fi

fetch_one() {
  local url="$1" dest="$2"
  mkdir -p "$(dirname "$dest")"
  if curl_vendor "$url" "${dest}.new"; then
    sed -i 's/\r$//' "${dest}.new" 2>/dev/null || true
    chmod +x "${dest}.new" 2>/dev/null || true
    mv "${dest}.new" "$dest"
    echo "Fetched $(basename "$dest")"
  fi
}

fetch_one "${PANEL_INSTALL_BASE}/scripts/panel-update-background.sh?${CACHE}" "$ROOT/scripts/panel-update-background.sh"
fetch_one "${PANEL_INSTALL_BASE}/scripts/panel-update-background.ts?${CACHE}" "$ROOT/scripts/panel-update-background.ts" 2>/dev/null || true
fetch_one "${PANEL_INSTALL_BASE}/scripts/ensure-prisma-client.sh?${CACHE}" "$ROOT/scripts/ensure-prisma-client.sh" 2>/dev/null || true

# Patch TDZ bug in panel-update.ts on pre-v1.9.14 installs ("Cannot access 'toVersion' before initialization")
if [ -f "$ROOT/src/lib/panel-update.ts" ]; then
  node -e "
    const fs = require('fs');
    const p = process.argv[1];
    let s = fs.readFileSync(p, 'utf8');
    if (s.includes('let toVersion = fromVersion')) process.exit(0);
    if (!s.includes('const { version: toVersion }')) process.exit(0);
    s = s.replace(
      /(const \\{ version: fromVersion \\} = await readInstalledVersion\\(repoPath\\);\\r?\\n)/g,
      '\$1  let toVersion = fromVersion;\\n'
    );
    s = s.replace(
      /const \\{ version: toVersion \\} = await readInstalledVersion\\(repoPath\\);/g,
      'toVersion = (await readInstalledVersion(repoPath)).version;'
    );
    fs.writeFileSync(p, s);
    console.log('Patched src/lib/panel-update.ts (toVersion TDZ fix)');
  " "$ROOT/src/lib/panel-update.ts" 2>/dev/null || true
fi

chmod +x "$ROOT/scripts/panel-update-background.sh" 2>/dev/null || true
sed -i 's/\r$//' "$ROOT"/scripts/*.sh 2>/dev/null || true

if [ -f "$ROOT/scripts/ensure-prisma-client.sh" ]; then
  bash "$ROOT/scripts/ensure-prisma-client.sh" || true
elif [ ! -d "$ROOT/node_modules/.prisma/client" ]; then
  echo "==> Generating Prisma client (required for update worker) ..."
  (cd "$ROOT" && unset DATABASE_URL 2>/dev/null; npx prisma generate) || true
fi

if ! command -v npx >/dev/null 2>&1 || ! npx tsx --version >/dev/null 2>&1; then
  echo "Installing tsx ..."
  npm install -g tsx 2>/dev/null || npm install -g tsx --prefix /usr/local 2>/dev/null || true
fi

if [ -f .update-progress.json ]; then
  echo "Cleared stale .update-progress.json"
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart nexlify 2>/dev/null || pm2 restart all 2>/dev/null || true
fi

echo "=== fix-update-worker-now OK — retry Admin → Settings → Updates ==="
