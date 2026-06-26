#!/usr/bin/env bash
set -euo pipefail

PANEL="${PANEL_ROOT:-/home/nexlify-panel}"
PATCHES="$(cd "$(dirname "$0")" && pwd)"

cp "$PATCHES/billing-addon-sync.ts" "$PANEL/src/lib/billing-addon-sync.ts"

python3 <<'PY'
from pathlib import Path

panel = Path("/home/nexlify-panel")

pe = panel / "src/lib/plugin-entitlement.ts"
text = pe.read_text()
if "syncAddonLicensesFromBilling" not in text:
    text = text.replace(
        'import { isPanelDemoHost } from "@/lib/panel-demo-host";',
        'import { isPanelDemoHost } from "@/lib/panel-demo-host";\n'
        'import {\n'
        '  getStoredPanelLicenseKey,\n'
        '  syncAddonLicensesFromBilling,\n'
        '} from "@/lib/billing-addon-sync";',
    )
    text = text.replace(
        "  const service = pluginServiceId(typeOrRoute);\n"
        "  if (await hasActiveAddonLicense(service)) return { ok: true };",
        "  const service = pluginServiceId(typeOrRoute);\n"
        "  if (await hasActiveAddonLicense(service)) return { ok: true };\n\n"
        "  const panelKey = await getStoredPanelLicenseKey();\n"
        "  if (panelKey) {\n"
        "    await syncAddonLicensesFromBilling(panelKey);\n"
        "    if (await hasActiveAddonLicense(service)) return { ok: true };\n"
        "  }",
    )
    pe.write_text(text)

state = panel / "src/lib/license/state.ts"
st = state.read_text()
if "syncAddonLicensesFromBilling" not in st:
    st = st.replace(
        '  await saveLicenseActivation(key, payload, instanceId);\n\n'
        '  return {',
        '  await saveLicenseActivation(key, payload, instanceId);\n\n'
        '  try {\n'
        '    const { syncAddonLicensesFromBilling } = await import("@/lib/billing-addon-sync");\n'
        '    await syncAddonLicensesFromBilling(key);\n'
        '  } catch {\n'
        '    /* billing addon sync optional */\n'
        '  }\n\n'
        '  return {',
    )
    if "syncAddonLicensesFromBilling" not in st:
        st = st.replace(
            "  if (process.env.NEXLIFY_LICENSE_API_URL) {",
            '  try {\n'
            '    const keyRow = await prisma.panelSetting.findUnique({ where: { key: "license.raw" } });\n'
            '    const syncKey = keyRow?.value?.trim() ?? process.env.NEXLIFY_LICENSE_KEY?.trim();\n'
            '    if (syncKey) {\n'
            '      const { syncAddonLicensesFromBilling } = await import("@/lib/billing-addon-sync");\n'
            '      await syncAddonLicensesFromBilling(syncKey);\n'
            '    }\n'
            '  } catch {\n'
            '    /* optional */\n'
            '  }\n\n'
            "  if (process.env.NEXLIFY_LICENSE_API_URL) {",
        )
    state.write_text(st)

print("WHMCS addon panel sync applied")
PY

cd "$PANEL"
npm run build
pm2 restart nexlify
