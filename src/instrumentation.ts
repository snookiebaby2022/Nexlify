export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { warmPanelSecurityEnv } = await import("@/lib/panel-security-env");
    await warmPanelSecurityEnv();
    const { warmPanelServerEnv } = await import("@/lib/panel-server");
    await warmPanelServerEnv();
    try {
      const { warmPanelDomainsEnv } = await import("@/lib/domains");
      await warmPanelDomainsEnv();
    } catch {
      /* DB unavailable during build */
    }
    // Sync NEXLIFY_LICENSE_VALID from NEXLIFY_LICENSE_KEY env var so middleware
    // can fast-path the license check without a DB/cookie round-trip.
    try {
      const { syncPanelLicenseEnvFromKey } = await import("@/lib/panel-license-env");
      syncPanelLicenseEnvFromKey();
    } catch {
      /* key parse failure — license gate will fall back to cookie check */
    }
    try {
      const { startupLicenseValidation } = await import("@/lib/license/server-guard");
      const result = await startupLicenseValidation();
      if (!result.ok) {
        console.error(`[LICENSE] Startup validation failed: ${result.reason}`);
        console.error("[LICENSE] Panel will run in limited mode until license is validated.");
      } else {
        console.log(`[LICENSE] Startup validation passed (${result.reason})`);
      }
    } catch (e) {
      console.error("[LICENSE] Startup validation error:", e);
    }
    try {
      const { ensurePanelUpdateAutoApplyOffByDefault, ensureAddonSettingsHealed, ensureInstantStreamingDefaults } =
        await import("@/lib/panel-settings");
      await ensurePanelUpdateAutoApplyOffByDefault();
      await ensureAddonSettingsHealed();
      await ensureInstantStreamingDefaults();
    } catch {
      /* DB unavailable during build / early boot */
    }
  }
}
