#!/usr/bin/env npx tsx
/** Persist the same 75% resource guard threshold shown in the admin UI. */
import { getSettingGroup, setSettingGroup } from "../src/lib/panel-settings";

const raw = Number(process.env.NEXLIFY_RESOURCE_HEADROOM_PERCENT || process.argv[2] || 75);
const threshold = Math.max(50, Math.min(90, Number.isFinite(raw) ? Math.round(raw) : 75));

async function main() {
  const current = await getSettingGroup("server-guard");
  await setSettingGroup("server-guard", {
    ...current,
    serverGuardEnabled: true,
    guardResourceExhaustion: true,
    guardCpuThreshold: threshold,
    guardRamThreshold: threshold,
    guardCooldownSeconds: 60,
  });
  console.log(`RESOURCE_GUARD_SETTINGS_OK threshold=${threshold}%`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
