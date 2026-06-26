#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-vod-integration-export ==="

cp "$PATCHES/export-playback-url.ts" "$PANEL/src/lib/export-playback-url.ts"

mkdir -p "$PANEL/src/app/movie/[username]/[password]/[streamId]"
cp "$PATCHES/movie-playback-route.ts" "$PANEL/src/app/movie/[username]/[password]/[streamId]/route.ts"

python3 <<'PY'
from pathlib import Path

panel = Path("/home/nexlify-panel")

xt = panel / "src/lib/xtream.ts"
text = xt.read_text()

if "export-playback-url" not in text:
    text = text.replace(
        'import { resolveStreamPlaybackUrl } from "./resolve-stream-url";',
        'import { resolveStreamPlaybackUrl } from "./resolve-stream-url";\n'
        'import { exportPlaybackUrl } from "./export-playback-url";',
    )

text = text.replace(
    "export async function xtreamVodStreams(line: LineWithBouquets) {",
    "export async function xtreamVodStreams(line: LineWithBouquets, baseUrl: string) {",
)

text = text.replace(
    "      direct_source: resolveStreamPlaybackUrl(full),",
    "      direct_source: exportPlaybackUrl(baseUrl, line, s, full),",
)

old_m3u = """    const playUrl =
      s.type === StreamType.LIVE
        ? `${baseUrl}/live/${line.username}/${line.password}/${s.id}.ts`
        : resolveStreamPlaybackUrl(full);"""

new_m3u = """    const playUrl = exportPlaybackUrl(baseUrl, line, s, full);"""

if old_m3u in text:
    text = text.replace(old_m3u, new_m3u)
elif "exportPlaybackUrl(baseUrl, line, s, full)" not in text:
    raise SystemExit("xtream.ts: could not patch buildM3u playUrl block")

xt.write_text(text)
print("patched xtream.ts")

api = panel / "src/app/player_api.php/route.ts"
api_text = api.read_text()
if "xtreamVodStreams(line, baseUrl)" not in api_text:
    api_text = api_text.replace(
        "return NextResponse.json(await xtreamVodStreams(line));",
        "return NextResponse.json(await xtreamVodStreams(line, baseUrl));",
    )
    api.write_text(api_text)
    print("patched player_api.php/route.ts")
else:
    print("player_api already patched")

PY

if [[ "${SKIP_PANEL_BUILD:-}" != "1" ]]; then
  cd "$PANEL"
  npm run build
  pm2 restart nexlify
fi
echo "apply-vod-integration-export done"
