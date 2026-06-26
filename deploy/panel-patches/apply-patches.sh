#!/bin/bash
# Apply stream-billing plan limits + demo license patches to IPTV panel on VPS.
set -euo pipefail

PANEL_DIR="${PANEL_DIR:-/home/nexlify-panel}"
PATCH_DIR="$(cd "$(dirname "$0")" && pwd)"

if [ ! -d "$PANEL_DIR/src/lib" ]; then
  echo "FAIL: panel not found at $PANEL_DIR"
  exit 1
fi

echo "=== apply panel patches ($PANEL_DIR) ==="

cp "$PATCH_DIR/plan-limits.ts" "$PANEL_DIR/src/lib/plan-limits.ts"
cp "$PATCH_DIR/plugin-entitlement.ts" "$PANEL_DIR/src/lib/plugin-entitlement.ts"

# panel-demo-host (from deploy/panel-demo if present)
APP_DIR="${APP_DIR:-/var/www/nexlify}"
if [ -f "$APP_DIR/deploy/panel-demo/panel-demo-host.ts" ]; then
  cp "$APP_DIR/deploy/panel-demo/panel-demo-host.ts" "$PANEL_DIR/src/lib/panel-demo-host.ts"
fi
if [ -f "$APP_DIR/deploy/panel-demo/panel-demo-mode.ts" ]; then
  cp "$APP_DIR/deploy/panel-demo/panel-demo-mode.ts" "$PANEL_DIR/src/lib/panel-demo-mode.ts"
fi

python3 <<'PY'
from pathlib import Path

panel = Path("/home/nexlify-panel")

# --- license/state.ts: demo exempt + store plan limits on activation ---
state = panel / "src/lib/license/state.ts"
text = state.read_text(encoding="utf-8")

demo_block = '''  if (isPanelLicenseExempt(panelHost)) {
    return {
      valid: true,
      trial: false,
      licensed: true,
      tier: "demo",
      termLabel: "Demo sandbox",
      expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

'''

if "Demo sandbox" not in text:
    marker = "export async function getLicenseStatus(panelHost: string): Promise<LicenseStatus> {"
    if marker not in text:
        raise SystemExit("getLicenseStatus not found")
    text = text.replace(marker, marker + "\n" + demo_block)

store_block = '''  const { limitsFromSlug, limitsFromMaxServers, storePlanLimits } = await import("@/lib/plan-limits");
  const limits =
    payload.maxServers != null && payload.maxServers > 0
      ? limitsFromMaxServers(payload.maxServers)
      : limitsFromSlug(payload.tier);
  await storePlanLimits(limits);

'''
if "storePlanLimits" not in text:
    needle = "  await prisma.panelSetting.upsert({\n    where: { key: STATE_KEY },"
    if needle not in text:
        raise SystemExit("saveLicenseActivation upsert not found")
    text = text.replace(needle, store_block + needle)

state.write_text(text, encoding="utf-8")
print("patched license/state.ts")

# --- servers POST: enforce main server limit ---
servers = panel / "src/app/api/admin/servers/route.ts"
st = servers.read_text(encoding="utf-8")
if "assertCanCreateMainServer" not in st:
    if 'import { PanelRole } from "@prisma/client";' not in st:
        raise SystemExit("servers route import block missing")
    st = st.replace(
        'import { PanelRole } from "@prisma/client";',
        'import { PanelRole } from "@prisma/client";\nimport { assertCanCreateMainServer } from "@/lib/plan-limits";',
    )
    st = st.replace(
        "  await ensurePanelCategory();\n",
        "  const limitErr = await assertCanCreateMainServer();\n"
        "  if (limitErr) return NextResponse.json({ error: limitErr }, { status: 403 });\n\n"
        "  await ensurePanelCategory();\n",
    )
    servers.write_text(st, encoding="utf-8")
    print("patched servers/route.ts")

# --- proxies POST: enforce load balancer limit ---
proxies = panel / "src/app/api/admin/proxies/route.ts"
pt = proxies.read_text(encoding="utf-8")
if "assertCanCreateLoadBalancer" not in pt:
    pt = pt.replace(
        'import { PanelRole } from "@prisma/client";',
        'import { PanelRole } from "@prisma/client";\nimport { assertCanCreateLoadBalancer } from "@/lib/plan-limits";',
    )
    pt = pt.replace(
        "  const body = await req.json();\n  const proxy = await prisma.streamProxy.create({",
        "  const body = await req.json();\n"
        "  const limitErr = await assertCanCreateLoadBalancer();\n"
        "  if (limitErr) return NextResponse.json({ error: limitErr }, { status: 403 });\n\n"
        "  const proxy = await prisma.streamProxy.create({",
    )
    proxies.write_text(pt, encoding="utf-8")
    print("patched proxies/route.ts")

