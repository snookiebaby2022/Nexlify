/**
 * Activate NEXLIFY_LICENSE_KEY after install (online + DB). Non-fatal on failure.
 * Usage: npx tsx scripts/activate-install-license.ts
 */
import "dotenv/config";
import { activateLicenseKey } from "@/lib/license/state";
import { syncPanelLicenseEnvFromKey } from "@/lib/panel-license-env";

async function main() {
  const key = process.env.NEXLIFY_LICENSE_KEY?.trim();
  const host = process.env.PANEL_PRIMARY_DOMAIN?.trim() || "localhost";
  if (!key) {
    console.log("No NEXLIFY_LICENSE_KEY — skip activation");
    return;
  }

  const result = await activateLicenseKey(key, host);
  if (!result.ok) {
    console.warn(`License activation skipped: ${result.error}`);
    syncPanelLicenseEnvFromKey();
    process.exit(0);
  }

  syncPanelLicenseEnvFromKey();
  console.log(`License activated for ${host} (tier ${result.status.tier})`);

  try {
    const { registerPanelWithVendor } = await import("@/lib/license/remote-sync");
    await registerPanelWithVendor(key, host);
    console.log("Panel registered with nexlify.live for remote license sync");
  } catch {
    console.warn("Panel registration with nexlify.live skipped (non-fatal)");
  }
}

main().catch((err) => {
  console.warn(err instanceof Error ? err.message : err);
  process.exit(0);
});
