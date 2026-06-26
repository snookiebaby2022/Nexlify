#!/usr/bin/env bash
# Lazy WHMCS addon sync, proxy_plugins gating, Spotify/Apple Music relay.
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

echo "=== apply-plugin-upgrades ==="

cp "$PATCHES/plugin-entitlement.ts" "$PANEL/src/lib/plugin-entitlement.ts"
cp "$PATCHES/billing-addon-sync.ts" "$PANEL/src/lib/billing-addon-sync.ts"
cp "$PATCHES/music-relay.ts" "$PANEL/src/lib/music-relay.ts"
cp "$PATCHES/music-import.ts" "$PANEL/src/lib/music-import.ts"
cp "$PATCHES/integration-playback.ts" "$PANEL/src/lib/integration-playback.ts"
cp "$PATCHES/music-addons-catalog.ts" "$PANEL/src/lib/music-addons-catalog.ts"

python3 <<'PY'
from pathlib import Path

panel = Path("/home/nexlify-panel")

# --- proxies: require proxy_plugins license ---
proxies = panel / "src/app/api/admin/proxies/route.ts"
pt = proxies.read_text(encoding="utf-8")
if "pluginEntitlementResponse" not in pt:
    pt = pt.replace(
        'import { assertCanCreateLoadBalancer } from "@/lib/plan-limits";',
        'import { assertCanCreateLoadBalancer } from "@/lib/plan-limits";\n'
        'import { pluginEntitlementResponse } from "@/lib/plugin-entitlement";',
    )
    pt = pt.replace(
        "export async function GET() {",
        "export async function GET(req: NextRequest) {",
    )
    pt = pt.replace(
        "  if (!session) return NextResponse.json({ error: \"Forbidden\" }, { status: 403 });\n\n"
        "  const proxies = await prisma.streamProxy.findMany({",
        "  if (!session) return NextResponse.json({ error: \"Forbidden\" }, { status: 403 });\n"
        "  const host = (req.headers.get(\"host\") ?? \"localhost\").split(\":\")[0].toLowerCase();\n"
        "  const denied = await pluginEntitlementResponse(\"proxy_plugins\", host);\n"
        "  if (denied) return denied;\n\n"
        "  const proxies = await prisma.streamProxy.findMany({",
    )
    pt = pt.replace(
        "  const body = await req.json();\n"
        "  const limitErr = await assertCanCreateLoadBalancer();",
        "  const body = await req.json();\n"
        "  const host = (req.headers.get(\"host\") ?? \"localhost\").split(\":\")[0].toLowerCase();\n"
        "  const denied = await pluginEntitlementResponse(\"proxy_plugins\", host);\n"
        "  if (denied) return denied;\n\n"
        "  const limitErr = await assertCanCreateLoadBalancer();",
    )
    proxies.write_text(pt, encoding="utf-8")
    print("patched proxies/route.ts")

# --- integrations: apple_music sync + real music tests ---
integrations = panel / "src/app/api/admin/integrations/route.ts"
it = integrations.read_text(encoding="utf-8")

if "from \"@/lib/music-relay\"" not in it:
    it = it.replace(
        'import { importMusicAddon } from "@/lib/music-import";',
        'import { importMusicAddon } from "@/lib/music-import";\n'
        'import { testAppleMusicConnection, testSpotifyConnection } from "@/lib/music-relay";',
    )

if 'message: `${addon.name} credentials stored' in it:
    it = it.replace(
        "    return NextResponse.json({\n"
        "      message: `${addon.name} credentials stored. Complete OAuth on your relay server to stream.`,\n"
        "    });",
        "    try {\n"
        "      if (row.type === \"spotify\") {\n"
        "        return NextResponse.json({ message: await testSpotifyConnection(cfg) });\n"
        "      }\n"
        "      if (row.type === \"apple_music\") {\n"
        "        return NextResponse.json({ message: await testAppleMusicConnection(cfg) });\n"
        "      }\n"
        "    } catch (e) {\n"
        "      return NextResponse.json(\n"
        "        { error: e instanceof Error ? e.message : \"Test failed\" },\n"
        "        { status: 400 }\n"
        "      );\n"
        "    }\n"
        "    return NextResponse.json({ message: `${addon.name} credentials stored.` });",
    )
    print("patched integrations test handler")

if 'apple_music: 1' not in it and 'spotify: 1, deezer: 1, youtube_music: 1' in it:
    it = it.replace(
        "row.type in { spotify: 1, deezer: 1, youtube_music: 1 }",
        "row.type in { spotify: 1, apple_music: 1, deezer: 1, youtube_music: 1 }",
    )
    print("patched integrations sync for apple_music")

integrations.write_text(it, encoding="utf-8")

# --- license activation: sync WHMCS addons ---
state = panel / "src/lib/license/state.ts"
st = state.read_text(encoding="utf-8")
if "syncAddonLicensesFromBilling" not in st:
    marker = "  await saveLicenseActivation(key, payload, instanceId);\n\n  return {"
    if marker in st:
        st = st.replace(
            marker,
            "  await saveLicenseActivation(key, payload, instanceId);\n\n"
            "  try {\n"
            "    const { syncAddonLicensesFromBilling } = await import(\"@/lib/billing-addon-sync\");\n"
            "    await syncAddonLicensesFromBilling(key);\n"
            "  } catch {\n"
            "    /* optional billing addon sync */\n"
            "  }\n\n"
            "  return {",
        )
        state.write_text(st, encoding="utf-8")
        print("patched license/state.ts activation sync")

print("apply-plugin-upgrades patches done")
PY

bash "$PATCHES/apply-vod-integration-export.sh"