# --- integrations POST/PATCH: plugin entitlement ---
integrations = panel / "src/app/api/admin/integrations/route.ts"
it = integrations.read_text(encoding="utf-8")
if "pluginEntitlementResponse" not in it:
    it = it.replace(
        'import { musicAddonById } from "@/lib/music-addons-catalog";',
        'import { musicAddonById } from "@/lib/music-addons-catalog";\n'
        'import { pluginEntitlementResponse } from "@/lib/plugin-entitlement";',
    )
    it = it.replace(
        "export async function POST(req: NextRequest) {\n"
        "  const session = await requireSession([PanelRole.ADMIN]);\n"
        "  if (!session) return NextResponse.json({ error: \"Forbidden\" }, { status: 403 });\n"
        "  const body = await req.json();\n",
        "export async function POST(req: NextRequest) {\n"
        "  const session = await requireSession([PanelRole.ADMIN]);\n"
        "  if (!session) return NextResponse.json({ error: \"Forbidden\" }, { status: 403 });\n"
        "  const body = await req.json();\n"
        "  const host = (req.headers.get(\"host\") ?? \"localhost\").split(\":\")[0].toLowerCase();\n",
    )
    # Gate mutating actions (not test-only reads)
    it = it.replace(
        '  if (body.action === "test") {',
        '  const pluginType = String(body.type ?? body.action === "sync" ? '
        '(await prisma.mediaIntegration.findUnique({ where: { id: String(body.id) } }))?.type ?? "plex" : "plex");\n'
        '  if (body.action !== "test") {\n'
        '    const denied = await pluginEntitlementResponse(pluginType, host);\n'
        '    if (denied) return denied;\n'
        '  }\n\n'
        '  if (body.action === "test") {',
    )
    it = it.replace(
        "export async function PATCH(req: NextRequest) {\n"
        "  const session = await requireSession([PanelRole.ADMIN]);\n"
        "  if (!session) return NextResponse.json({ error: \"Forbidden\" }, { status: 403 });\n"
        "  const body = await req.json();\n",
        "export async function PATCH(req: NextRequest) {\n"
        "  const session = await requireSession([PanelRole.ADMIN]);\n"
        "  if (!session) return NextResponse.json({ error: \"Forbidden\" }, { status: 403 });\n"
        "  const host = (req.headers.get(\"host\") ?? \"localhost\").split(\":\")[0].toLowerCase();\n"
        "  const body = await req.json();\n"
        "  const row = body.id ? await prisma.mediaIntegration.findUnique({ where: { id: String(body.id) } }) : null;\n"
        "  const denied = await pluginEntitlementResponse(row?.type ?? \"plex\", host);\n"
        "  if (denied) return denied;\n",
    )
    integrations.write_text(it, encoding="utf-8")
    print("patched integrations/route.ts")

# --- stats GET: statistics plugin gate ---
stats = panel / "src/app/api/admin/stats/route.ts"
if stats.exists():
    stx = stats.read_text(encoding="utf-8")
    if "pluginEntitlementResponse" not in stx:
        stx = stx.replace(
            'import { NextResponse } from "next/server";',
            'import { NextRequest, NextResponse } from "next/server";',
        )
        stx = stx.replace(
            'import { getDashboardServerMetrics, getDashboardSummary } from "@/lib/dashboard-server-metrics";',
            'import { getDashboardServerMetrics, getDashboardSummary } from "@/lib/dashboard-server-metrics";\n'
            'import { pluginEntitlementResponse } from "@/lib/plugin-entitlement";',
        )
        stx = stx.replace(
            "export async function GET() {",
            "export async function GET(req: NextRequest) {",
        )
        stx = stx.replace(
            "  if (!session) return NextResponse.json({ error: \"Forbidden\" }, { status: 403 });\n",
            "  if (!session) return NextResponse.json({ error: \"Forbidden\" }, { status: 403 });\n"
            "  const host = (req.headers.get(\"host\") ?? \"localhost\").split(\":\")[0].toLowerCase();\n"
            "  const denied = await pluginEntitlementResponse(\"statistics\", host);\n"
            "  if (denied) return denied;\n",
            1,
        )
        stats.write_text(stx, encoding="utf-8")
        print("patched stats/route.ts")

# --- cron GET: fail closed in production when CRON_SECRET unset ---
cron = panel / "src/app/api/cron/route.ts"
if cron.exists():
    ct = cron.read_text(encoding="utf-8")
    guard = '''  if (!expected) {
    if (process.env.NODE_ENV === "production") {
      return NextResponse.json({ error: "Cron not configured" }, { status: 503 });
    }
  } else if (secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

'''
    if "Cron not configured" not in ct:
        old = '''  if (expected && secret !== expected) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

'''
        if old not in ct:
            raise SystemExit("cron route auth block not found")
        ct = ct.replace(old, guard)
        cron.write_text(ct, encoding="utf-8")
        print("patched cron/route.ts")

# --- license/state.ts: remove global env license bypass ---
state_text = state.read_text(encoding="utf-8")
if "isPanelLicenseExemptEnv() || isPanelLicenseExempt(panelHost)" in state_text:
    state_text = state_text.replace(
        "isPanelLicenseExemptEnv() || isPanelLicenseExempt(panelHost)",
        "isPanelLicenseExempt(panelHost)",
    )
    state.write_text(state_text, encoding="utf-8")
    print("removed env license bypass from license/state.ts")

# --- internal/panel-hosts GET: localhost only ---
internal = panel / "src/app/api/internal/panel-hosts/route.ts"
patch_src = Path("/var/www/nexlify/deploy/panel-patches/internal-panel-hosts-route.ts")
if internal.exists() and patch_src.exists():
    current = internal.read_text(encoding="utf-8")
    patched = patch_src.read_text(encoding="utf-8")
    if "Forbidden" not in current or "export async function GET()" in current:
        internal.write_text(patched, encoding="utf-8")
        print("patched internal/panel-hosts/route.ts")
PY

echo "Rebuilding panel..."
cd "$PANEL_DIR"
npm run build
pm2 restart nexlify --update-env
pm2 save

echo "apply-patches done."
