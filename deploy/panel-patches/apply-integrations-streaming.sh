#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

cp "$PATCHES/integration-stream-url.ts" "$PANEL/src/lib/integration-stream-url.ts"
cp "$PATCHES/integration-playback.ts" "$PANEL/src/lib/integration-playback.ts"
cp "$PATCHES/integration-bouquet.ts" "$PANEL/src/lib/integration-bouquet.ts"
cp "$PATCHES/music-import.ts" "$PANEL/src/lib/music-import.ts"
cp "$PATCHES/media-integrations.ts" "$PANEL/src/lib/media-integrations.ts"
cp "$PATCHES/emby-jellyfin-import.ts" "$PANEL/src/lib/emby-jellyfin-import.ts"

python3 <<'PY'
from pathlib import Path

panel = Path("/home/nexlify-panel")

# line-playback.ts — resolve integration URLs at play time
lp = panel / "src/lib/line-playback.ts"
text = lp.read_text()
if "integration-stream-url" not in text:
    text = text.replace(
        'import { resolveStreamPlaybackUrl, type StreamWithProvider } from "@/lib/resolve-stream-url";',
        'import { resolveStreamPlaybackUrl, type StreamWithProvider } from "@/lib/resolve-stream-url";\n'
        'import { isIntegrationStreamUrl } from "@/lib/integration-stream-url";\n'
        'import { resolveIntegrationPlaybackUrl } from "@/lib/integration-playback";',
    )
    text = text.replace(
        "  let url = resolveStreamPlaybackUrl(stream as StreamWithProvider, `${lineId}:${stream.id}`);",
        "  let url: string;\n"
        "  if (isIntegrationStreamUrl(stream.streamUrl)) {\n"
        "    url =\n"
        "      (await resolveIntegrationPlaybackUrl(stream.streamUrl)) ??\n"
        "      stream.streamUrl;\n"
        "  } else {\n"
        "    url = resolveStreamPlaybackUrl(\n"
        "      stream as StreamWithProvider,\n"
        "      `${lineId}:${stream.id}`\n"
        "    );\n"
        "  }",
    )
    lp.write_text(text)

# integrations route — music sync + attach bouquet
route = panel / "src/app/api/admin/integrations/route.ts"
rt = route.read_text()
if "importMusicAddon" not in rt:
    rt = rt.replace(
        'import { importEmbyLibrary, importJellyfinLibrary } from "@/lib/emby-jellyfin-import";',
        'import { importEmbyLibrary, importJellyfinLibrary } from "@/lib/emby-jellyfin-import";\n'
        'import { importMusicAddon } from "@/lib/music-import";\n'
        'import { attachPluginBouquetToAllLines } from "@/lib/integration-bouquet";',
    )
    if "import { importEmbyLibrary" not in rt:
        rt = rt.replace(
            'import { importPlexLibrary, importYoutubeSource } from "@/lib/media-integrations";',
            'import { importPlexLibrary, importYoutubeSource } from "@/lib/media-integrations";\n'
            'import { importEmbyLibrary, importJellyfinLibrary } from "@/lib/emby-jellyfin-import";\n'
            'import { importMusicAddon } from "@/lib/music-import";\n'
            'import { attachPluginBouquetToAllLines } from "@/lib/integration-bouquet";',
        )

sync_block = """    const result =
      row.type === "plex"
        ? await importPlexLibrary(id, serverId)
        : row.type === "emby"
          ? await importEmbyLibrary(id, serverId)
          : row.type === "jellyfin"
            ? await importJellyfinLibrary(id, serverId)
            : await importYoutubeSource(id, serverId);
    return NextResponse.json(result);"""

new_sync = """    let result: Record<string, unknown>;
    if (row.type === "plex") {
      result = await importPlexLibrary(id, serverId);
    } else if (row.type === "emby") {
      result = await importEmbyLibrary(id, serverId);
    } else if (row.type === "jellyfin") {
      result = await importJellyfinLibrary(id, serverId);
    } else if (row.type in { spotify: 1, deezer: 1, youtube_music: 1 }) {
      result = await importMusicAddon(id, serverId);
    } else {
      result = await importYoutubeSource(id, serverId);
    }
    await attachPluginBouquetToAllLines();
    return NextResponse.json(result);"""

