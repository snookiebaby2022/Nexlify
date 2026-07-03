export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { warmPanelSecurityEnv } = await import("@/lib/panel-security-env");
    await warmPanelSecurityEnv();
    const { warmPanelServerEnv } = await import("@/lib/panel-server");
    await warmPanelServerEnv();
    try {
      const { getPanelDomainsSettings, syncPanelDomainsEnv } = await import("@/lib/domains");
      syncPanelDomainsEnv(await getPanelDomainsSettings());
    } catch {
      /* DB unavailable during build */
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
  }
}
