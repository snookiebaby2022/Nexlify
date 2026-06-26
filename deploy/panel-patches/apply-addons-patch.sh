#!/usr/bin/env bash
# Apply addons UI changes: remove API, add Emby + Jellyfin
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

cp "$PATCHES/addons-page.tsx" "$PANEL/src/app/admin/addons/page.tsx"
cp "$PATCHES/plugin-entitlement.ts" "$PANEL/src/lib/plugin-entitlement.ts"
cp "$PATCHES/addon-license-services.ts" "$PANEL/src/lib/addon-license-services.ts"
cp "$PATCHES/emby-jellyfin-import.ts" "$PANEL/src/lib/emby-jellyfin-import.ts"

mkdir -p "$PANEL/src/app/admin/integrations/emby"
mkdir -p "$PANEL/src/app/admin/integrations/jellyfin"
cp "$PATCHES/integration-emby-page.tsx" "$PANEL/src/app/admin/integrations/emby/page.tsx"
cp "$PATCHES/integration-jellyfin-page.tsx" "$PANEL/src/app/admin/integrations/jellyfin/page.tsx"

python3 <<'PY'
from pathlib import Path

panel = Path("/home/nexlify-panel")

nav = panel / "src/lib/admin-sidebar-nav.tsx"
text = nav.read_text()
text = text.replace('          { href: "/admin/api", label: "API" },\n', "")
if 'integrations/emby' not in text:
    text = text.replace(
        '          { href: "/admin/integrations/plex", label: "Plex" },\n',
        '          { href: "/admin/integrations/plex", label: "Plex" },\n'
        '          { href: "/admin/integrations/emby", label: "Emby" },\n'
        '          { href: "/admin/integrations/jellyfin", label: "Jellyfin" },\n',
    )
nav.write_text(text)

route = panel / "src/app/api/admin/integrations/route.ts"
rt = route.read_text()
if "importEmbyLibrary" not in rt:
    rt = rt.replace(
        'import { importPlexLibrary, importYoutubeSource } from "@/lib/media-integrations";',
        'import { importPlexLibrary, importYoutubeSource } from "@/lib/media-integrations";\n'
        'import { importEmbyLibrary, importJellyfinLibrary } from "@/lib/emby-jellyfin-import";',
    )
    rt = rt.replace(
        """    const result =
      row.type === "plex"
        ? await importPlexLibrary(id, serverId)
        : await importYoutubeSource(id, serverId);""",
        """    const result =
      row.type === "plex"
        ? await importPlexLibrary(id, serverId)
        : row.type === "emby"
          ? await importEmbyLibrary(id, serverId)
          : row.type === "jellyfin"
            ? await importJellyfinLibrary(id, serverId)
            : await importYoutubeSource(id, serverId);""",
    )
route.write_text(rt)

tools = panel / "src/app/admin/management/tools/page.tsx"
if tools.exists():
    tt = tools.read_text()
    if "integrations/emby" not in tt:
        tt = tt.replace(
            '  { href: "/admin/integrations/plex", label: "Plex import", desc: "Plex library → VOD streams" },\n',
            '  { href: "/admin/integrations/plex", label: "Plex import", desc: "Plex library → VOD streams" },\n'
            '  { href: "/admin/integrations/emby", label: "Emby", desc: "Emby library → VOD streams" },\n'
            '  { href: "/admin/integrations/jellyfin", label: "Jellyfin", desc: "Jellyfin library → VOD streams" },\n',
        )
    tools.write_text(tt)

print("addons patch applied")
PY

cd "$PANEL"
npm run build
pm2 restart nexlify
