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
fetch() {
  local url="$1" dest="$2"
  if curl -fsSL "$url" -o "$dest.new"; then
    sed -i 's/\\r$//' "$dest.new" 2>/dev/null || true
    chmod +x "$dest.new"
    mv "$dest.new" "$dest"
    echo "OK: $dest"
    return 0
  fi
  echo "WARN: could not fetch $url" >&2
  return 1
}
fetch "$BASE/apply-panel-fast-update.sh?$BUST" "scripts/apply-panel-fast-update.sh" || true
fetch "$BASE/scripts/panel-restart-safe.sh?$BUST" "scripts/panel-restart-safe.sh" || true
fetch "$BASE/scripts/panel-update-recover.sh?$BUST" "scripts/panel-update-recover.sh" || true
fetch "$BASE/scripts/has-valid-next-build.sh?$BUST" "scripts/has-valid-next-build.sh" || true
sed -i 's/\\r$//' scripts/*.sh 2>/dev/null || true
chmod +x scripts/*.sh 2>/dev/null || true
echo "Bootstrap complete (vendor=$BASE cache=$BUST)"
`.trim();
}