if sync_block in rt:
    rt = rt.replace(sync_block, new_sync)
elif "attachPluginBouquetToAllLines" not in rt:
    rt = rt.replace(
        "    return NextResponse.json(result);\n  }\n\n  const type = String(body.type ?? \"plex\");",
        "    await attachPluginBouquetToAllLines();\n"
        "    return NextResponse.json(result);\n  }\n\n  const type = String(body.type ?? \"plex\");",
    )

route.write_text(rt)

# music-integration-page — sync button
music = panel / "src/components/music-integration-page.tsx"
mt = music.read_text()
if "syncToPanel" not in mt:
    mt = mt.replace(
        """  async function testConnection() {
    if (!row) {
      setMsg("Save integration first.");
      return;
    }
    setMsg("Testing…");
    const res = await fetch("/api/admin/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test", id: row.id }),
    });
    const data = await res.json();
    setMsg(res.ok ? (data.message ?? "Connection OK") : (data.error ?? "Test failed"));
  }""",
        """  async function testConnection() {
    if (!row) {
      setMsg("Save integration first.");
      return;
    }
    setMsg("Testing…");
    const res = await fetch("/api/admin/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "test", id: row.id }),
    });
    const data = await res.json();
    setMsg(res.ok ? (data.message ?? "Connection OK") : (data.error ?? "Test failed"));
  }

  async function syncToPanel() {
    if (!row) {
      setMsg("Save integration first.");
      return;
    }
    setMsg("Syncing to panel streams…");
    const res = await fetch("/api/admin/integrations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "sync", id: row.id }),
    });
    const data = await res.json();
    if (!res.ok) {
      setMsg(data.error ?? "Sync failed");
      return;
    }
    setMsg(
      `Synced ${data.imported ?? 0} stream(s). Content is in the “Plugin imports” bouquet on all active lines.`
    );
    load();
  }""",
    )
    mt = mt.replace(
        """                <button
                  type="button"
                  className="rounded px-4 py-2 text-sm border cursor-pointer"
                  style={{ borderColor: "var(--border)" }}
                  onClick={testConnection}
                >
                  Test connection
                </button>""",
        """                <button
                  type="button"
                  className="rounded px-4 py-2 text-sm border cursor-pointer"
                  style={{ borderColor: "var(--border)" }}
                  onClick={testConnection}
                >
                  Test connection
                </button>
                <button
                  type="button"
                  className="btn-positive rounded px-4 py-2 text-sm cursor-pointer"
                  onClick={syncToPanel}
                >
                  Sync to panel
                </button>""",
    )
    mt = mt.replace(
        "<p>{addon.description}</p>",
        "<p>{addon.description}</p>\n"
        "          <p className=\"text-xs mt-2\" style={{ color: \"var(--muted)\" }}>\n"
        "            Use <strong>Sync to panel</strong> to import playable streams into the\n"
        "            <strong> Plugin imports</strong> bouquet (auto-attached to active lines).\n"
        "          </p>",
    )
    music.write_text(mt)

# Plex / YouTube / Emby pages — note about bouquet
for rel in [
    "src/app/admin/integrations/plex/page.tsx",
    "src/app/admin/integrations/youtube/page.tsx",
    "src/app/admin/integrations/emby/page.tsx",
    "src/app/admin/integrations/jellyfin/page.tsx",
]:
    p = panel / rel
    if not p.exists():
        continue
    t = p.read_text()
    if "Plugin imports" not in t and "sync library" in t.lower() or "Sync library" in t:
        t = t.replace(
            "Sync library",
            "Sync to panel",
        )
    if "Plugin imports" not in t and "Sync to panel" in t:
        t = t.replace(
            "</ul>",
            "      <p className=\"text-xs mt-4\" style={{ color: \"var(--muted)\" }}>\n"
            "        Sync adds streams to the <strong>Plugin imports</strong> bouquet on all active lines.\n"
            "      </p>\n"
            "      </ul>" if "</ul>" in t else "",
        )
    p.write_text(t)

print("integration streaming patch applied")
PY

cd "$PANEL"
npm run build
pm2 restart nexlify
