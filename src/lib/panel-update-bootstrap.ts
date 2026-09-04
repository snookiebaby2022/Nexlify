import { readFile } from "fs/promises";
import path from "path";

/** Vendor install base — panels pull patch scripts from here before every update. */
export const PANEL_VENDOR_INSTALL_BASE = (() => {
  const direct = process.env.NEXLIFY_VENDOR_INSTALL_URL?.trim();
  if (direct) return direct.replace(/\/$/, "");
  const vendor = process.env.NEXLIFY_VENDOR_URL?.trim()?.replace(/\/$/, "");
  return vendor ? `${vendor}/install` : "https://nexlify.live/install";
})();

/** Cache-bust query for vendor downloads (override with PANEL_CACHE_BUST env). */
export function panelUpdateCacheBust(version?: string): string {
  const fromEnv = process.env.PANEL_CACHE_BUST?.trim();
  if (fromEnv) return fromEnv;
  if (version) return `v${version.replace(/\./g, "")}`;
  return "v166";
}

/** Read installed version for cache bust when bootstrapping. */
export async function readPanelVersionForCacheBust(repoPath: string): Promise<string | undefined> {
  try {
    const raw = await readFile(path.join(repoPath, "package.json"), "utf8");
    const pkg = JSON.parse(raw) as { version?: string };
    return pkg.version?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/**
 * Shell run on the VPS before sync — fetches latest patch scripts from nexlify.live
 * so old panels (5MB check, bad verify, etc.) self-heal without manual hotfix.
 */
export function buildBootstrapUpdateScriptsShell(repoPath: string, cacheBust: string): string {
  const base = PANEL_VENDOR_INSTALL_BASE.replace(/'/g, "'\\''");
  const root = repoPath.replace(/'/g, "'\\''");
  const bust = cacheBust.replace(/'/g, "'\\''");

  return `
set -euo pipefail
cd '${root}'
mkdir -p scripts
BASE='${base}'
BUST='${bust}'
GH='https://raw.githubusercontent.com/snookiebaby2022/Nexlify/main'
ORIGIN_IP='${(process.env.PANEL_VENDOR_IP || "85.17.162.54").replace(/'/g, "").replace(/\r/g, "").trim()}'
ORIGIN_IP="\${ORIGIN_IP//\$'\\r'/}"
fetch() {
  local url="$1" dest="$2"
  if curl -fsSL "$url" -o "$dest.new"; then
    sed -i 's/\\r$//' "$dest.new" 2>/dev/null || true
    chmod +x "$dest.new"
    mv "$dest.new" "$dest"
    echo "OK: $dest"
    return 0
  fi
  return 1
}
fetch_vendor() {
  local rel="$1" dest="$2"
  fetch "$BASE/$rel?$BUST" "$dest" && return 0
  local host path
  host='nexlify.live'
  path="/install/$rel"
  curl -fsS --max-time 60 --resolve "\${host}:443:\${ORIGIN_IP}" "https://\${host}\${path}?$BUST" -o "$dest.new" 2>/dev/null || return 1
  sed -i 's/\\r$//' "$dest.new" 2>/dev/null || true
  chmod +x "$dest.new"
  mv "$dest.new" "$dest"
  echo "OK origin: $dest"
}
fetch_gh() {
  local rel="$1" dest="$2"
  fetch "$GH/$rel" "$dest"
}
fetch_vendor scripts/apply-nexlify-prebuilt.sh scripts/apply-nexlify-prebuilt.sh || fetch_gh scripts/apply-nexlify-prebuilt.sh scripts/apply-nexlify-prebuilt.sh || true
fetch_vendor scripts/ensure-prisma-client.sh scripts/ensure-prisma-client.sh || fetch_gh scripts/ensure-prisma-client.sh scripts/ensure-prisma-client.sh || true
fetch_vendor apply-panel-fast-update.sh scripts/apply-panel-fast-update.sh || fetch_gh scripts/apply-panel-fast-update.sh scripts/apply-panel-fast-update.sh || true
fetch_vendor apply-prebuilt-update.sh scripts/apply-prebuilt-update.sh || fetch_vendor scripts/apply-prebuilt-update.sh scripts/apply-prebuilt-update.sh || fetch_gh scripts/apply-prebuilt-update.sh scripts/apply-prebuilt-update.sh || true
fetch_vendor scripts/playback-topology.sh scripts/playback-topology.sh || fetch_gh scripts/playback-topology.sh scripts/playback-topology.sh || true
fetch_vendor scripts/panel-no-local-iptv-edge.sh scripts/panel-no-local-iptv-edge.sh || fetch_gh scripts/panel-no-local-iptv-edge.sh scripts/panel-no-local-iptv-edge.sh || true
fetch_vendor scripts/verify-live-no-redirect.sh scripts/verify-live-no-redirect.sh || fetch_gh scripts/verify-live-no-redirect.sh scripts/verify-live-no-redirect.sh || true
fetch_vendor scripts/apply-live-edge-topology.sh scripts/apply-live-edge-topology.sh || fetch_gh scripts/apply-live-edge-topology.sh scripts/apply-live-edge-topology.sh || true
fetch_vendor scripts/panel-restart-safe.sh scripts/panel-restart-safe.sh || fetch_gh scripts/panel-restart-safe.sh scripts/panel-restart-safe.sh || true
fetch_vendor scripts/panel-update-recover.sh scripts/panel-update-recover.sh || fetch_gh scripts/panel-update-recover.sh scripts/panel-update-recover.sh || true
fetch_vendor scripts/has-valid-next-build.sh scripts/has-valid-next-build.sh || fetch_gh scripts/has-valid-next-build.sh scripts/has-valid-next-build.sh || true
fetch_vendor scripts/panel-update-background.sh scripts/panel-update-background.sh || fetch_gh scripts/panel-update-background.sh scripts/panel-update-background.sh || true
fetch_vendor scripts/panel-update-background.ts scripts/panel-update-background.ts || fetch_gh scripts/panel-update-background.ts scripts/panel-update-background.ts || true
fetch_vendor scripts/ensure-nginx-panel-hold.sh scripts/ensure-nginx-panel-hold.sh || fetch_gh scripts/ensure-nginx-panel-hold.sh scripts/ensure-nginx-panel-hold.sh || true
fetch_vendor scripts/nexlify-streaming-guard.sh scripts/nexlify-streaming-guard.sh || fetch_gh scripts/nexlify-streaming-guard.sh scripts/nexlify-streaming-guard.sh || true
fetch_vendor scripts/nexlify-watchdog.sh scripts/nexlify-watchdog.sh || fetch_gh scripts/nexlify-watchdog.sh scripts/nexlify-watchdog.sh || true
sed -i 's/\\r$//' scripts/*.sh 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true
echo "Bootstrap complete (github+vendor=$BASE cache=$BUST)"
`.trim();
}
